/**
 * Built-in Tool: Read
 *
 * Reads file contents with support for:
 * - Offset/limit continuation for large files
 * - Line/byte truncation
 * - Binary file detection
 * - Image preview support
 */

import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { toJsonObject } from '../../../shared/json.js'
import { checkFileAccess, findReadSandboxRootForPath, getSandboxBoundary, resolveToolPath } from '../core/sandbox.js'
import { classifySensitiveFile } from '../core/sensitive-files.js'

// Maximum lines/bytes to return by default, matching Pi's read tool behavior.
const DEFAULT_LIMIT = 2000
const DEFAULT_MAX_BYTES = 50 * 1024
// Binary file detection - check first N bytes
const BINARY_CHECK_BYTES = 8192
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/**
 * Read Tool Metadata
 */
export interface ReadMetadata {
  path: string
  lineCount: number
  offset: number
  limit: number
  truncated: boolean
  isBinary: boolean
  fileSize: number
  mimeType?: string
  truncation?: ReadTruncation
  sensitive?: boolean
}

interface ReadTruncation {
  truncated: boolean
  truncatedBy: 'bytes' | 'lines' | null
  outputLines: number
  totalLines: number
  maxBytes: number
  maxLines: number
  firstLineExceedsLimit?: boolean
}

interface TruncatedTextResult {
  content: string
  truncation: ReadTruncation
}

/**
 * Read Tool Parameters Schema
 */
