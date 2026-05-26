/**
 * Edit Tool
 *
 * Performs exact string replacements in files using a chain of
 * 9 replacement strategies for intelligent fuzzy matching.
 */

import { z } from 'zod'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { replace, normalizeLineEndings, trimDiff } from '../core/replacers.js'
import { findSandboxRootForPath, getSandboxBoundary, resolveToolPath } from '../core/sandbox.js'
import { Permission } from '../../permission/index.js'
import {
  countLineChanges,
  readTextFileSnapshot,
  type TextFileSnapshot,
} from './file-snapshot.js'

// Diff library for generating unified diffs
import { createTwoFilesPatch } from 'diff'

function filePermissionPattern(filePath: string): string {
  return path.join(path.dirname(filePath), '*')
}

function explicitEditPermissionPattern(filePath: string, plan: EditPlan): string {
  const digest = crypto
    .createHash('sha256')
    .update(filePath)
    .update('\0')
    .update(plan.originalContentHash)
    .update('\0')
    .update(plan.diff)
    .digest('hex')
    .slice(0, 16)
  return `explicit-file-edit:${filePath}:${digest}`
}

const MAX_REVALIDATION_ATTEMPTS = 5
const LARGE_DELETION_MIN_LINES = 5
const LARGE_DELETION_RATIO = 3

/**
 * Edit Tool Metadata
 */
export interface EditMetadata {
  filePath: string
  diff: string
  additions: number
  deletions: number
  originalContentHash?: string
  [key: string]: unknown  // Index signature for ToolMetadata compatibility
}

interface EditPlan {
  snapshot: TextFileSnapshot
  contentNew: string
  diff: string
  additions: number
  deletions: number
  operation: 'create' | 'replace' | 'edit'
  originalContentHash: string
}

interface EditRisk {
  requiresExplicitPermission: boolean
  blocked?: boolean
  kind?: 'large_deletion' | 'truncation'
  reason?: string
}

/**
 * Edit Tool Parameters Schema
 */
const EditParameters = z.object({
  file_path: z
    .string()
    .describe('The absolute path to the file to modify'),
  old_string: z
    .string()
    .describe('The text to replace'),
  new_string: z
    .string()
    .describe('The text to replace it with (must be different from old_string)'),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe('Replace all occurrences of old_string (default false)'),
})

function buildEditPlan(
  resolvedPath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
  snapshot: TextFileSnapshot,
): EditPlan {
  if (oldString === '') {
    const contentNew = newString
    const diff = trimDiff(
      createTwoFilesPatch(resolvedPath, resolvedPath, snapshot.content, contentNew)
    )
    const { additions, deletions } = countLineChanges(snapshot.content, contentNew)

    return {
      snapshot,
      contentNew,
      diff,
      additions,
      deletions,
      operation: snapshot.exists ? 'replace' : 'create',
      originalContentHash: snapshot.hash,
    }
  }

  if (!snapshot.exists) {
    throw new Error(`File not found: ${resolvedPath}`)
  }

  let contentNew: string
  try {
    contentNew = replace(snapshot.content, oldString, newString, replaceAll)
  } catch (error: any) {
    throw new Error(`Failed to edit ${resolvedPath}: ${error.message}`)
  }

  const diff = trimDiff(
    createTwoFilesPatch(
      resolvedPath,
      resolvedPath,
      normalizeLineEndings(snapshot.content),
      normalizeLineEndings(contentNew)
    )
  )
  const { additions, deletions } = countLineChanges(snapshot.content, contentNew)

  return {
    snapshot,
    contentNew,
    diff,
    additions,
    deletions,
    operation: 'edit',
    originalContentHash: snapshot.hash,
  }
}

