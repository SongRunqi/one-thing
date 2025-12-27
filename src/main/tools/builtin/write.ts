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
import { checkFileAccess } from '../core/sandbox.js'

/**
 * Write Tool Metadata
 */
export interface WriteMetadata {
  filePath: string
  bytesWritten: number
  lineCount: number
  created: boolean
  [key: string]: unknown
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

  parameters: WriteParameters,

  async execute(args, ctx) {
    const { file_path, content } = args

    // Check sandbox boundary and request permission if needed
    const resolvedPath = await checkFileAccess(file_path, ctx, 'Write file')

    // Check if file exists
    let fileExists = false
    try {
      const stats = await fs.stat(resolvedPath)
      if (stats.isDirectory()) {
        throw new Error(`Path is a directory, not a file: ${resolvedPath}`)
      }
      fileExists = true
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }

    // Update metadata with initial state
    ctx.metadata({
      title: `Writing ${path.basename(resolvedPath)}`,
      metadata: {
        filePath: resolvedPath,
        bytesWritten: 0,
        lineCount: 0,
        created: !fileExists,
      },
    })

    // Ensure parent directory exists
    const parentDir = path.dirname(resolvedPath)
    await fs.mkdir(parentDir, { recursive: true })

    // Write the file
    await fs.writeFile(resolvedPath, content, 'utf-8')

    // Calculate stats
    const bytesWritten = Buffer.byteLength(content, 'utf-8')
    const lineCount = content.split('\n').length

    const metadata: WriteMetadata = {
      filePath: resolvedPath,
      bytesWritten,
      lineCount,
      created: !fileExists,
    }

    const action = fileExists ? 'Updated' : 'Created'

    return {
      title: `${action} ${path.basename(resolvedPath)}`,
      output: `Successfully ${action.toLowerCase()} ${resolvedPath}\n${bytesWritten} bytes written (${lineCount} lines)`,
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid write parameters:\n${issues.join('\n')}`
  },
})
