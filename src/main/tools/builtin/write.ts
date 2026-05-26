/**
 * Built-in Tool: Write
 *
 * Writes content to a file with support for:
 * - Creating new files
 * - Overwriting existing files
 * - Directory creation (if parent doesn't exist)
 */

import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { findSandboxRootForPath, getSandboxBoundary, resolveToolPath } from '../core/sandbox.js'
import { Permission } from '../../permission/index.js'
import { createTwoFilesPatch } from 'diff'
import {
  countLineChanges,
  readTextFileSnapshot,
  type TextFileSnapshot,
} from './file-snapshot.js'

function filePermissionPattern(filePath: string): string {
  return path.join(path.dirname(filePath), '*')
}

const MAX_REVALIDATION_ATTEMPTS = 5

/**
 * Write Tool Metadata
 */
export interface WriteMetadata {
  filePath: string
  bytesWritten: number
  lineCount: number
  created: boolean
  diff?: string
  additions?: number
  deletions?: number
  originalContentHash?: string
  [key: string]: unknown
}

interface WritePlan {
  snapshot: TextFileSnapshot
  bytesWritten: number
  lineCount: number
  created: boolean
  diff: string
  additions: number
  deletions: number
  originalContentHash: string
}

/**
 * Write Tool Parameters Schema
 */
const WriteParameters = z.object({
  file_path: z
    .string()
    .describe('The absolute path to the file to write (must be absolute, not relative)'),
  content: z
    .string()
    .describe('The content to write to the file'),
})

function buildWritePlan(
  resolvedPath: string,
  content: string,
  bytesWritten: number,
  lineCount: number,
  snapshot: TextFileSnapshot,
): WritePlan {
  const diff = createTwoFilesPatch(resolvedPath, resolvedPath, snapshot.content, content)
  const { additions, deletions } = countLineChanges(snapshot.content, content)

  return {
    snapshot,
    bytesWritten,
    lineCount,
    created: !snapshot.exists,
    diff,
    additions,
    deletions,
    originalContentHash: snapshot.hash,
  }
}

/**
 * Write Tool Definition
 */
export const WriteTool = Tool.define<typeof WriteParameters, WriteMetadata>('write', {
  name: 'Write',
  description: `Writes a file to the local filesystem.

Usage:
- The file_path parameter must be an absolute path
- This tool will overwrite the existing file if there is one
- Parent directories will be created if they don't exist
- ALWAYS prefer editing existing files using the Edit tool
- NEVER create documentation files unless explicitly requested`,
  category: 'builtin',
  enabled: true,
  autoExecute: false, // Requires confirmation for file writes
  permissionGuard: 'permission-gated',

  parameters: WriteParameters,

  async execute(args, ctx) {
    const { file_path, content } = args

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

    // Calculate stats that do not depend on the current file contents.
    const bytesWritten = Buffer.byteLength(content, 'utf-8')
    const lineCount = content.split('\n').length

    ctx.metadata({
      title: path.basename(resolvedPath),
      metadata: {
        filePath: resolvedPath,
        bytesWritten,
        lineCount,
      },
    })

    // Wait before reading the current file and building the write preview so
    // concurrent mutating tools do not base their final write on stale content.
    await ctx.beforeSideEffect?.()

    const emitPlanMetadata = (plan: WritePlan) => {
      ctx.metadata({
        title: path.basename(resolvedPath),
        metadata: {
          filePath: resolvedPath,
          bytesWritten,
          lineCount,
          created: plan.created,
          diff: plan.diff,
          additions: plan.additions,
          deletions: plan.deletions,
          originalContent: plan.snapshot.content,  // For rollback support (empty string for new files)
          originalContentHash: plan.originalContentHash,
        },
      })
    }

    const askPermission = async (plan: WritePlan, reconfirm: boolean) => {
      await Permission.ask({
        type: 'file_write',
        pattern: filePermissionPattern(resolvedPath),
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        callId: ctx.toolCallId,
        title: plan.created
          ? `${reconfirm ? 'Re-confirm create file' : 'Create new file'}: ${path.basename(resolvedPath)}${isExternal ? ' (外部目录)' : ''}`
          : `${reconfirm ? 'Re-confirm overwrite file' : 'Overwrite file'}: ${path.basename(resolvedPath)}${isExternal ? ' (外部目录)' : ''}`,
        workingDirectory: permissionRoot,
        metadata: {
          filePath: resolvedPath,
          diff: plan.diff,
          additions: plan.additions,
          deletions: plan.deletions,
          bytesWritten,
          lineCount,
          operation: plan.created ? 'create' : 'overwrite',
          originalContentHash: plan.originalContentHash,
          revalidated: reconfirm,
          isExternal,
          boundary: isExternal ? boundary : undefined,
        },
      })
    }

    let approvedPlan = buildWritePlan(
      resolvedPath,
      content,
      bytesWritten,
      lineCount,
      await readTextFileSnapshot(resolvedPath),
    )

    emitPlanMetadata(approvedPlan)
    await askPermission(approvedPlan, false)

    let revalidationAttempts = 0
    while (true) {
      const latestSnapshot = await readTextFileSnapshot(resolvedPath)
      if (latestSnapshot.hash === approvedPlan.originalContentHash) {
        break
      }

      revalidationAttempts++
      if (revalidationAttempts > MAX_REVALIDATION_ATTEMPTS) {
        throw new Error(`File changed repeatedly after write approval: ${resolvedPath}. Please retry the write.`)
      }

      const revalidatedPlan = buildWritePlan(
        resolvedPath,
        content,
        bytesWritten,
        lineCount,
        latestSnapshot,
      )
      emitPlanMetadata(revalidatedPlan)
      await askPermission(revalidatedPlan, true)
      approvedPlan = revalidatedPlan
    }

    // User approved - ensure parent directory exists
    const parentDir = path.dirname(resolvedPath)
    await fs.mkdir(parentDir, { recursive: true })

    // Write the file
    await fs.writeFile(resolvedPath, content, 'utf-8')

    const metadata: WriteMetadata = {
      filePath: resolvedPath,
      bytesWritten,
      lineCount,
      created: approvedPlan.created,
      diff: approvedPlan.diff,
      additions: approvedPlan.additions,
      deletions: approvedPlan.deletions,
      originalContent: approvedPlan.snapshot.content,  // For rollback support
      originalContentHash: approvedPlan.originalContentHash,
    }

    const action = approvedPlan.created ? 'Created' : 'Updated'

    return {
      title: path.basename(resolvedPath),
      output: `Successfully ${action.toLowerCase()} ${resolvedPath}\n${bytesWritten} bytes written (${lineCount} lines)`,
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid write parameters:\n${issues.join('\n')}`
  },
})
