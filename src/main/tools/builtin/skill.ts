/**
 * Skill Tool - Load skills on-demand
 *
 * Instead of exposing all skills in the system prompt, this tool allows
 * the AI to load skills on-demand. This provides:
 * - Dynamic descriptions based on available skills
 * - No Bash dependency (no `cat SKILL.md`)
 */

import { z } from 'zod'
import fs from 'fs'
import { Tool, type InitContext, type ToolContext, type ToolResult } from '../core/tool.js'
import type { SkillDefinition } from '../../../shared/ipc.js'
import { fuzzyFilter } from '../../utils/fuzzy.js'

/**
 * Skill tool metadata for UI display
 */
interface SkillMetadata {
  skillName: string
  skillSource: string
  [key: string]: unknown
}

/**
 * Build a compact, stable description. The available skill list is returned by
 * action=list instead of being embedded in the model-facing tool schema.
 */
function buildDescription(): string {
  return [
    'Search, find, list, or load installed skills on demand.',
    'Use action="search" or action="find" with query text to fuzzy-search relevant skills, then action="load" with a skill name when the user asks for a skill or after search identifies a relevant skill.',
    'The tool returns full instructions only for the requested skill.',
  ].join(' ')
}

function formatSkillList(skills: SkillDefinition[], query?: string): string {
  const normalizedQuery = query?.trim()
  const filtered = normalizedQuery
    ? fuzzyFilter(
        skills.map(skill => ({
          item: skill,
          text: `${skill.name} ${skill.description}`,
        })),
        normalizedQuery,
      ).map(result => result.item)
    : skills

  if (filtered.length === 0) {
    return normalizedQuery
      ? `No skills matched query "${query}".`
      : 'No skills are currently available.'
  }

  return filtered
    .map(skill => `- ${skill.name}: ${skill.description}`)
    .join('\n')
}

/**
 * SkillTool - async tool with dynamic initialization
 */
export const SkillTool = Tool.define(
  'skill',
  {
    name: 'Skill',
    category: 'builtin',
    autoExecute: true, // Skills are read-only, safe to auto-execute
    permissionGuard: 'safe',
    executionMode: 'parallel',
    renderKind: 'text',
  },
  async (ctx?: InitContext) => {
    const skills = (ctx?.skills ?? []) as SkillDefinition[]
    const skillNames = skills.map(s => s.name)

    const parameters = z.object({
      action: z.enum(['search', 'find', 'list', 'load']).describe('Use "search" or "find" to fuzzy-search skills, "list" to show available skills, or "load" to read one skill instruction file.'),
      name: z.string().optional().describe('Skill name to load. Required when action is "load".'),
      query: z.string().optional().describe('Fuzzy search text for action "search" or "find". Optional for action "list".'),
    })

    return {
      description: buildDescription(),
      parameters,
      executionMode: 'parallel',
      renderKind: 'text',

      async execute(
        args: { action: 'search' | 'find' | 'list' | 'load'; name?: string; query?: string },
        toolCtx: ToolContext<SkillMetadata>
      ): Promise<ToolResult<SkillMetadata>> {
        const { action, name, query } = args

        if (action === 'search' || action === 'find' || action === 'list') {
          const output = formatSkillList(skills, query)
          toolCtx.updateResult?.({
            content: [{ type: 'text', text: output }],
            details: { phase: 'ready', skillName: query || 'all' },
          })
          return {
            title: query ? `Skills matching: ${query}` : 'Available skills',
            output,
            metadata: {
              skillName: query || 'all',
              skillSource: 'list',
            },
          }
        }

        if (!name?.trim()) {
          return {
            title: 'Skill name required',
            output: 'Error: action "load" requires a skill name. Use action "search" or "find" first if you need to discover available skills.',
            metadata: {
              skillName: '',
              skillSource: 'unknown',
            },
          }
        }

        const skillName = name.trim()

        toolCtx.updateResult?.({
          content: [{ type: 'text', text: `Loading skill: ${skillName}...` }],
          details: { phase: 'loading', skillName },
        })

        const skill = skills.find(s => s.name === skillName)
        if (!skill) {
          return {
            title: `Skill not found: ${skillName}`,
            output: `Error: Skill "${skillName}" not found. Use action "search" or "find" to discover available skills.${skillNames.length > 0 ? ` Available skill names: ${skillNames.join(', ')}` : ''}`,
            metadata: {
              skillName,
              skillSource: 'unknown',
            },
          }
        }

        toolCtx.metadata({
          title: `Loading skill: ${skillName}`,
          metadata: {
            skillName,
            skillSource: skill.source,
          },
        })

        // Load skill content from file
        try {
          const content = fs.readFileSync(skill.path, 'utf-8')
          toolCtx.updateResult?.({
            content: [{ type: 'text', text: content }],
            details: { phase: 'ready', skillName, skillSource: skill.source },
          })
          return {
            title: `Loaded skill: ${skillName}`,
            output: content,
            metadata: {
              skillName,
              skillSource: skill.source,
            },
          }
        } catch (error: any) {
          return {
            title: `Failed to load skill: ${skillName}`,
            output: `Error reading skill file: ${error.message}`,
            metadata: {
              skillName,
              skillSource: skill.source,
            },
          }
        }
      },
    }
  }
)
