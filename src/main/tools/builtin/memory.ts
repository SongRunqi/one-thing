/**
 * Built-in Tool: Memory
 *
 * Allows AI to directly update the text-based memory system.
 * The AI uses this tool to:
 * 1. Update user profile information
 * 2. Update user preferences
 * 3. Create or update topic-specific memories
 * 4. Read existing memories
 */

import { z } from 'zod'
import { Tool } from '../core/tool.js'
import {
  updateUserProfile,
  updateUserPreferences,
  createTopicFile,
  listExistingTopics,
} from '../../services/memory-text/index.js'
import { getTextMemoryStorage } from '../../services/memory-text/text-memory-storage.js'
import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Normalize content to ensure it has exactly one leading dash
 * Strips any existing dashes/bullets before adding one
 */
function formatAsListItem(content: string): string {
  const cleaned = content.replace(/^[\s\-•*]+/, '').trim()
  return `- ${cleaned}`
}

/**
 * Memory Tool Metadata
 */
export interface MemoryMetadata {
  action: 'update_profile' | 'update_preferences' | 'create_topic' | 'list_topics' | 'read_memory' | 'edit_section'
  success: boolean
  [key: string]: unknown
}

/**
 * Memory Tool Parameters Schema
 */
const MemoryParameters = z.object({
  action: z
    .enum(['update_profile', 'update_preferences', 'create_topic', 'list_topics', 'read_memory', 'edit_section'])
    .describe('The action to perform on the memory system'),

  section: z
    .string()
    .optional()
    .describe('Section name for the memory (e.g., "Basic Info", "Work", "Hobbies")'),

  content: z
    .string()
    .optional()
    .describe('Content to add (as a single line, will be formatted as markdown list item)'),

  topic: z
    .string()
    .optional()
    .describe('Topic name for topic-specific memories (e.g., "vue", "electron", "cooking")'),

  tags: z
    .array(z.string())
    .optional()
    .describe('Tags for categorizing the memory (e.g., ["personal", "tech", "frontend"])'),

  file_path: z
    .string()
    .optional()
    .describe('Relative file path to read (e.g., "_core/profile.md", "topics/vue.md")'),
})

/**
 * Memory Tool Definition
 */
export const MemoryTool = Tool.define<typeof MemoryParameters, MemoryMetadata>('memory', {
  name: 'Memory',
  description: `Update or read the user's memory system. Use this to remember important information about the user.

IMPORTANT: Choose the right action based on intent:
- Adding NEW info → use update_profile/update_preferences (appends, auto-deduplicates exact matches)
- Modifying/refining EXISTING info → use read_memory first, then edit_section (replaces entire section)

Actions:
- update_profile: Add NEW personal info (name, age, job, background). Appends to section.
- update_preferences: Add NEW user preferences. Appends to section.
- create_topic: Create/update topic-specific notes (projects, technologies)
- list_topics: List all existing topic files
- read_memory: Read a specific memory file (use before edit_section!)
- edit_section: Replace entire content of a section. Use when updating/refining existing info.

Workflow for updating existing info:
1. read_memory to see current content
2. edit_section to replace with updated content

Examples:
1. NEW info - User says "I'm Yitian, born in 2000":
   { "action": "update_profile", "section": "Basic Info", "content": "Name: Yitian, Born: 2000", "tags": ["personal"] }

2. NEW preference - User prefers Vue:
   { "action": "update_preferences", "section": "Tech Stack", "content": "Prefers Vue.js for frontend", "tags": ["frontend", "vue"] }

3. UPDATING existing info - User clarifies "Actually I prefer Vue 3 with Composition API":
   Step 1: { "action": "read_memory", "file_path": "_core/preferences.md" }
   Step 2: { "action": "edit_section", "file_path": "_core/preferences.md", "section": "Tech Stack", "content": "- Prefers Vue 3 with Composition API\n- Uses TypeScript" }

4. Read user profile:
   { "action": "read_memory", "file_path": "_core/profile.md" }`,

  category: 'builtin',
  enabled: true,
  autoExecute: true, // Memory updates are safe, no user confirmation needed

  parameters: MemoryParameters,

  async execute(args, _ctx) {
    const { action, section, content, topic, tags, file_path } = args

    console.log('[MemoryTool] execute called with:', JSON.stringify(args, null, 2))

    try {
      switch (action) {
        case 'update_profile': {
          if (!content) {
            throw new Error('content is required for update_profile action')
          }
          await updateUserProfile(
            section || 'Notes',
            formatAsListItem(content),
            tags
          )
          return {
            title: 'Profile Updated',
            output: `Added to profile (${section || 'Notes'}): ${content}`,
            metadata: { action, success: true },
          }
        }

        case 'update_preferences': {
          if (!content) {
            throw new Error('content is required for update_preferences action')
          }
          await updateUserPreferences(
            section || 'General',
            formatAsListItem(content),
            tags
          )
          return {
            title: 'Preferences Updated',
            output: `Added to preferences (${section || 'General'}): ${content}`,
            metadata: { action, success: true },
          }
        }

        case 'create_topic': {
          if (!topic) {
            throw new Error('topic is required for create_topic action')
          }
          if (!content) {
            throw new Error('content is required for create_topic action')
          }
          await createTopicFile(
            topic,
            `## ${section || 'Notes'}\n${formatAsListItem(content)}`,
            undefined, // agentId - for global topics
            tags
          )
          return {
            title: 'Topic Created/Updated',
            output: `Added to topic "${topic}" (${section || 'Notes'}): ${content}`,
            metadata: { action, success: true, topic },
          }
        }

        case 'list_topics': {
          const topics = await listExistingTopics(undefined)
          const output = topics.length > 0
            ? `Existing topics:\n${topics.map(t => `- ${t}`).join('\n')}`
            : 'No topics found. Use create_topic to add one.'
          return {
            title: `${topics.length} Topics Found`,
            output,
            metadata: { action, success: true, topicCount: topics.length },
          }
        }

        case 'read_memory': {
          if (!file_path) {
            throw new Error('file_path is required for read_memory action')
          }
          const storage = getTextMemoryStorage()
          const fullPath = path.join(storage.getBaseDir(), file_path)

          try {
            const content = await fs.readFile(fullPath, 'utf-8')
            return {
              title: `Memory: ${file_path}`,
              output: content,
              metadata: { action, success: true, file_path },
            }
          } catch (err) {
            return {
              title: `Memory Not Found`,
              output: `File not found: ${file_path}. Available paths: _core/profile.md, _core/preferences.md, topics/*.md`,
              metadata: { action, success: false, file_path },
            }
          }
        }

        case 'edit_section': {
          if (!file_path) {
            throw new Error('file_path is required for edit_section action')
          }
          if (!section) {
            throw new Error('section is required for edit_section action')
          }
          if (!content) {
            throw new Error('content is required for edit_section action')
          }
          const storage = getTextMemoryStorage()
          await storage.replaceSection(file_path, section, content, { tags })
          return {
            title: 'Section Updated',
            output: `Replaced section "${section}" in ${file_path}`,
            metadata: { action, success: true, file_path, section },
          }
        }

        default:
          throw new Error(`Unknown action: ${action}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[MemoryTool] Error:', errorMessage)
      return {
        title: 'Memory Error',
        output: `Failed to ${action}: ${errorMessage}`,
        metadata: { action, success: false, error: errorMessage },
      }
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid memory parameters:\n${issues.join('\n')}`
  },
})
