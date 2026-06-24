/**
 * Edit Tool
 *
 * Performs exact, targeted text replacements in files.
 * Inspired by Pi Coding Agent's edit tool: multiple edits per call, exact
 * unique matching, overlap detection, shared preview/apply logic, BOM and line
 * ending preservation.
 */

import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { trimDiff } from '../core/replacers.js'
import { findSandboxRootForPath, getSandboxBoundary, resolveToolPath } from '../core/sandbox.js'
import { previewExactEdits, type ExactEdit } from '../core/edit-engine.js'
import { withFileMutationQueue } from '../core/file-mutation-queue.js'
import { recordFileMutationAudit } from '../core/file-mutation-audit.js'
import { getFileMutationsDir } from '../../stores/paths.js'
import {
  countLineChanges,
  readTextFileSnapshot,
  type TextFileSnapshot,
} from './file-snapshot.js'
import type { JsonObjectProperty } from '../../../shared/json.js'

function filePermissionPattern(targetPath: string): string {
  return path.join(path.dirname(targetPath), '*')
}

const MAX_REVALIDATION_ATTEMPTS = 5
const LARGE_DELETION_MIN_LINES = 6
const LARGE_DELETION_RATIO = 5

/**
 * Edit Tool Metadata
 */
export interface EditMetadata {
  path: string
  diff: string
  additions: number
  deletions: number
  originalContentHash?: string
  [key: string]: JsonObjectProperty
}

interface EditPlan {
  snapshot: TextFileSnapshot
  contentNew: string
  diff: string
  additions: number
  deletions: number
  originalContentHash: string
}

interface EditRisk {
  requiresExplicitPermission: boolean
  kind?: 'large_deletion'
  reason?: string
}

const ReplaceEditParameters = z.object({
  oldText: z
    .string()
    .describe('Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.'),
  newText: z
    .string()
    .describe('Replacement text for this targeted edit.'),
})

/**
 * Edit Tool Parameters Schema
 */
const EditParameters = z.object({
  path: z
    .string()
    .describe('Path to the file to edit (relative or absolute)'),
  edits: z
    .array(ReplaceEditParameters)
    .min(1)
    .describe('One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits. If two changes touch the same block or nearby lines, merge them into one edit instead.'),
})