function getEditRisk(plan: EditPlan, oldString: string, newString: string): EditRisk {
  if (plan.operation !== 'edit') return { requiresExplicitPermission: false }
  if (plan.deletions < LARGE_DELETION_MIN_LINES) return { requiresExplicitPermission: false }

  const normalizedOld = normalizeLineEndings(oldString).trim()
  const normalizedNew = normalizeLineEndings(newString).trim()
  const isTruncation = normalizedNew !== '' &&
    normalizedOld !== normalizedNew &&
    (normalizedOld.startsWith(normalizedNew) || normalizedOld.endsWith(normalizedNew))
  if (isTruncation) {
    return {
      requiresExplicitPermission: false,
      blocked: true,
      kind: 'truncation',
      reason: `Replacement keeps only a prefix/suffix and removes ${plan.deletions} lines.`,
    }
  }

  if (plan.deletions >= Math.max(plan.additions * LARGE_DELETION_RATIO, LARGE_DELETION_MIN_LINES)) {
    return {
      requiresExplicitPermission: true,
      kind: 'large_deletion',
      reason: `Edit removes ${plan.deletions} lines and adds ${plan.additions} lines.`,
    }
  }

  return { requiresExplicitPermission: false }
}

/**
 * Edit Tool Definition
 */
export const EditTool = Tool.define<typeof EditParameters, EditMetadata>('edit', {
  name: 'Edit',
  description: `Performs exact string replacements in files.

Usage:
- The file_path parameter must be an absolute path
- old_string must be the smallest text that is still unique in the file (or use replace_all for all occurrences)
- new_string must be different from old_string
- Preserves exact indentation from the file
- Uses intelligent fuzzy matching when exact match fails
- Do not include large unchanged regions just to connect distant changes; make separate targeted edits instead
- Do not replace a large old_string with only its prefix or suffix; that truncates content and will be rejected

The edit will FAIL if old_string is not unique in the file. Provide just enough surrounding context to make it unique, but keep the edited region small and surgical.`,
  category: 'builtin',
  enabled: true,
  autoExecute: false, // Requires confirmation for file edits
  permissionGuard: 'permission-gated',

  parameters: EditParameters,

  async execute(args, ctx) {
    const { file_path, old_string, new_string, replace_all } = args

    // Resolve path (don't request permission yet - will do after generating diff)
    const resolvedPath = resolveToolPath(file_path, ctx.workingDirectory)

    // Check if path is outside sandbox boundary
    const boundary = getSandboxBoundary(ctx.workingDirectory)
    const matchedRoot = findSandboxRootForPath(
      resolvedPath,
      ctx.workingDirectory,
      ctx.workingDirectoryRoots,
    )
    const permissionRoot = matchedRoot ?? boundary
    const isExternal = !matchedRoot

    // Validate old_string and new_string are different
    if (old_string === new_string) {
      throw new Error('old_string and new_string must be different')
    }

    // Update metadata with initial state
    ctx.metadata({
      title: `Editing ${path.basename(resolvedPath)}`,
      metadata: {
        filePath: resolvedPath,
        diff: '',
        additions: 0,
        deletions: 0,
      },
    })

    // Serialize the whole read/preview/permission/write plan for mutating tools.
    // Otherwise concurrent edits can compute contentNew from the same stale file
    // snapshot and the later write can silently undo an earlier edit.
    await ctx.beforeSideEffect?.()

    const emitPlanMetadata = (plan: EditPlan) => {
      ctx.metadata({
        title: `Editing ${path.basename(resolvedPath)}`,
        metadata: {
          filePath: resolvedPath,
          diff: plan.diff,
          additions: plan.additions,
          deletions: plan.deletions,
          originalContent: plan.snapshot.content,  // For rollback support
          originalContentHash: plan.originalContentHash,
        },
      })
    }

    const askPermission = async (plan: EditPlan, reconfirm: boolean) => {
      const risk = getEditRisk(plan, old_string, new_string)
      if (risk.blocked) {
        throw new Error(
          `Refusing potentially destructive edit for ${resolvedPath}: ${risk.reason} ` +
          'Use a narrower old_string/new_string pair that changes only the intended lines.'
        )
      }
      const operationTitle = plan.operation === 'create'
        ? `${reconfirm ? 'Re-confirm create file' : 'Create new file'}: ${path.basename(resolvedPath)}${isExternal ? ' (外部目录)' : ''}`
        : plan.operation === 'replace'
          ? `${reconfirm ? 'Re-confirm replace content' : 'Replace entire content'}: ${path.basename(resolvedPath)}${isExternal ? ' (外部目录)' : ''}`
          : `${reconfirm ? 'Re-confirm edit file' : 'Edit file'}: ${path.basename(resolvedPath)}${isExternal ? ' (外部目录)' : ''}`
      await Permission.ask({
        type: risk.requiresExplicitPermission ? 'file_destructive_edit' : 'file_edit',
        pattern: risk.requiresExplicitPermission
          ? explicitEditPermissionPattern(resolvedPath, plan)
          : filePermissionPattern(resolvedPath),
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        callId: ctx.toolCallId,
        title: risk.requiresExplicitPermission
          ? `Confirm large deletion: ${path.basename(resolvedPath)}${isExternal ? ' (外部目录)' : ''}`
          : operationTitle,
        workingDirectory: permissionRoot,
        metadata: {
          filePath: resolvedPath,
          diff: plan.diff,
          additions: plan.additions,
          deletions: plan.deletions,
          operation: plan.operation,
          originalContentHash: plan.originalContentHash,
          revalidated: reconfirm,
          risk: risk.kind,
          riskReason: risk.reason,
          requiresExplicitPermission: risk.requiresExplicitPermission,
          isExternal,
          boundary: isExternal ? boundary : undefined,
        },
      })
    }

    let approvedPlan = buildEditPlan(
      resolvedPath,
      old_string,
      new_string,
      replace_all,
      await readTextFileSnapshot(resolvedPath),
    )

    emitPlanMetadata(approvedPlan)
    await askPermission(approvedPlan, false)

    let revalidationAttempts = 0
    while (true) {
      const latestSnapshot = await readTextFileSnapshot(resolvedPath)
      if (latestSnapshot.hash === approvedPlan.originalContentHash) {
        await fs.writeFile(resolvedPath, approvedPlan.contentNew, 'utf-8')
        break
      }

      revalidationAttempts++
      if (revalidationAttempts > MAX_REVALIDATION_ATTEMPTS) {
        throw new Error(`File changed repeatedly after edit approval: ${resolvedPath}. Please retry the edit.`)
      }

      let revalidatedPlan: EditPlan
      try {
        revalidatedPlan = buildEditPlan(
          resolvedPath,
          old_string,
          new_string,
          replace_all,
          latestSnapshot,
        )
      } catch (error: any) {
        throw new Error(`File changed after approval and the edit could not be re-applied to latest content: ${error.message}. Please retry.`)
      }

      if (revalidatedPlan.diff !== approvedPlan.diff) {
        emitPlanMetadata(revalidatedPlan)
        await askPermission(revalidatedPlan, true)
      }
      approvedPlan = revalidatedPlan
    }

    const contentOld = approvedPlan.snapshot.content

    // Build output message
    let output = approvedPlan.operation === 'create'
      ? `Created new file: ${resolvedPath}`
      : approvedPlan.operation === 'replace'
        ? `Replaced entire content of: ${resolvedPath}`
        : `Successfully edited ${resolvedPath}`
    if (approvedPlan.operation === 'edit' && replace_all) {
      // Count how many replacements were made
      const occurrences = (contentOld.match(new RegExp(escapeRegExp(old_string), 'g')) || []).length
      output += ` (replaced ${occurrences} occurrence${occurrences !== 1 ? 's' : ''})`
    }

    return {
      title: approvedPlan.operation === 'edit'
        ? `Edited ${path.basename(resolvedPath)}`
        : `Created/replaced ${path.basename(resolvedPath)}`,
      output,
      metadata: {
        filePath: resolvedPath,
        diff: approvedPlan.diff,
        additions: approvedPlan.additions,
        deletions: approvedPlan.deletions,
        originalContent: contentOld,  // For rollback support
        originalContentHash: approvedPlan.originalContentHash,
      },
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid edit parameters:\n${issues.join('\n')}`
  },
})

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
