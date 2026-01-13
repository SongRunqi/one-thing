/**
 * Markdown Utilities for Memory System
 *
 * Shared utilities for parsing and manipulating Markdown content.
 * Eliminates duplicate section parsing logic across files.
 */

/**
 * Represents a parsed section from a Markdown file
 */
export interface MarkdownSection {
  /** Section heading (without the ## prefix) */
  heading: string
  /** Section content (without the heading line) */
  content: string
  /** Source file path (optional) */
  file?: string
}

/**
 * Parse a Markdown file into sections based on ## headings
 *
 * @param content - Raw Markdown content
 * @param filePath - Optional file path to include in section metadata
 * @returns Array of parsed sections
 */
export function parseSectionsFromMarkdown(
  content: string,
  filePath?: string
): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  const lines = content.split('\n')

  let currentHeading = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // Save previous section if exists
      if (currentHeading && currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
          file: filePath,
        })
      }
      currentHeading = line.substring(3).trim()
      currentContent = []
    } else if (currentHeading) {
      currentContent.push(line)
    }
  }

  // Save last section
  if (currentHeading && currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
      file: filePath,
    })
  }

  return sections
}

/**
 * Format sections back into Markdown content
 *
 * @param sections - Array of sections to format
 * @returns Formatted Markdown string
 */
export function formatMarkdownSections(sections: MarkdownSection[]): string {
  return sections
    .map(section => `## ${section.heading}\n${section.content}`)
    .join('\n\n')
}

/**
 * Append content to a specific section in Markdown
 *
 * If the section doesn't exist, it will be created at the end.
 * If it exists, the new content is appended to that section.
 *
 * @param content - Original Markdown content
 * @param sectionHeading - The heading to find/create
 * @param newContent - Content to append
 * @returns Updated Markdown content
 */
export function appendToMarkdownSection(
  content: string,
  sectionHeading: string,
  newContent: string
): string {
  const lines = content.split('\n')
  const result: string[] = []
  let foundSection = false
  let inTargetSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      if (line.substring(3).trim() === sectionHeading) {
        foundSection = true
        inTargetSection = true
        result.push(line)
      } else {
        if (inTargetSection) {
          // End of target section, insert new content before next section
          result.push(newContent)
          inTargetSection = false
        }
        result.push(line)
      }
    } else {
      result.push(line)
    }
  }

  // If still in target section at end of file
  if (inTargetSection) {
    result.push(newContent)
  }

  // If section not found, append new section
  if (!foundSection) {
    result.push('')
    result.push(`## ${sectionHeading}`)
    result.push(newContent)
  }

  return result.join('\n')
}

/**
 * Extract the title from Markdown content (first # heading)
 *
 * @param content - Markdown content
 * @returns Title without # prefix, or undefined if not found
 */
export function extractMarkdownTitle(content: string): string | undefined {
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      return line.substring(2).trim()
    }
  }
  return undefined
}

/**
 * Check if content has a specific section
 *
 * @param content - Markdown content
 * @param sectionHeading - Section heading to look for
 * @returns True if section exists
 */
export function hasSection(content: string, sectionHeading: string): boolean {
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.startsWith('## ') && line.substring(3).trim() === sectionHeading) {
      return true
    }
  }
  return false
}

/**
 * Get all section headings from content
 *
 * @param content - Markdown content
 * @returns Array of section heading strings
 */
export function getSectionHeadings(content: string): string[] {
  const headings: string[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.startsWith('## ')) {
      headings.push(line.substring(3).trim())
    }
  }
  return headings
}
