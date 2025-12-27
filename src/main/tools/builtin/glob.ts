/**
 * Built-in Tool: Glob
 *
 * Fast file pattern matching using ripgrep.
 * Returns matching file paths sorted by modification time.
 */

import { z } from 'zod'
import * as path from 'path'
import * as fs from 'fs/promises'
import { Tool } from '../core/tool.js'
import { Ripgrep } from '../../utils/ripgrep.js'

// Maximum files to return
const DEFAULT_LIMIT = 100

/**
 * Glob Tool Metadata
 */
export interface GlobMetadata {
  pattern: string
  searchPath: string
  count: number
  truncated: boolean
  [key: string]: unknown
}

/**
 * Glob Tool Parameters Schema
 */
const GlobParameters = z.object({
  pattern: z
    .string()
    .describe('The glob pattern to match files against (e.g., "**/*.ts", "src/**/*.vue")'),
  path: z
    .string()
    .optional()
    .describe(
      'The directory to search in. If not specified, the current working directory will be used. ' +
      'IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null".'
    ),
})

/**
 * Glob Tool Definition
 */
export const GlobTool = Tool.define<typeof GlobParameters, GlobMetadata>('glob', {
  name: 'Glob',
  description: `Fast file pattern matching tool that works with any codebase size.

Supports glob patterns like "**/*.js" or "src/**/*.ts".
Returns matching file paths sorted by modification time.

Use this tool when you need to find files by name patterns.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true, // Safe read-only operation

  parameters: GlobParameters,

  async execute(args, ctx) {
    const { pattern } = args
    let searchPath = args.path || process.cwd()

    // Resolve relative paths
    if (!path.isAbsolute(searchPath)) {
      searchPath = path.resolve(process.cwd(), searchPath)
    }

    // Update metadata with initial state
    ctx.metadata({
      title: `Searching: ${pattern}`,
      metadata: {
        pattern,
        searchPath,
        count: 0,
        truncated: false,
      },
    })

    // Collect files with modification times
    const files: Array<{ path: string; mtime: number }> = []
    let truncated = false

    try {
      for await (const file of Ripgrep.files({
        cwd: searchPath,
        glob: [pattern],
      })) {
        if (files.length >= DEFAULT_LIMIT) {
          truncated = true
          break
        }

        const fullPath = path.resolve(searchPath, file)
        let mtime = 0

        try {
          const stats = await fs.stat(fullPath)
          mtime = stats.mtime.getTime()
        } catch {
          // File might have been deleted, use 0
        }

        files.push({ path: fullPath, mtime })
      }
    } catch (error: any) {
      throw new Error(`Glob search failed: ${error.message}`)
    }

    // Sort by modification time (newest first)
    files.sort((a, b) => b.mtime - a.mtime)

    // Build output
    const outputLines: string[] = []

    if (files.length === 0) {
      outputLines.push('No files found')
    } else {
      outputLines.push(...files.map((f) => f.path))

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

    return {
      title: `Found ${files.length} file${files.length !== 1 ? 's' : ''}`,
      output: outputLines.join('\n'),
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid glob parameters:\n${issues.join('\n')}`
  },
})
