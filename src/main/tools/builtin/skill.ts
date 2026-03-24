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

/**
 * Skill tool metadata for UI display
 */
interface SkillMetadata {
  skillName: string
  skillSource: string
  [key: string]: unknown
}

/**
 * Build dynamic description based on available skills
 */
function buildDescription(skills: SkillDefinition[]): string {
  if (skills.length === 0) {
    return `Load a skill to get specialized instructions. No skills are currently available.`
  }

  const skillList = skills
    .map(s => `- ${s.name}: ${s.description}`)
    .join('\n')

  return `Load a skill to get specialized instructions for a specific task.

Available skills:
${skillList}

Use this tool when:
- The user asks you to use a specific skill (e.g., "use the code-review skill")
- The user mentions a skill by name (e.g., "/commit", "commit skill")
- The task matches a skill's description

The tool returns the full skill instructions that you should follow.`
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
  },
  async (ctx?: InitContext) => {
    const skills = (ctx?.skills ?? []) as SkillDefinition[]
    const skillNames = skills.map(s => s.name)

    const parameters = z.object({
      name: skillNames.length > 0
        ? z.enum(skillNames as [string, ...string[]]).describe('Name of the skill to load')
        : z.string().describe('Name of the skill to load'),
    })

    return {
      description: buildDescription(skills),
      parameters,

      async execute(
        args: { name: string },
        toolCtx: ToolContext<SkillMetadata>
      ): Promise<ToolResult<SkillMetadata>> {
        const { name } = args

        const skill = skills.find(s => s.name === name)
        if (!skill) {
          return {
            title: `Skill not found: ${name}`,
            output: `Error: Skill "${name}" not found. Available skills: ${skillNames.join(', ') || 'none'}`,
            metadata: {
              skillName: name,
              skillSource: 'unknown',
            },
          }
        }

        toolCtx.metadata({
          title: `Loading skill: ${name}`,
          metadata: {
            skillName: name,
            skillSource: skill.source,
          },
        })

        // Load skill content from file
        try {
          const content = fs.readFileSync(skill.path, 'utf-8')
          return {
            title: `Loaded skill: ${name}`,
            output: content,
            metadata: {
              skillName: name,
              skillSource: skill.source,
            },
          }
        } catch (error: any) {
          return {
            title: `Failed to load skill: ${name}`,
            output: `Error reading skill file: ${error.message}`,
            metadata: {
              skillName: name,
              skillSource: skill.source,
            },
          }
        }
      },
    }
  }
)
