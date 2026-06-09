/**
 * Built-in Tool: Write
 *
 * Creates or completely overwrites a file. The implementation favors mechanical
 * reliability: preview before permission, hash revalidation after permission,
 * and file-level mutation serialization for the final read/approve/write plan.
 */

import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { findSandboxRootForPath, getSandboxBoundary, resolveToolPath } from '../core/sandbox.js'
import { withFileMutationQueue } from '../core/file-mutation-queue.js'
import { recordFileMutationAudit } from '../core/file-mutation-audit.js'
import { getFileMutationsDir } from '../../stores/paths.js'
import { createTwoFilesPatch } from 'diff'
import {
  countLineChanges,
  readTextFileSnapshot,
  type TextFileSnapshot,
} from './file-snapshot.js'

function filePermissionPattern(targetPath: string): string {
  return path.join(path.dirname(targetPath), '*')
}

const MAX_REVALIDATION_ATTEMPTS = 5

/**
 * Write Tool Metadata
 */
export interface WriteResultMetadata {
  phase?: 'preparing' | 'preview' | 'ready'
  path?: string
  bytesWritten?: number
  lineCount?: number
  created?: boolean
  diff?: string
  additions?: number
  deletions?: number
  originalContent?: string
  originalContentHash?: string
  auditId?: string
  auditPath?: string
  afterContentHash?: string
  [key: string]: unknown
}

export interface WriteMetadata extends WriteResultMetadata {
  path: string
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
  path: z
    .string()
    .describe('Path to the file to write (relative or absolute)'),
  content: z
    .string()
    .describe('Content to write to the file'),
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
  description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
  category: 'builtin',
  enabled: true,
  autoExecute: false, // Requires confirmation for file writes
  permissionGuard: 'permission-gated',
  executionMode: 'sequential',
  renderKind: 'diff',
  promptSnippet: 'Create or overwrite files',
  promptGuidelines: ['Use write only for new files or complete rewrites.'],

  parameters: WriteParameters,

  async analyze(args, ctx) {
    const resolvedPath = resolveToolPath(args.path, ctx.workingDirectory)
    const boundary = getSandboxBoundary(ctx.workingDirectory)
    const matchedRoot = findSandboxRootForPath(resolvedPath, ctx.workingDirectory, ctx.workingDirectoryRoots)
    const bytesWritten = Buffer.byteLength(args.content, 'utf-8')
    const lineCount = args.content.split('\n').length
    const plan = buildWritePlan(resolvedPath, args.content, bytesWritten, lineCount, await readTextFileSnapshot(resolvedPath))
    return {
      effects: [{
        kind: 'file_write' as const,
        resources: [filePermissionPattern(resolvedPath)],
        barrier: true,
        external: !matchedRoot,
        metadata: {
          path: resolvedPath,
          created: plan.created,
          additions: plan.additions,
          deletions: plan.deletions,
          originalContentHash: plan.originalContentHash,
          isExternal: !matchedRoot,
          boundary: matchedRoot ? undefined : boundary,
        },
      }],
      preview: {
        title: `${plan.created ? 'Create' : 'Overwrite'} ${path.basename(resolvedPath)}`,
        path: resolvedPath,
        diff: plan.diff,
        additions: plan.additions,
        deletions: plan.deletions,
      },
    }
  },

