/**
 * Built-in Tool: LS
 *
 * Pi-style directory listing.
 */

import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { checkFileAccess, findSandboxRootForPath, getSandboxBoundary, resolveToolPath } from '../core/sandbox.js'
import { DEFAULT_TEXT_MAX_BYTES, formatSize, truncateTextHead, type TextTruncationResult } from '../core/text-truncation.js'

const DEFAULT_LIMIT = 500

export interface LsMetadata {
  path: string
  count: number
  truncated: boolean
  truncation?: TextTruncationResult
  entryLimitReached?: number
  [key: string]: unknown
}

const LsParameters = z.object({
  path: z
    .string()
    .optional()
    .describe('Directory to list (default: current work directory)'),
  limit: z
    .number()
    .optional()
    .describe(`Maximum number of entries to return (default: ${DEFAULT_LIMIT})`),
})

function resolveListPath(inputPath: string | undefined, workingDirectory?: string): string {
  return resolveToolPath(inputPath || '.', workingDirectory)
}

export const LsTool = Tool.define<typeof LsParameters, LsMetadata>('ls', {
  name: 'LS',
  description: `List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${DEFAULT_LIMIT} entries or ${DEFAULT_TEXT_MAX_BYTES / 1024}KB (whichever is hit first).`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'sandboxed',
  executionMode: 'parallel',
  renderKind: 'file',
  promptSnippet: 'List directory contents',
  promptGuidelines: ['Use ls to inspect directory contents before choosing files to read.'],

  parameters: LsParameters,

  async analyze(args, ctx) {
    const resolvedPath = resolveListPath(args.path, ctx.workingDirectory)
    const boundary = getSandboxBoundary(ctx.workingDirectory)
    const matchedRoot = findSandboxRootForPath(resolvedPath, ctx.workingDirectory, ctx.workingDirectoryRoots)
    const effects = []
    if (!matchedRoot) {
      effects.push({
        kind: 'external_directory' as const,
        resources: [path.join(resolvedPath, '*')],
        barrier: true,
        external: true,
        metadata: {
          path: resolvedPath,
          boundary,
          operation: 'List directory',
          targetType: 'directory',
        },
      })
    }
    effects.push({
      kind: 'read' as const,
      resources: [path.join(resolvedPath, '*')],
      barrier: false,
      metadata: { path: resolvedPath },
    })
    return {
      effects,
      preview: {
        title: `List ${path.basename(resolvedPath) || resolvedPath}`,
        path: resolvedPath,
      },
    }
  },

  async execute(args, ctx) {
    const throwIfAborted = () => {
      if (ctx.abortSignal?.aborted) throw new Error('Operation aborted')
    }
    throwIfAborted()

    const dirPath = await checkFileAccess(resolveListPath(args.path, ctx.workingDirectory), ctx, 'List directory', 'directory')
    const effectiveLimit = Math.max(1, Math.floor(args.limit ?? DEFAULT_LIMIT))

    ctx.updateResult?.({
      content: [{ type: 'text', text: `Listing ${dirPath}...` }],
      details: { phase: 'listing', path: dirPath, count: 0 },
    })
    ctx.metadata({
      title: `Listing ${path.basename(dirPath) || dirPath}`,
      metadata: { path: dirPath, count: 0, truncated: false },
    })

    let stat
    try {
      stat = await fs.stat(dirPath)
    } catch (error: any) {
      if (error.code === 'ENOENT') throw new Error(`Path not found: ${dirPath}`)
      throw error
    }
    throwIfAborted()

    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${dirPath}`)
    }

    let entries: string[]
    try {
      entries = await fs.readdir(dirPath)
    } catch (error: any) {
      throw new Error(`Cannot read directory: ${error.message}`)
    }
    throwIfAborted()

    entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

    const results: string[] = []
    let entryLimitReached = false
    for (const entry of entries) {
      throwIfAborted()
      if (results.length >= effectiveLimit) {
        entryLimitReached = true
        break
      }
      try {
        const entryStat = await fs.stat(path.join(dirPath, entry))
        results.push(entry + (entryStat.isDirectory() ? '/' : ''))
      } catch {
        // Skip entries that disappeared or cannot be statted.
      }
    }

    let output = results.length > 0 ? results.join('\n') : '(empty directory)'
    const truncation = truncateTextHead(output, { maxLines: Number.MAX_SAFE_INTEGER })
    output = truncation.content

    const notices: string[] = []
    if (entryLimitReached) notices.push(`${effectiveLimit} entries limit reached. Use limit=${effectiveLimit * 2} for more`)
    if (truncation.truncated) notices.push(`${formatSize(DEFAULT_TEXT_MAX_BYTES)} limit reached`)
    if (notices.length > 0) output += `\n\n[${notices.join('. ')}]`

    const metadata: LsMetadata = {
      path: dirPath,
      count: results.length,
      truncated: entryLimitReached || truncation.truncated,
      ...(truncation.truncated && { truncation }),
      ...(entryLimitReached && { entryLimitReached: effectiveLimit }),
    }

    ctx.updateResult?.({
      content: [{ type: 'text', text: output }],
      details: { phase: 'ready', ...metadata },
    })

    return {
      title: `${results.length} entr${results.length === 1 ? 'y' : 'ies'}`,
      output,
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid ls parameters:\n${issues.join('\n')}`
  },
})
