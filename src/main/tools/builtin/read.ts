/**
 * Built-in Tool: Read
 *
 * Reads file contents with support for:
 * - Line number display
 * - Offset/limit for large files
 * - Binary file detection
 * - Image preview support
 */

import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { checkFileAccess } from '../core/sandbox.js'

// Maximum lines to read by default
const DEFAULT_LIMIT = 2000
// Maximum line length before truncation
const MAX_LINE_LENGTH = 2000
// Binary file detection - check first N bytes
const BINARY_CHECK_BYTES = 8192

/**
 * Read Tool Metadata
 */
export interface ReadMetadata {
  filePath: string
  lineCount: number
  offset: number
  limit: number
  truncated: boolean
  isBinary: boolean
  fileSize: number
  [key: string]: unknown
}

/**
 * Read Tool Parameters Schema
 */
const ReadParameters = z.object({
  file_path: z
    .string()
    .describe('The absolute path to the file to read'),
  offset: z
    .number()
    .optional()
    .describe('Line number to start reading from (1-based). Only provide if the file is too large.'),
  limit: z
    .number()
    .optional()
    .describe('Number of lines to read. Only provide if the file is too large.'),
})

/**
 * Check if a buffer contains binary data
 */
function isBinaryBuffer(buffer: Buffer): boolean {
  // Check for null bytes or high proportion of non-printable characters
  let nonPrintable = 0
  const checkLength = Math.min(buffer.length, BINARY_CHECK_BYTES)

  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i]
    // Null byte is a strong indicator of binary
    if (byte === 0) return true
    // Count non-printable, non-whitespace characters
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      nonPrintable++
    }
  }

  // If more than 10% non-printable, consider it binary
  return nonPrintable / checkLength > 0.1
}

/**
 * Format line numbers like cat -n
 */
function formatWithLineNumbers(lines: string[], startLine: number): string {
  const maxLineNum = startLine + lines.length - 1
  const lineNumWidth = String(maxLineNum).length

  return lines.map((line, i) => {
    const lineNum = String(startLine + i).padStart(lineNumWidth, ' ')
    // Truncate long lines
    const truncatedLine = line.length > MAX_LINE_LENGTH
      ? line.slice(0, MAX_LINE_LENGTH) + '... (truncated)'
      : line
    return `${lineNum}\t${truncatedLine}`
  }).join('\n')
}

/**
 * Get file extension
 */
function getExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

/**
 * Check if file is an image
 */
function isImageFile(filePath: string): boolean {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico']
  return imageExtensions.includes(getExtension(filePath))
}

/**
 * Check if file is a PDF
 */
function isPdfFile(filePath: string): boolean {
  return getExtension(filePath) === '.pdf'
}

/**
 * Read Tool Definition
 */
export const ReadTool = Tool.define<typeof ReadParameters, ReadMetadata>('read', {
  name: 'Read',
  description: `Reads a file from the local filesystem.

Usage:
- The file_path parameter must be an absolute path
- By default, reads up to ${DEFAULT_LIMIT} lines starting from the beginning
- Use offset and limit for large files
- Lines longer than ${MAX_LINE_LENGTH} characters will be truncated
- Results are returned with line numbers (like cat -n)
- Binary files are detected and a message is shown instead of content`,
  category: 'builtin',
  enabled: true,
  autoExecute: true, // Safe read-only operation

  parameters: ReadParameters,

  async execute(args, ctx) {
    const { file_path, offset = 1, limit = DEFAULT_LIMIT } = args

    // Check sandbox boundary and request permission if needed
    const resolvedPath = await checkFileAccess(file_path, ctx, 'Read file')

    // Update metadata with initial state
    ctx.metadata({
      title: `Reading ${path.basename(resolvedPath)}`,
      metadata: {
        filePath: resolvedPath,
        lineCount: 0,
        offset,
        limit,
        truncated: false,
        isBinary: false,
        fileSize: 0,
      },
    })

    // Check if file exists
    let stats
    try {
      stats = await fs.stat(resolvedPath)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${resolvedPath}`)
      }
      throw error
    }

    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${resolvedPath}. Use ls command via Bash tool to list directory contents.`)
    }

    // Handle image files
    if (isImageFile(resolvedPath)) {
      return {
        title: `Image: ${path.basename(resolvedPath)}`,
        output: `[Image file: ${resolvedPath}]\nSize: ${stats.size} bytes\nThis is an image file. Content cannot be displayed as text.`,
        metadata: {
          filePath: resolvedPath,
          lineCount: 0,
          offset: 0,
          limit: 0,
          truncated: false,
          isBinary: true,
          fileSize: stats.size,
        },
        attachments: [{
          type: 'image' as const,
          path: resolvedPath,
        }],
      }
    }

    // Handle PDF files
    if (isPdfFile(resolvedPath)) {
      return {
        title: `PDF: ${path.basename(resolvedPath)}`,
        output: `[PDF file: ${resolvedPath}]\nSize: ${stats.size} bytes\nThis is a PDF file. Use a PDF viewer to read its contents.`,
        metadata: {
          filePath: resolvedPath,
          lineCount: 0,
          offset: 0,
          limit: 0,
          truncated: false,
          isBinary: true,
          fileSize: stats.size,
        },
        attachments: [{
          type: 'file' as const,
          path: resolvedPath,
        }],
      }
    }

    // Read file content
    const buffer = await fs.readFile(resolvedPath)

    // Check if binary
    if (isBinaryBuffer(buffer)) {
      return {
        title: `Binary: ${path.basename(resolvedPath)}`,
        output: `[Binary file: ${resolvedPath}]\nSize: ${stats.size} bytes\nThis appears to be a binary file. Content cannot be displayed as text.`,
        metadata: {
          filePath: resolvedPath,
          lineCount: 0,
          offset: 0,
          limit: 0,
          truncated: false,
          isBinary: true,
          fileSize: stats.size,
        },
      }
    }

    // Convert to string and split into lines
    const content = buffer.toString('utf-8')
    const allLines = content.split('\n')
    const totalLines = allLines.length

    // Apply offset and limit (offset is 1-based)
    const startIndex = Math.max(0, offset - 1)
    const endIndex = Math.min(totalLines, startIndex + limit)
    const selectedLines = allLines.slice(startIndex, endIndex)
    const truncated = endIndex < totalLines

    // Format with line numbers
    const formattedContent = formatWithLineNumbers(selectedLines, offset)

    const metadata: ReadMetadata = {
      filePath: resolvedPath,
      lineCount: selectedLines.length,
      offset,
      limit,
      truncated,
      isBinary: false,
      fileSize: stats.size,
    }

    // Build output
    let output = formattedContent

    // Add truncation notice if applicable
    if (truncated) {
      output += `\n\n[Showing lines ${offset}-${endIndex} of ${totalLines} total lines]`
    }

    // Handle empty files
    if (selectedLines.length === 0 || (selectedLines.length === 1 && selectedLines[0] === '')) {
      output = `[Empty file: ${resolvedPath}]`
    }

    return {
      title: `Read ${path.basename(resolvedPath)} (${selectedLines.length} lines)`,
      output,
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid read parameters:\n${issues.join('\n')}`
  },
})
