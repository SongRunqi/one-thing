/**
 * Built-in Tool: Find
 *
 * Pi-style file discovery by glob pattern.
 */

import { z } from 'zod'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { checkFileAccess, findSandboxRootForPath, getSandboxBoundary, resolveToolPath } from '../core/sandbox.js'
import { Ripgrep } from '../../utils/ripgrep.js'
import { DEFAULT_TEXT_MAX_BYTES, formatSize, truncateTextHead, type TextTruncationResult } from '../core/text-truncation.js'

const DEFAULT_LIMIT = 1000

export interface FindMetadata {
  pattern: string
  path: string
  count: number
  truncated: boolean
  truncation?: TextTruncationResult
  resultLimitReached?: number
  [key: string]: unknown
}

const FindParameters = z.object({
  pattern: z
    .string()
    .describe("Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'"),
  path: z
    .string()
    .optional()
    .describe('Directory to search in (default: current work directory)'),
  limit: z
    .number()
    .optional()
    .describe(`Maximum number of results (default: ${DEFAULT_LIMIT})`),
})

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/')
}

function resolveSearchPath(inputPath: string | undefined, workingDirectory?: string): string {
  return resolveToolPath(inputPath || '.', workingDirectory)
}

export const FindTool = Tool.define<typeof FindParameters, FindMetadata>('find', {
  name: 'Find',
  description: `Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_TEXT_MAX_BYTES / 1024}KB (whichever is hit first).`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'sandboxed',
  executionMode: 'parallel',
  renderKind: 'search',
  promptSnippet: 'Find files by glob pattern (respects .gitignore)',
  promptGuidelines: ['Use find when you need to discover files by name or glob pattern.'],

  parameters: FindParameters,

  async analyze(args, ctx) {
    const resolvedPath = resolveSearchPath(args.path, ctx.workingDirectory)
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
          operation: 'Find files',
          targetType: 'directory',
        },
      })
    }
    effects.push({
      kind: 'read' as const,
      resources: [path.join(resolvedPath, '*')],
      barrier: false,
      metadata: { path: resolvedPath, pattern: args.pattern },
    })
    return {
      effects,
      preview: {
        title: `Find ${args.pattern}`,
        path: resolvedPath,
        metadata: { pattern: args.pattern },
      },
    }
  },

  async execute(args, ctx) {
    const throwIfAborted = () => {
      if (ctx.abortSignal?.aborted) throw new Error('Operation aborted')
    }
    throwIfAborted()

    const searchPath = await checkFileAccess(resolveSearchPath(args.path, ctx.workingDirectory), ctx, 'Find files', 'directory')
    const effectiveLimit = Math.max(1, Math.floor(args.limit ?? DEFAULT_LIMIT))

    ctx.updateResult?.({
      content: [{ type: 'text', text: `Finding ${args.pattern} in ${searchPath}...` }],
      details: { phase: 'searching', pattern: args.pattern, path: searchPath, count: 0 },
    })
    ctx.metadata({
      title: `Finding: ${args.pattern}`,
      metadata: { pattern: args.pattern, path: searchPath, count: 0, truncated: false },
    })

    const results: string[] = []
    let resultLimitReached = false

    try {
      for await (const file of Ripgrep.files({ cwd: searchPath, glob: [args.pattern] })) {
        throwIfAborted()
        if (results.length >= effectiveLimit) {
          resultLimitReached = true
          break
        }
        const relative = path.isAbsolute(file) ? path.relative(searchPath, file) : file
        if (relative) results.push(toPosixPath(relative))
        if (results.length > 0 && results.length % 100 === 0) {
          ctx.updateResult?.({
            content: [{ type: 'text', text: `Found ${results.length} file${results.length === 1 ? '' : 's'} so far...` }],
            details: { phase: 'searching', pattern: args.pattern, path: searchPath, count: results.length },
          })
        }
      }
    } catch (error: any) {
      if (ctx.abortSignal?.aborted) throw new Error('Operation aborted')
      throw new Error(`Find failed: ${error.message}`)
    }

    results.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

    let output = results.length > 0 ? results.join('\n') : 'No files found matching pattern'
    const truncation = truncateTextHead(output, { maxLines: Number.MAX_SAFE_INTEGER })
    output = truncation.content

    const notices: string[] = []
    if (resultLimitReached) notices.push(`${effectiveLimit} results limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`)
    if (truncation.truncated) notices.push(`${formatSize(DEFAULT_TEXT_MAX_BYTES)} limit reached`)
    if (notices.length > 0) output += `\n\n[${notices.join('. ')}]`

    const metadata: FindMetadata = {
      pattern: args.pattern,
      path: searchPath,
      count: results.length,
      truncated: resultLimitReached || truncation.truncated,
      ...(truncation.truncated && { truncation }),
      ...(resultLimitReached && { resultLimitReached: effectiveLimit }),
    }

    ctx.updateResult?.({
      content: [{ type: 'text', text: output }],
      details: { phase: 'ready', ...metadata },
    })

    return {
      title: `${results.length} file${results.length === 1 ? '' : 's'}`,
      output,
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid find parameters:\n${issues.join('\n')}`
  },
})
