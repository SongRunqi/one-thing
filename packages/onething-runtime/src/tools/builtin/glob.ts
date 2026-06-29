import { z } from 'zod'
import type { JsonObjectProperty } from '@onething/core'
import {
  isAbsolutePath,
  resolvePath,
  statPath,
} from '@onething/core/storage'
import { Tool } from '../tool.js'
import { checkCoreFileAccess, expandCorePath } from '../sandbox.js'

const DEFAULT_LIMIT = 100

export interface GlobFilesOptions {
  cwd: string
  glob?: string[]
}

export interface GlobToolAdapters {
  files(options: GlobFilesOptions): AsyncIterable<string>
  getCwd?(): string
}

export interface GlobMetadata {
  pattern: string
  searchPath: string
  count: number
  truncated: boolean
  [key: string]: JsonObjectProperty
}

export const GlobParameters = z.object({
  pattern: z
    .string()
    .describe('The glob pattern to match files against (e.g., "**/*.ts", "src/**/*.vue")'),
  path: z
    .string()
    .optional()
    .describe(
      'The directory to search in. If not specified, the current work directory will be used. ' +
      'IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null".',
    ),
})

export function createGlobTool(adapters: GlobToolAdapters): Tool.Info<typeof GlobParameters, GlobMetadata> {
  return Tool.define<typeof GlobParameters, GlobMetadata>('glob', {
    name: 'Glob',
    description: `Fast file pattern matching tool that works with any codebase size.

Supports glob patterns like "**/*.js" or "src/**/*.ts".
Returns matching file paths sorted by modification time.

Use this tool when you need to find files by name patterns.`,
    category: 'builtin',
    enabled: true,
    autoExecute: true,
    permissionGuard: 'sandboxed',
    executionMode: 'parallel',
    renderKind: 'search',

    parameters: GlobParameters,

    async execute(args, ctx) {
      const { pattern } = args
      const workDir = ctx.workingDirectory || adapters.getCwd?.() || process.cwd()
      let searchPath = args.path ? expandCorePath(args.path) : workDir

      if (!isAbsolutePath(searchPath)) {
        searchPath = resolvePath(workDir, searchPath)
      }
      searchPath = await checkCoreFileAccess(searchPath, ctx, 'Search directory', {
        targetType: 'directory',
      })

      ctx.updateResult?.({
        content: [{ type: 'text', text: `Matching ${pattern} in ${searchPath}...` }],
        details: { phase: 'searching', pattern, searchPath, count: 0 },
      })

      ctx.metadata({
        title: `Searching: ${pattern}`,
        metadata: {
          pattern,
          searchPath,
          count: 0,
          truncated: false,
        },
      })

      const files: Array<{ path: string; mtime: number }> = []
      let truncated = false

      try {
        for await (const file of adapters.files({
          cwd: searchPath,
          glob: [pattern],
        })) {
          if (files.length >= DEFAULT_LIMIT) {
            truncated = true
            break
          }

          const fullPath = resolvePath(searchPath, file)
          const stats = await statPath(fullPath)
          const mtime = stats ? new Date(stats.mtimeMs).getTime() : 0

          files.push({ path: fullPath, mtime })
          if (files.length % 25 === 0) {
            ctx.updateResult?.({
              content: [{ type: 'text', text: `Found ${files.length} file${files.length !== 1 ? 's' : ''} so far...` }],
              details: { phase: 'searching', pattern, searchPath, count: files.length },
            })
          }
        }
      } catch (error) {
        throw new Error(`Glob search failed: ${error instanceof Error ? error.message : String(error)}`)
      }

      files.sort((a, b) => b.mtime - a.mtime)

      const outputLines: string[] = []

      if (files.length === 0) {
        outputLines.push('No files found')
      } else {
        outputLines.push(...files.map((file) => file.path))

        if (truncated) {
          outputLines.push('')
          outputLines.push(`(Results truncated at ${DEFAULT_LIMIT} files. Use a more specific pattern or path.)`)
        }
      }

      const metadata: GlobMetadata = {
        pattern,
        searchPath,
        count: files.length,
        truncated,
      }

      ctx.updateResult?.({
        content: [{ type: 'text', text: outputLines.join('\n') }],
        details: { phase: 'ready', ...metadata },
      })

      return {
        title: `${files.length} file${files.length !== 1 ? 's' : ''}`,
        output: outputLines.join('\n'),
        metadata,
      }
    },

    formatValidationError(error) {
      const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      return `Invalid glob parameters:\n${issues.join('\n')}`
    },
  })
}
