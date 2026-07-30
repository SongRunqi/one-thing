/**
 * Built-in Tool: Grep
 *
 * Pi-style content search using an injected search provider.
 */

import { z } from 'zod'
import { toJsonObject } from '@onething/core'
import { createToolAbortError } from '@onething/core/tools'
import {
  basenamePath,
  joinPaths,
  readTextFileIfExists,
  relativePath,
  statPath,
} from '@onething/core/storage'
import { Tool } from '../tool.js'
import {
  checkCoreFileAccess,
  findCoreSandboxRootForPath,
  getCoreSandboxBoundary,
  resolveCoreToolPath,
} from '../sandbox.js'
import {
  DEFAULT_TEXT_MAX_BYTES,
  formatSize,
  truncateLine,
  truncateTextHead,
  type TextTruncationResult,
} from '../text-truncation.js'

const DEFAULT_LIMIT = 100
const GREP_MAX_LINE_LENGTH = 2000

export interface GrepSearchOptions {
  cwd: string
  pattern: string
  glob?: string[]
  maxCount?: number
  ignoreCase?: boolean
  literal?: boolean
}

export interface GrepSearchResult {
  path: string
  lineNumber: number
  lineText: string
}

export interface GrepToolAdapters {
  search(options: GrepSearchOptions): Promise<GrepSearchResult[]>
  getDefaultWorkingDirectory?(): string | undefined
}

export interface GrepMetadata {
  pattern: string
  path: string
  matches: number
  truncated: boolean
  truncation?: TextTruncationResult
  matchLimitReached?: number
  linesTruncated?: boolean
}

export const GrepParameters = z.object({
  pattern: z
    .string()
    .describe('Search pattern (regex or literal string)'),
  path: z
    .string()
    .optional()
    .describe('Directory or file to search (default: current work directory)'),
  glob: z
    .string()
    .optional()
    .describe("Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'"),
  ignoreCase: z
    .boolean()
    .optional()
    .describe('Case-insensitive search (default: false)'),
  literal: z
    .boolean()
    .optional()
    .describe('Treat pattern as literal string instead of regex (default: false)'),
  context: z
    .number()
    .optional()
    .describe('Number of lines to show before and after each match (default: 0)'),
  limit: z
    .number()
    .optional()
    .describe(`Maximum number of matches to return (default: ${DEFAULT_LIMIT})`),
})

function toPosixPath(value: string): string {
  return value.split(/[\\/]+/).join('/')
}

function resolveSearchPath(
  inputPath: string | undefined,
  workingDirectory: string | undefined,
  adapters: GrepToolAdapters,
): string {
  return resolveCoreToolPath(inputPath || '.', {
    workingDirectory,
    defaultWorkingDirectory: adapters.getDefaultWorkingDirectory?.(),
  })
}

