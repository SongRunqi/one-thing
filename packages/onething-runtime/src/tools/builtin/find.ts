import { z } from 'zod'
import { toJsonObject } from '@onething/core'
import { createToolAbortError } from '@onething/core/tools'
import {
  isAbsolutePath,
  joinPaths,
  relativePath,
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
  truncateTextHead,
  type TextTruncationResult,
} from '../text-truncation.js'

const DEFAULT_LIMIT = 1000

export interface FindFilesOptions {
  cwd: string
  glob?: string[]
}

export interface FindToolAdapters {
  files(options: FindFilesOptions): AsyncIterable<string>
  getDefaultWorkingDirectory?(): string | undefined
}

export interface FindMetadata {
  pattern: string
  path: string
  count: number
  truncated: boolean
  truncation?: TextTruncationResult
  resultLimitReached?: number
}

export const FindParameters = z.object({
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
  return value.split(/[\\/]+/).join('/')
}

function resolveSearchPath(
  inputPath: string | undefined,
  workingDirectory: string | undefined,
  adapters: FindToolAdapters,
): string {
  return resolveCoreToolPath(inputPath || '.', {
    workingDirectory,
    defaultWorkingDirectory: adapters.getDefaultWorkingDirectory?.(),
  })
}

export function createFindTool(adapters: FindToolAdapters): Tool.Info<typeof FindParameters, FindMetadata> {
  return Tool.define<typeof FindParameters, FindMetadata>('find', {
    name: 'Find',
    description: `Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_TEXT_MAX_BYTES / 1024}KB (whichever is hit first).`,
    category: 'builtin',
    enabled: true,
    autoExecute: true,
    permissionGuard: 'sandboxed',
    executionMode: 'parallel',
    renderKind: 'search',

    parameters: FindParameters,

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
            operation: 'Find files',
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
          title: `Find ${args.pattern}`,
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
        'Find files',
        {
          targetType: 'directory',
          defaultWorkingDirectory,
        },
      )
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
        for await (const file of adapters.files({ cwd: searchPath, glob: [args.pattern] })) {
          throwIfAborted()
          if (results.length >= effectiveLimit) {
            resultLimitReached = true
            break
          }
          const relative = isAbsolutePath(file) ? relativePath(searchPath, file) : file
          if (relative) results.push(toPosixPath(relative))
          if (results.length > 0 && results.length % 100 === 0) {
            ctx.updateResult?.({
              content: [{ type: 'text', text: `Found ${results.length} file${results.length === 1 ? '' : 's'} so far...` }],
              details: { phase: 'searching', pattern: args.pattern, path: searchPath, count: results.length },
            })
          }
        }
      } catch (error) {
        if (ctx.abortSignal?.aborted) throw createToolAbortError()
        const message = error instanceof Error ? error.message : 'unknown error'
        throw new Error(`Find failed: ${message}`)
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
        details: toJsonObject({ phase: 'ready', ...metadata }),
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
}