const ReadParameters = z.object({
  path: z
    .string()
    .describe('Path to the file to read (relative or absolute)'),
  offset: z
    .number()
    .optional()
    .describe('Line number to start reading from (1-indexed)'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of lines to read'),
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Number.isInteger(kb) ? kb : kb.toFixed(1)}KB`
  const mb = kb / 1024
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf-8')
}

/**
 * Return the head of text bounded by both line and byte limits. The output is
 * raw file text (no line numbers), so models can copy oldText for exact edits.
 */
function truncateHead(text: string, maxLines = DEFAULT_LIMIT, maxBytes = DEFAULT_MAX_BYTES): TruncatedTextResult {
  const allLines = text.split('\n')
  const totalLines = allLines.length
  const firstLineBytes = utf8Bytes(allLines[0] ?? '')

  if (firstLineBytes > maxBytes) {
    return {
      content: '',
      truncation: {
        truncated: true,
        truncatedBy: 'bytes',
        outputLines: 0,
        totalLines,
        maxBytes,
        maxLines,
        firstLineExceedsLimit: true,
      },
    }
  }

  const selectedLines: string[] = []
  let selectedBytes = 0
  let truncatedBy: ReadTruncation['truncatedBy'] = null

  for (let i = 0; i < allLines.length; i++) {
    if (selectedLines.length >= maxLines) {
      truncatedBy = 'lines'
      break
    }

    const separatorBytes = selectedLines.length > 0 ? 1 : 0
    const nextBytes = separatorBytes + utf8Bytes(allLines[i])
    if (selectedBytes + nextBytes > maxBytes) {
      truncatedBy = 'bytes'
      break
    }

    selectedLines.push(allLines[i])
    selectedBytes += nextBytes
  }

  const outputLines = selectedLines.length
  return {
    content: selectedLines.join('\n'),
    truncation: {
      truncated: truncatedBy !== null,
      truncatedBy,
      outputLines,
      totalLines,
      maxBytes,
      maxLines,
    },
  }
}

/**
 * Get file extension
 */
function getExtension(targetPath: string): string {
  return path.extname(targetPath).toLowerCase()
}

/**
 * Detect images supported by Pi's read tool contract.
 */
function detectSupportedImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  const header = buffer.subarray(0, 12).toString('ascii')
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif'
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp'

  return null
}

function supportedImageMimeType(targetPath: string, buffer: Buffer): string | null {
  return detectSupportedImageMimeType(buffer) ?? IMAGE_MIME_BY_EXTENSION[getExtension(targetPath)] ?? null
}

/**
 * Check if file is a PDF
 */
function isPdfFile(targetPath: string): boolean {
  return getExtension(targetPath) === '.pdf'
}

/**
 * Read Tool Definition
 */
export const ReadTool = Tool.define<typeof ReadParameters, ReadMetadata>('read', {
  name: 'Read',
  description: `Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to ${DEFAULT_LIMIT} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true, // Safe read-only operation
  permissionGuard: 'sandboxed',
  executionMode: 'parallel',
  renderKind: 'file',

  parameters: ReadParameters,

  async analyze(args, ctx) {
    const resolvedPath = resolveToolPath(args.path, ctx.workingDirectory)
    const boundary = getSandboxBoundary(ctx.workingDirectory)
    const matchedRoot = findReadSandboxRootForPath(resolvedPath, ctx.workingDirectory, ctx.workingDirectoryRoots)
    const sensitivity = classifySensitiveFile(resolvedPath)
    const effects = []
    if (!matchedRoot) {
      effects.push({
        kind: 'external_directory' as const,
        resources: [path.join(path.dirname(resolvedPath), '*')],
        barrier: true,
        external: true,
        metadata: {
          path: resolvedPath,
          boundary,
          operation: 'Read file',
          targetType: 'file',
        },
      })
    }
    effects.push({
      kind: sensitivity.sensitive ? 'sensitive_file_read' as const : 'read' as const,
      resources: [resolvedPath],
      barrier: sensitivity.sensitive,
      sensitive: sensitivity.sensitive,
      metadata: sensitivity.sensitive ? {
        path: resolvedPath,
        category: sensitivity.category,
        reason: sensitivity.reason,
      } : { path: resolvedPath },
    })
    return {
      effects,
      preview: {
        title: sensitivity.sensitive ? `Read sensitive file: ${path.basename(resolvedPath)}` : `Read ${path.basename(resolvedPath)}`,
        path: resolvedPath,
      },
    }
  },

  async execute(args, ctx) {
    const { offset = 1, limit } = args

    const throwIfAborted = () => {
      if (ctx.abortSignal?.aborted) throw new Error('Operation aborted')
    }
    throwIfAborted()

    // Check sandbox boundary and request permission if needed
    const resolvedPath = await checkFileAccess(args.path, ctx, 'Read file')
    throwIfAborted()

    const sensitivity = classifySensitiveFile(resolvedPath)

    ctx.updateResult?.({
      content: [{ type: 'text', text: `Reading ${resolvedPath}...` }],
      details: { phase: 'reading', path: resolvedPath, offset, limit },
    })

    // Update metadata with initial state
    ctx.metadata({
      title: `Reading ${path.basename(resolvedPath)}`,
      metadata: {
        path: resolvedPath,
        lineCount: 0,
        offset,
        limit,
        truncated: false,
        isBinary: false,
        fileSize: 0,
        sensitive: sensitivity.sensitive,
      },
    })

    // Check if file exists
    let stats
    try {
      stats = await fs.stat(resolvedPath)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`File not found: ${resolvedPath}`)
      }
      throw error
    }

    throwIfAborted()

    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${resolvedPath}. Use ls command via Bash tool to list directory contents.`)
    }

    // Handle PDF files
    if (isPdfFile(resolvedPath)) {
      ctx.updateResult?.({
        content: [{ type: 'file', path: resolvedPath }],
        details: toJsonObject({ phase: 'ready', path: resolvedPath, fileSize: stats.size, isBinary: true }),
      })
      return {
        title: `PDF: ${path.basename(resolvedPath)}`,
        output: `[PDF file: ${resolvedPath}]\nSize: ${stats.size} bytes\nThis is a PDF file. Use a PDF viewer to read its contents.`,
        metadata: {
          path: resolvedPath,
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
    throwIfAborted()

    // Handle image files
    const imageMimeType = supportedImageMimeType(resolvedPath, buffer)
    if (imageMimeType) {
      const imageData = buffer.toString('base64')
      const output = `[Image file: ${resolvedPath}]\nSize: ${stats.size} bytes\nMIME type: ${imageMimeType}\nThis image was attached for vision-capable models. Content cannot be displayed as text.`
      const metadata: ReadMetadata = {
        path: resolvedPath,
        lineCount: 0,
        offset: 0,
        limit: 0,
        truncated: false,
        isBinary: true,
        fileSize: stats.size,
        mimeType: imageMimeType,
      }

      ctx.updateResult?.({
        content: [
          { type: 'text', text: output },
          { type: 'image', path: resolvedPath, data: imageData, mimeType: imageMimeType },
        ],
        details: toJsonObject({ phase: 'ready', ...metadata }),
      })
      return {
        title: `Image: ${path.basename(resolvedPath)}`,
        output,
        metadata,
        attachments: [{
          type: 'image' as const,
          path: resolvedPath,
          content: imageData,
          mimeType: imageMimeType,
        }],
      }
    }

    // Check if binary
    if (isBinaryBuffer(buffer)) {
      ctx.updateResult?.({
        content: [{ type: 'file', path: resolvedPath }],
        details: toJsonObject({ phase: 'ready', path: resolvedPath, fileSize: stats.size, isBinary: true }),
      })
      return {
        title: `Binary: ${path.basename(resolvedPath)}`,
        output: `[Binary file: ${resolvedPath}]\nSize: ${stats.size} bytes\nThis appears to be a binary file. Content cannot be displayed as text.`,
        metadata: {
          path: resolvedPath,
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

    // Apply offset and optional user limit (offset is 1-based)
    const startIndex = Math.max(0, offset - 1)
    if (startIndex >= totalLines) {
      throw new Error(`Offset ${offset} is beyond end of file (${totalLines} lines total)`)
    }

    const endIndex = limit !== undefined
      ? Math.min(totalLines, startIndex + limit)
      : totalLines
    const selectedText = allLines.slice(startIndex, endIndex).join('\n')
    const userLimitedLines = limit !== undefined ? endIndex - startIndex : undefined
    const truncatedResult = truncateHead(selectedText)
    const { truncation } = truncatedResult
    const startLineDisplay = startIndex + 1
    let output = truncatedResult.content
    let outputLineCount = truncation.outputLines

    if (truncation.firstLineExceedsLimit) {
      const firstLineSize = formatSize(utf8Bytes(allLines[startIndex] ?? ''))
      output = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${args.path} | head -c ${DEFAULT_MAX_BYTES}]`
    } else if (truncation.truncated) {
      const endLineDisplay = startLineDisplay + truncation.outputLines - 1
      const nextOffset = endLineDisplay + 1
      if (truncation.truncatedBy === 'lines') {
        output += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalLines}. Use offset=${nextOffset} to continue.]`
      } else {
        output += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`
      }
    } else if (userLimitedLines !== undefined && startIndex + userLimitedLines < totalLines) {
      const remaining = totalLines - (startIndex + userLimitedLines)
      const nextOffset = startIndex + userLimitedLines + 1
      output += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`
    }

    // Handle empty files
    if (totalLines === 1 && allLines[0] === '') {
      output = `[Empty file: ${resolvedPath}]`
      outputLineCount = 0
    }

    const metadata: ReadMetadata = {
      path: resolvedPath,
      lineCount: outputLineCount,
      offset,
      limit: limit ?? DEFAULT_LIMIT,
      truncated: truncation.truncated || (userLimitedLines !== undefined && startIndex + userLimitedLines < totalLines),
      truncation,
      isBinary: false,
      fileSize: stats.size,
    }

    ctx.updateResult?.({
      content: [{ type: 'text', text: output }],
      details: toJsonObject({ phase: 'ready', ...metadata }),
    })

    return {
      title: `${path.basename(resolvedPath)} (${outputLineCount} lines)`,
      output,
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid read parameters:\n${issues.join('\n')}\n\nUsage: read({ path: string, offset?: number, limit?: number }). The path field is required.`
  },
})