export function createGrepTool(adapters: GrepToolAdapters): Tool.Info<typeof GrepParameters, GrepMetadata> {
  return Tool.define<typeof GrepParameters, GrepMetadata>('grep', {
    name: 'Grep',
    description: `Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_TEXT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
    category: 'builtin',
    enabled: true,
    autoExecute: true,
    permissionGuard: 'sandboxed',
    executionMode: 'parallel',
    renderKind: 'search',

    parameters: GrepParameters,

    async analyze(args, ctx) {
      const resolvedPath = resolveSearchPath(args.path, ctx.workingDirectory, adapters)
      const defaultWorkingDirectory = adapters.getDefaultWorkingDirectory?.()
      const boundary = getCoreSandboxBoundary({
        workingDirectory: ctx.workingDirectory,
        defaultWorkingDirectory,
      })
      const matchedRoot = findCoreSandboxRootForPath(resolvedPath, {
        workingDirectory: ctx.workingDirectory,
        workingDirectoryRoots: ctx.workingDirectoryRoots,
        defaultWorkingDirectory,
      })
      const effects = []
      if (!matchedRoot) {
        effects.push({
          kind: 'external_directory' as const,
          resources: [joinPaths(resolvedPath, '*')],
          barrier: true,
          external: true,
          metadata: {
            path: resolvedPath,
            boundary,
            operation: 'Search file contents',
            targetType: 'directory',
          },
        })
      }
      effects.push({
        kind: 'read' as const,
        resources: [joinPaths(resolvedPath, '*')],
        barrier: false,
        metadata: { path: resolvedPath, pattern: args.pattern },
      })
      return {
        effects,
        preview: {
          title: `Grep ${args.pattern}`,
          path: resolvedPath,
          metadata: { pattern: args.pattern },
        },
      }
    },

    async execute(args, ctx) {
      const throwIfAborted = () => {
        if (ctx.abortSignal?.aborted) throw createToolAbortError()
      }
      throwIfAborted()

      const defaultWorkingDirectory = adapters.getDefaultWorkingDirectory?.()
      const searchPath = await checkCoreFileAccess(
        resolveSearchPath(args.path, ctx.workingDirectory, adapters),
        ctx,
        'Search file contents',
        {
          targetType: 'directory',
          defaultWorkingDirectory,
        },
      )
      const effectiveLimit = Math.max(1, Math.floor(args.limit ?? DEFAULT_LIMIT))
      const contextValue = Math.max(0, Math.floor(args.context ?? 0))

      const searchStat = await statPath(searchPath)
      if (!searchStat) throw new Error(`Path not found: ${searchPath}`)
      const isDirectory = searchStat.isFile?.() === false

      ctx.updateResult?.({
        content: [{ type: 'text', text: `Searching ${searchPath} for ${args.pattern}...` }],
        details: { phase: 'searching', pattern: args.pattern, path: searchPath, matches: 0 },
      })
      ctx.metadata({
        title: `Searching: ${args.pattern}`,
        metadata: { pattern: args.pattern, path: searchPath, matches: 0, truncated: false },
      })

      const formatPath = (filePath: string): string => {
        if (isDirectory) {
          const relative = relativePath(searchPath, filePath)
          if (relative && !relative.startsWith('..')) return toPosixPath(relative)
        }
        return basenamePath(filePath)
      }

      const fileCache = new Map<string, string[]>()
      const getFileLines = async (filePath: string): Promise<string[]> => {
        let lines = fileCache.get(filePath)
        if (!lines) {
          const content = await readTextFileIfExists(filePath)
          lines = content ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n') : []
          fileCache.set(filePath, lines)
        }
        return lines
      }

      let rawResults
      try {
        rawResults = await adapters.search({
          cwd: searchPath,
          pattern: args.pattern,
          glob: args.glob ? [args.glob] : undefined,
          maxCount: effectiveLimit * 2,
          ignoreCase: args.ignoreCase,
          literal: args.literal,
        })
      } catch (error) {
        if (ctx.abortSignal?.aborted) throw createToolAbortError()
        const message = error instanceof Error ? error.message : 'unknown error'
        throw new Error(`Grep search failed: ${message}`)
      }
      throwIfAborted()

      const matchLimitReached = rawResults.length > effectiveLimit
      const results = matchLimitReached ? rawResults.slice(0, effectiveLimit) : rawResults
      let linesTruncated = false
      const outputLines: string[] = []

      for (const match of results) {
        throwIfAborted()
        const displayPath = formatPath(match.path)
        if (contextValue <= 0) {
          const truncatedLine = truncateLine(match.lineText.replace(/\r/g, ''), GREP_MAX_LINE_LENGTH)
          linesTruncated = linesTruncated || truncatedLine.truncated
          outputLines.push(`${displayPath}:${match.lineNumber}: ${truncatedLine.text}`)
          continue
        }

        const fileLines = await getFileLines(match.path)
        if (!fileLines.length) {
          outputLines.push(`${displayPath}:${match.lineNumber}: (unable to read file)`)
          continue
        }
        const start = Math.max(1, match.lineNumber - contextValue)
        const end = Math.min(fileLines.length, match.lineNumber + contextValue)
        for (let current = start; current <= end; current++) {
          const raw = fileLines[current - 1] ?? ''
          const truncatedLine = truncateLine(raw.replace(/\r/g, ''), GREP_MAX_LINE_LENGTH)
          linesTruncated = linesTruncated || truncatedLine.truncated
          outputLines.push(`${displayPath}:${current}: ${truncatedLine.text}`)
        }
      }

      let output = outputLines.length > 0 ? outputLines.join('\n') : 'No matches found'
      const truncation = truncateTextHead(output, { maxLines: Number.MAX_SAFE_INTEGER })
      output = truncation.content

      const notices: string[] = []
      if (matchLimitReached) {
        notices.push(`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`)
      }
      if (truncation.truncated) notices.push(`${formatSize(DEFAULT_TEXT_MAX_BYTES)} limit reached`)
      if (linesTruncated) notices.push('some lines truncated')
      if (notices.length > 0) output += `\n\n[${notices.join('. ')}]`

      const metadata: GrepMetadata = {
        pattern: args.pattern,
        path: searchPath,
        matches: results.length,
        truncated: matchLimitReached || truncation.truncated || linesTruncated,
        ...(truncation.truncated && { truncation }),
        ...(matchLimitReached && { matchLimitReached: effectiveLimit }),
        ...(linesTruncated && { linesTruncated }),
      }

      ctx.updateResult?.({
        content: [{ type: 'text', text: output }],
        details: toJsonObject({ phase: 'ready', ...metadata }),
      })

      return {
        title: `${results.length} match${results.length === 1 ? '' : 'es'}`,
        output,
        metadata,
      }
    },

    formatValidationError(error) {
      const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      return `Invalid grep parameters:\n${issues.join('\n')}`
    },
  })
}
