/**
 * Edit Tool
 *
 * Performs exact string replacements in files using a chain of
 * 9 replacement strategies for intelligent fuzzy matching.
 */

import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Tool } from '../core/tool.js'
import { replace, normalizeLineEndings, trimDiff } from '../core/replacers.js'
import { checkFileAccess } from '../core/sandbox.js'

// Diff library for generating unified diffs
import { createTwoFilesPatch, diffLines } from 'diff'

/**
 * Edit Tool Metadata
 */
export interface EditMetadata {
  filePath: string
  diff: string
  additions: number
  deletions: number
  [key: string]: unknown  // Index signature for ToolMetadata compatibility
}

/**
 * Edit Tool Parameters Schema
 */
const EditParameters = z.object({
  file_path: z
    .string()
    .describe('The absolute path to the file to modify'),
  old_string: z
    .string()
    .describe('The text to replace'),
  new_string: z
    .string()
    .describe('The text to replace it with (must be different from old_string)'),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe('Replace all occurrences of old_string (default false)'),
})

/**
 * Edit Tool Definition
 */
export const EditTool = Tool.define<typeof EditParameters, EditMetadata>('edit', {
  name: 'Edit',
  description: `Performs exact string replacements in files.

Usage:
- The file_path parameter must be an absolute path
- old_string must be unique in the file (or use replace_all for all occurrences)
- new_string must be different from old_string
- Preserves exact indentation from the file
- Uses intelligent fuzzy matching when exact match fails

The edit will FAIL if old_string is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use replace_all to change every instance.`,
  category: 'builtin',
  enabled: true,
  autoExecute: false, // Requires confirmation for file edits

  parameters: EditParameters,

  async execute(args, ctx) {
    const { file_path, old_string, new_string, replace_all } = args

    // Check sandbox boundary and request permission if needed
    const resolvedPath = await checkFileAccess(file_path, ctx, 'Edit file')

    // Validate old_string and new_string are different
    if (old_string === new_string) {
      throw new Error('old_string and new_string must be different')
    }

    // Update metadata with initial state
    ctx.metadata({
      title: `Editing ${path.basename(resolvedPath)}`,
      metadata: {
        filePath: resolvedPath,
        diff: '',
        additions: 0,
        deletions: 0,
      },
    })

    // Handle empty old_string (create new file or replace entire content)
    if (old_string === '') {
      // This means we're creating a new file or replacing entire content
      const contentNew = new_string
      const contentOld = await fs.readFile(resolvedPath, 'utf-8').catch(() => '')
      const diff = trimDiff(
        createTwoFilesPatch(resolvedPath, resolvedPath, contentOld, contentNew)
      )

      await fs.writeFile(resolvedPath, contentNew, 'utf-8')

      const changes = diffLines(contentOld, contentNew)
      let additions = 0
      let deletions = 0
      for (const change of changes) {
        if (change.added) additions += change.count || 0
        if (change.removed) deletions += change.count || 0
      }

      return {
        title: `Created/replaced ${path.basename(resolvedPath)}`,
        output: old_string === '' && contentOld === ''
          ? `Created new file: ${resolvedPath}`
          : `Replaced entire content of: ${resolvedPath}`,
        metadata: {
          filePath: resolvedPath,
          diff,
          additions,
          deletions,
        },
      }
    }

    // Check if file exists
    try {
      const stats = await fs.stat(resolvedPath)
      if (stats.isDirectory()) {
        throw new Error(`Path is a directory, not a file: ${resolvedPath}`)
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${resolvedPath}`)
      }
      throw error
    }

    // Read the file content
    const contentOld = await fs.readFile(resolvedPath, 'utf-8')

    // Perform the replacement using the intelligent replacement chain
    let contentNew: string
    try {
      contentNew = replace(contentOld, old_string, new_string, replace_all)
    } catch (error: any) {
      // Re-throw with more context
      throw new Error(`Failed to edit ${resolvedPath}: ${error.message}`)
    }

    // Generate diff
    const diff = trimDiff(
      createTwoFilesPatch(
        resolvedPath,
        resolvedPath,
        normalizeLineEndings(contentOld),
        normalizeLineEndings(contentNew)
      )
    )

    // Calculate additions and deletions
    const changes = diffLines(contentOld, contentNew)
    let additions = 0
    let deletions = 0
    for (const change of changes) {
      if (change.added) additions += change.count || 0
      if (change.removed) deletions += change.count || 0
    }

    // Update metadata with diff preview
    ctx.metadata({
      title: `Editing ${path.basename(resolvedPath)}`,
      metadata: {
        filePath: resolvedPath,
        diff,
        additions,
        deletions,
      },
    })

    // Write the file
    await fs.writeFile(resolvedPath, contentNew, 'utf-8')

    // Build output message
    let output = `Successfully edited ${resolvedPath}`
    if (replace_all) {
      // Count how many replacements were made
      const occurrences = (contentOld.match(new RegExp(escapeRegExp(old_string), 'g')) || []).length
      output += ` (replaced ${occurrences} occurrence${occurrences !== 1 ? 's' : ''})`
    }

    return {
      title: `Edited ${path.basename(resolvedPath)}`,
      output,
      metadata: {
        filePath: resolvedPath,
        diff,
        additions,
        deletions,
      },
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid edit parameters:\n${issues.join('\n')}`
  },
})

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