  async execute(args, ctx) {
    const { path: inputPath, content } = args

    const resolvedPath = resolveToolPath(inputPath, ctx.workingDirectory)

    const bytesWritten = Buffer.byteLength(content, 'utf-8')
    const lineCount = content.split('\n').length

    ctx.updateResult?.({
      content: [{ type: 'text', text: `Preparing write to ${resolvedPath}...` }],
      details: { phase: 'preparing', path: resolvedPath, bytesWritten, lineCount },
    })

    ctx.metadata({
      title: path.basename(resolvedPath),
      metadata: {
        path: resolvedPath,
        bytesWritten,
        lineCount,
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

      const emitPlanMetadata = (plan: WritePlan) => {
        ctx.updateResult?.({
          content: [{ type: 'text', text: plan.diff || `Preparing ${resolvedPath}` }],
          details: {
            phase: 'preview',
            path: resolvedPath,
            bytesWritten,
            lineCount,
            created: plan.created,
            additions: plan.additions,
            deletions: plan.deletions,
          },
        })
        ctx.metadata({
          title: path.basename(resolvedPath),
          metadata: {
            path: resolvedPath,
            bytesWritten,
            lineCount,
            created: plan.created,
            diff: plan.diff,
            additions: plan.additions,
            deletions: plan.deletions,
            originalContent: plan.snapshot.content,
            originalContentHash: plan.originalContentHash,
          },
        })
      }

      const policyEffect = ctx.approvedAnalysis?.effects.find(effect => effect.kind === 'file_write')
      const policyOriginalHash = policyEffect?.metadata?.originalContentHash
      const policyDiff = ctx.approvedAnalysis?.preview?.diff

      const approvedPlan = buildWritePlan(
        resolvedPath,
        content,
        bytesWritten,
        lineCount,
        await readTextFileSnapshot(resolvedPath),
      )
      throwIfAborted()

      if (typeof policyOriginalHash === 'string' && approvedPlan.originalContentHash !== policyOriginalHash) {
        if (policyDiff && approvedPlan.diff !== policyDiff) {
          emitPlanMetadata(approvedPlan)
          throw new Error(`File changed after permission approval and the resulting write diff changed: ${resolvedPath}. Please retry the write.`)
        }
      }

      emitPlanMetadata(approvedPlan)

      let revalidationAttempts = 0
      while (true) {
        const latestSnapshot = await readTextFileSnapshot(resolvedPath)
        throwIfAborted()
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
        throw new Error(`File changed after permission approval and the resulting write diff changed: ${resolvedPath}. Please retry the write.`)
      }

      const parentDir = path.dirname(resolvedPath)
      await fs.mkdir(parentDir, { recursive: true })
      throwIfAborted()

      await fs.writeFile(resolvedPath, content, 'utf-8')
      throwIfAborted()

      const audit = await recordFileMutationAudit({
        auditDir: getFileMutationsDir(),
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        toolCallId: ctx.toolCallId,
        operation: approvedPlan.created ? 'write_create' : 'write_overwrite',
        path: resolvedPath,
        beforeExists: approvedPlan.snapshot.exists,
        beforeContent: approvedPlan.snapshot.content,
        afterContent: content,
        diff: approvedPlan.diff,
        metadata: {
          bytesWritten,
          lineCount,
          additions: approvedPlan.additions,
          deletions: approvedPlan.deletions,
        },
      })

      ctx.metadata({
        metadata: {
          path: resolvedPath,
          bytesWritten,
          lineCount,
          created: approvedPlan.created,
          diff: approvedPlan.diff,
          additions: approvedPlan.additions,
          deletions: approvedPlan.deletions,
          originalContent: approvedPlan.snapshot.content,
          originalContentHash: approvedPlan.originalContentHash,
          auditId: audit.id,
          auditPath: audit.path,
          afterContentHash: audit.afterHash,
        },
      })

      const metadata: WriteMetadata = {
        path: resolvedPath,
        bytesWritten,
        lineCount,
        created: approvedPlan.created,
        diff: approvedPlan.diff,
        additions: approvedPlan.additions,
        deletions: approvedPlan.deletions,
        originalContent: approvedPlan.snapshot.content,
        originalContentHash: approvedPlan.originalContentHash,
        auditId: audit.id,
        auditPath: audit.path,
        afterContentHash: audit.afterHash,
      }

      const output = `Successfully wrote ${content.length} bytes to ${inputPath}`
      ctx.updateResult?.({
        content: [{ type: 'text', text: output }, { type: 'file', path: resolvedPath }],
        details: { phase: 'ready', ...metadata },
      })

      return {
        title: path.basename(resolvedPath),
        output,
        metadata,
        attachments: [{ type: 'file' as const, path: resolvedPath }],
      }
    })
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid write parameters:\n${issues.join('\n')}`
  },
})
