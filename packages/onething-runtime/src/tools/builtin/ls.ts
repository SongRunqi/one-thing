import { z } from 'zod'
import { toJsonObject } from '@onething/core'
import {
  basenamePath,
  joinPaths,
  listDirectoryEntries,
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
  truncateTextHead,
  type TextTruncationResult,
} from '../text-truncation.js'

const DEFAULT_LIMIT = 500

export interface LsToolAdapters {
  getDefaultWorkingDirectory?(): string | undefined
}

export interface LsMetadata {
  path: string
  count: number
  truncated: boolean
  truncation?: TextTruncationResult
  entryLimitReached?: number
}

export const LsParameters = z.object({
  path: z
    .string()
    .optional()
    .describe('Directory to list (default: current work directory)'),
  limit: z
    .number()
    .optional()
    .describe(`Maximum number of entries to return (default: ${DEFAULT_LIMIT})`),
})

function resolveListPath(
  inputPath: string | undefined,
  workingDirectory: string | undefined,
  adapters: LsToolAdapters,
): string {
  return resolveCoreToolPath(inputPath || '.', {
    workingDirectory,
    defaultWorkingDirectory: adapters.getDefaultWorkingDirectory?.(),
  })
}

export function createLsTool(adapters: LsToolAdapters = {}): Tool.Info<typeof LsParameters, LsMetadata> {
  return Tool.define<typeof LsParameters, LsMetadata>('ls', {
    name: 'LS',
    description: `List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${DEFAULT_LIMIT} entries or ${DEFAULT_TEXT_MAX_BYTES / 1024}KB (whichever is hit first).`,
    category: 'builtin',
    enabled: true,
    autoExecute: true,
    permissionGuard: 'sandboxed',
    executionMode: 'parallel',
    renderKind: 'file',

    parameters: LsParameters,

    async analyze(args, ctx) {
      const resolvedPath = resolveListPath(args.path, ctx.workingDirectory, adapters)
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
            operation: 'List directory',
            targetType: 'directory',
          },
        })
      }
      effects.push({
        kind: 'read' as const,
        resources: [joinPaths(resolvedPath, '*')],
        barrier: false,
        metadata: { path: resolvedPath },
      })
      return {
        effects,
        preview: {
          title: `List ${basenamePath(resolvedPath) || resolvedPath}`,
          path: resolvedPath,
        },
      }
    },

    async execute(args, ctx) {
      const throwIfAborted = () => {
        if (ctx.abortSignal?.aborted) throw new Error('Operation aborted')
      }
      throwIfAborted()

      const defaultWorkingDirectory = adapters.getDefaultWorkingDirectory?.()
      const dirPath = await checkCoreFileAccess(
        resolveListPath(args.path, ctx.workingDirectory, adapters),
        ctx,
        'List directory',
        {
          targetType: 'directory',
          defaultWorkingDirectory,
        },
      )
      const effectiveLimit = Math.max(1, Math.floor(args.limit ?? DEFAULT_LIMIT))

      ctx.updateResult?.({
        content: [{ type: 'text', text: `Listing ${dirPath}...` }],
        details: { phase: 'listing', path: dirPath, count: 0 },
      })
      ctx.metadata({
        title: `Listing ${basenamePath(dirPath) || dirPath}`,
        metadata: { path: dirPath, count: 0, truncated: false },
      })

      const stat = await statPath(dirPath)
      if (!stat) {
        throw new Error(`Path not found: ${dirPath}`)
      }
      throwIfAborted()

      if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${dirPath}`)
      }

      let entries
      try {
        entries = await listDirectoryEntries(dirPath)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error'
        throw new Error(`Cannot read directory: ${message}`)
      }
      throwIfAborted()

      entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

      const results: string[] = []
      let entryLimitReached = false
      for (const entry of entries) {
        throwIfAborted()
        if (results.length >= effectiveLimit) {
          entryLimitReached = true
          break
        }
        results.push(entry.name + (entry.isDirectory ? '/' : ''))
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
        details: toJsonObject({ phase: 'ready', ...metadata }),
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
}

export const LsTool = createLsTool()