function buildEditPlan(
  resolvedPath: string,
  edits: ExactEdit[],
  snapshot: TextFileSnapshot,
): EditPlan {
  if (!snapshot.exists) {
    throw new Error(`File not found: ${resolvedPath}`)
  }

  let preview
  try {
    preview = previewExactEdits(snapshot.content, edits, resolvedPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to edit ${resolvedPath}: ${message}`)
  }

  const { additions, deletions } = countLineChanges(preview.baseContent, preview.newContent)

  return {
    snapshot,
    contentNew: preview.finalContent,
    diff: trimDiff(preview.diff),
    additions,
    deletions,
    originalContentHash: snapshot.hash,
  }
}

function getEditRisk(plan: EditPlan): EditRisk {
  if (plan.deletions >= LARGE_DELETION_MIN_LINES || plan.deletions >= plan.additions * LARGE_DELETION_RATIO) {
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
  description: 'Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.',
  category: 'builtin',
  enabled: true,
  autoExecute: false,
  permissionGuard: 'permission-gated',
  executionMode: 'sequential',
  renderKind: 'diff',

  parameters: EditParameters,

  async analyze(args, ctx) {
    const resolvedPath = resolveToolPath(args.path, ctx.workingDirectory)
    const boundary = getSandboxBoundary(ctx.workingDirectory)
    const matchedRoot = findSandboxRootForPath(resolvedPath, ctx.workingDirectory, ctx.workingDirectoryRoots)
    const plan = buildEditPlan(resolvedPath, args.edits, await readTextFileSnapshot(resolvedPath))
    const risk = getEditRisk(plan)
    return {
      effects: [{
        kind: risk.requiresExplicitPermission ? 'file_destructive_edit' as const : 'file_edit' as const,
        resources: [filePermissionPattern(resolvedPath)],
        barrier: true,
        external: !matchedRoot,
        metadata: {
          path: resolvedPath,
          additions: plan.additions,
          deletions: plan.deletions,
          originalContentHash: plan.originalContentHash,
          risk: risk.kind,
          riskReason: risk.reason,
          isExternal: !matchedRoot,
          boundary: matchedRoot ? undefined : boundary,
        },
      }],
      preview: {
        title: `Edit ${path.basename(resolvedPath)}`,
        path: resolvedPath,
        diff: plan.diff,
        additions: plan.additions,
        deletions: plan.deletions,
      },
    }
  },

  async execute(args, ctx) {
    const { path: inputPath, edits } = args

    const resolvedPath = resolveToolPath(inputPath, ctx.workingDirectory)

    ctx.updateResult?.({
      content: [{ type: 'text', text: `Preparing edit for ${resolvedPath}...` }],
      details: { phase: 'preparing', path: resolvedPath, replacements: edits.length },
    })

    ctx.metadata({
      title: `Editing ${path.basename(resolvedPath)}`,
      metadata: {
        path: resolvedPath,
        diff: '',
        additions: 0,
        deletions: 0,
      },
    })

    // Preserve model-order side-effect semantics before entering the per-file
    // mutation queue. The queue then protects this file across sessions/tools.
    await ctx.beforeSideEffect?.()

    const throwIfAborted = () => {
      if (ctx.abortSignal?.aborted) throw new Error('Operation aborted')
    }
    throwIfAborted()

    return await withFileMutationQueue(resolvedPath, async () => {
      throwIfAborted()

      const emitPlanMetadata = (plan: EditPlan) => {
        ctx.updateResult?.({
          content: [{ type: 'text', text: plan.diff || `Preparing ${resolvedPath}` }],
          details: {
            phase: 'preview',
            path: resolvedPath,
            additions: plan.additions,
            deletions: plan.deletions,
            replacements: edits.length,
          },
        })
        ctx.metadata({
          title: `Editing ${path.basename(resolvedPath)}`,
          metadata: {
            path: resolvedPath,
            diff: plan.diff,
            additions: plan.additions,
            deletions: plan.deletions,
            originalContent: plan.snapshot.content,
            originalContentHash: plan.originalContentHash,
          },
        })
      }

      const policyEffect = ctx.approvedAnalysis?.effects.find(effect =>
        effect.kind === 'file_edit' || effect.kind === 'file_destructive_edit'
      )
      const policyOriginalHash = policyEffect?.metadata?.originalContentHash
      const policyDiff = ctx.approvedAnalysis?.preview?.diff

      let approvedPlan = buildEditPlan(
        resolvedPath,
        edits,
        await readTextFileSnapshot(resolvedPath),
      )
      throwIfAborted()

      if (typeof policyOriginalHash === 'string' && approvedPlan.originalContentHash !== policyOriginalHash) {
        if (policyDiff && approvedPlan.diff !== policyDiff) {
          emitPlanMetadata(approvedPlan)
          throw new Error(`File changed after permission approval and the resulting edit diff changed: ${resolvedPath}. Please retry the edit.`)
        }
      }

      emitPlanMetadata(approvedPlan)

      let revalidationAttempts = 0
      while (true) {
        const latestSnapshot = await readTextFileSnapshot(resolvedPath)
        throwIfAborted()
        if (latestSnapshot.hash === approvedPlan.originalContentHash) {
          await fs.writeFile(resolvedPath, approvedPlan.contentNew, 'utf-8')
          throwIfAborted()
          break
        }

        revalidationAttempts++
        if (revalidationAttempts > MAX_REVALIDATION_ATTEMPTS) {
          throw new Error(`File changed repeatedly after edit approval: ${resolvedPath}. Please retry the edit.`)
        }

        let revalidatedPlan: EditPlan
        try {
          revalidatedPlan = buildEditPlan(resolvedPath, edits, latestSnapshot)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new Error(`File changed after approval and the edit could not be re-applied to latest content: ${message}. Please retry.`)
        }

        if (revalidatedPlan.diff !== approvedPlan.diff) {
          emitPlanMetadata(revalidatedPlan)
          throw new Error(`File changed after permission approval and the resulting edit diff changed: ${resolvedPath}. Please retry the edit.`)
        }
        approvedPlan = revalidatedPlan
      }

      const contentOld = approvedPlan.snapshot.content
      const audit = await recordFileMutationAudit({
        auditDir: getFileMutationsDir(),
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        toolCallId: ctx.toolCallId,
        operation: 'edit',
        path: resolvedPath,
        beforeExists: true,
        beforeContent: contentOld,
        afterContent: approvedPlan.contentNew,
        diff: approvedPlan.diff,
        metadata: {
          additions: approvedPlan.additions,
          deletions: approvedPlan.deletions,
          replacements: edits.length,
        },
      })
      ctx.metadata({
        metadata: {
          path: resolvedPath,
          diff: approvedPlan.diff,
          additions: approvedPlan.additions,
          deletions: approvedPlan.deletions,
          originalContent: contentOld,
          originalContentHash: approvedPlan.originalContentHash,
          auditId: audit.id,
          auditPath: audit.path,
          afterContentHash: audit.afterHash,
        },
      })

      const output = `Successfully edited ${resolvedPath} (${edits.length} replacement${edits.length === 1 ? '' : 's'})`
      ctx.updateResult?.({
        content: [{ type: 'text', text: output }, { type: 'file', path: resolvedPath }],
        details: {
          phase: 'ready',
          path: resolvedPath,
          diff: approvedPlan.diff,
          additions: approvedPlan.additions,
          deletions: approvedPlan.deletions,
          replacements: edits.length,
          auditId: audit.id,
          auditPath: audit.path,
        },
      })

      return {
        title: `Edited ${path.basename(resolvedPath)}`,
        output,
        metadata: {
          path: resolvedPath,
          diff: approvedPlan.diff,
          additions: approvedPlan.additions,
          deletions: approvedPlan.deletions,
          originalContent: contentOld,
          originalContentHash: approvedPlan.originalContentHash,
          auditId: audit.id,
          auditPath: audit.path,
          afterContentHash: audit.afterHash,
        },
      }
    })
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid edit parameters:\n${issues.join('\n')}`
  },
})
