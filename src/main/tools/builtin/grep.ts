/**
 * Built-in Tool: Grep
 *
 * Fast content search using ripgrep.
 * Supports regex patterns and file type filtering.
 */

import { z } from 'zod'
import * as path from 'path'
import * as fs from 'fs/promises'
import { Tool } from '../core/tool.js'
import { Ripgrep } from '../../utils/ripgrep.js'

// Maximum results to return
const DEFAULT_LIMIT = 100
// Maximum line length before truncation
const MAX_LINE_LENGTH = 2000

/**
 * Grep Tool Metadata
 */
export interface GrepMetadata {
  pattern: string
  searchPath: string
  matches: number
  truncated: boolean
  [key: string]: unknown
}

/**
 * Grep Tool Parameters Schema
 */
const GrepParameters = z.object({
  pattern: z
    .string()
    .describe('The regular expression pattern to search for in file contents'),
  path: z
    .string()
    .optional()
    .describe('File or directory to search in. Defaults to current working directory.'),
  glob: z
    .string()
    .optional()
    .describe('Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")'),
  type: z
    .string()
    .optional()
    .describe('File type to search (e.g., "js", "py", "rust"). More efficient than glob for standard types.'),
  case_insensitive: z
    .boolean()
    .optional()
    .default(false)
    .describe('Case insensitive search'),
  context_lines: z
    .number()
    .optional()
    .describe('Number of context lines to show before and after each match'),
})

/**
 * Grep Tool Definition
 */
export const GrepTool = Tool.define<typeof GrepParameters, GrepMetadata>('grep', {
  name: 'Grep',
  description: `A powerful search tool built on ripgrep.

Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+").
Filter files with glob parameter (e.g., "*.js", "**/*.tsx").

Results are sorted by file modification time (newest first).`,
  category: 'builtin',
  enabled: true,
  autoExecute: true, // Safe read-only operation

  parameters: GrepParameters,

  async execute(args, ctx) {
    const { pattern, case_insensitive, context_lines } = args
    const workDir = ctx.workingDirectory || process.cwd()
    let searchPath = args.path || workDir

    // Resolve relative paths
    if (!path.isAbsolute(searchPath)) {
      searchPath = path.resolve(workDir, searchPath)
    }

    // Build glob patterns
    const globs: string[] = []
    if (args.glob) {
      globs.push(args.glob)
    }
    if (args.type) {
      // Map common types to globs
      const typeMap: Record<string, string> = {
        js: '*.js',
        ts: '*.ts',
        tsx: '*.tsx',
        jsx: '*.jsx',
        py: '*.py',
        rust: '*.rs',
        go: '*.go',
        java: '*.java',
        c: '*.c',
        cpp: '*.cpp',
        h: '*.h',
        css: '*.css',
        html: '*.html',
        json: '*.json',
        yaml: '*.{yaml,yml}',
        md: '*.md',
        vue: '*.vue',
        svelte: '*.svelte',
      }
      const typeGlob = typeMap[args.type] || `*.${args.type}`
      globs.push(typeGlob)
    }

    // Update metadata with initial state
    ctx.metadata({
      title: `Searching: ${pattern}`,
      metadata: {
        pattern,
        searchPath,
        matches: 0,
        truncated: false,
      },
    })

    // Perform search
    let results: Array<{
      path: string
      lineNumber: number
      lineText: string
    }>

    try {
      results = await Ripgrep.search({
        cwd: searchPath,
        pattern,
        glob: globs.length > 0 ? globs : undefined,
        maxCount: DEFAULT_LIMIT * 10, // Get more to allow sorting
      })
    } catch (error: any) {
      throw new Error(`Grep search failed: ${error.message}`)
    }

    // Get modification times for sorting
    const fileModTimes = new Map<string, number>()
    for (const result of results) {
      if (!fileModTimes.has(result.path)) {
        try {
          const stats = await fs.stat(result.path)
          fileModTimes.set(result.path, stats.mtime.getTime())
        } catch {
          fileModTimes.set(result.path, 0)
        }
      }
    }

    // Sort by modification time
    results.sort((a, b) => {
      const aTime = fileModTimes.get(a.path) || 0
      const bTime = fileModTimes.get(b.path) || 0
      if (aTime !== bTime) return bTime - aTime
      // Same file, sort by line number
      return a.lineNumber - b.lineNumber
    })

    // Truncate if needed
    const truncated = results.length > DEFAULT_LIMIT
    if (truncated) {
      results = results.slice(0, DEFAULT_LIMIT)
    }

    // Build output
    const outputLines: string[] = []

    if (results.length === 0) {
      outputLines.push('No matches found')
    } else {
      outputLines.push(`Found ${results.length} match${results.length !== 1 ? 'es' : ''}`)
      outputLines.push('')

      let currentFile = ''
      for (const match of results) {
        if (currentFile !== match.path) {
          if (currentFile !== '') {
            outputLines.push('')
          }
          currentFile = match.path
          outputLines.push(`${match.path}:`)
        }

        // Truncate long lines
        let lineText = match.lineText
        if (lineText.length > MAX_LINE_LENGTH) {
          lineText = lineText.slice(0, MAX_LINE_LENGTH) + '...'
        }

        outputLines.push(`  ${match.lineNumber}: ${lineText}`)
      }

      if (truncated) {
        outputLines.push('')
        outputLines.push(`(Results truncated at ${DEFAULT_LIMIT}. Use a more specific pattern or path.)`)
      }
    }

    const metadata: GrepMetadata = {
      pattern,
      searchPath,
      matches: results.length,
      truncated,
    }

    return {
      title: `Found ${results.length} match${results.length !== 1 ? 'es' : ''}`,
      output: outputLines.join('\n'),
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid grep parameters:\n${issues.join('\n')}`
  },
})
