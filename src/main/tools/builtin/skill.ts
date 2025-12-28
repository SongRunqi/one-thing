/**
 * Skill Tool - Load skills on-demand with permission control
 *
 * Instead of exposing all skills in the system prompt, this tool allows
 * the agent to load skills on-demand. This provides:
 * - Permission control (allow/deny/ask) per agent
 * - Dynamic descriptions based on accessible skills
 * - No Bash dependency (no `cat SKILL.md`)
 *
 * Based on OpenCode's skill system design.
 */

import { z } from 'zod'
import fs from 'fs'
import { Tool, type InitContext, type ToolContext, type ToolResult } from '../core/tool.js'
import { Permission } from '../../permission/index.js'
import { Wildcard } from '../../utils/wildcard.js'
import type { SkillDefinition, AgentPermissions, SkillPermission } from '../../../shared/ipc.js'

/**
 * Skill tool metadata for UI display
 */
interface SkillMetadata {
  skillName: string
  skillSource: string
  permission: SkillPermission
  [key: string]: unknown  // Index signature for ToolMetadata compatibility
}

/**
 * Get permission level for a skill based on agent permissions
 * Returns 'allow' if no agent or no permissions configured
 */
function getSkillPermission(
  skillName: string,
  agentPermissions?: AgentPermissions
): SkillPermission {
  if (!agentPermissions?.skill) {
    return 'allow' // Default: allow all
  }

  const result = Wildcard.all(skillName, agentPermissions.skill)
  return result ?? 'allow' // Default: allow if no pattern matches
}

/**
 * Filter skills by permission (exclude 'deny' skills)
 */
function filterAccessibleSkills(
  skills: SkillDefinition[],
  agentPermissions?: AgentPermissions
): SkillDefinition[] {
  return skills.filter(skill => {
    const permission = getSkillPermission(skill.name, agentPermissions)
    return permission !== 'deny'
  })
}

/**
 * Build dynamic description based on accessible skills
 */
function buildDescription(accessibleSkills: SkillDefinition[]): string {
  if (accessibleSkills.length === 0) {
    return `Load a skill to get specialized instructions. No skills are currently available.`
  }

  const skillList = accessibleSkills
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
    // Get skills and agent from context
    // Cast skills to SkillDefinition[] - the context provides the correct structure
    const skills = (ctx?.skills ?? []) as SkillDefinition[]
    const agentPermissions = ctx?.agent?.permissions as AgentPermissions | undefined

    // Filter to accessible skills (exclude 'deny')
    const accessibleSkills = filterAccessibleSkills(skills, agentPermissions)

    // Build skill names for enum validation
    const skillNames = accessibleSkills.map(s => s.name)

    // Create parameters schema
    // If no skills, still allow the tool but it will return an error
    const parameters = z.object({
      name: skillNames.length > 0
        ? z.enum(skillNames as [string, ...string[]]).describe('Name of the skill to load')
        : z.string().describe('Name of the skill to load'),
    })

    return {
      description: buildDescription(accessibleSkills),
      parameters,

      async execute(
        args: { name: string },
        toolCtx: ToolContext<SkillMetadata>
      ): Promise<ToolResult<SkillMetadata>> {
        const { name } = args

        // Find the skill
        const skill = skills.find(s => s.name === name)
        if (!skill) {
          return {
            title: `Skill not found: ${name}`,
            output: `Error: Skill "${name}" not found. Available skills: ${skillNames.join(', ') || 'none'}`,
            metadata: {
              skillName: name,
              skillSource: 'unknown',
              permission: 'deny',
            },
          }
        }

        // Check permission
        const permission = getSkillPermission(name, agentPermissions)

        toolCtx.metadata({
          title: `Loading skill: ${name}`,
          metadata: {
            skillName: name,
            skillSource: skill.source,
            permission,
          },
        })

        // Handle permission levels
        if (permission === 'deny') {
          return {
            title: `Skill denied: ${name}`,
            output: `Error: You do not have permission to use the "${name}" skill.`,
            metadata: {
              skillName: name,
              skillSource: skill.source,
              permission,
            },
          }
        }

        if (permission === 'ask') {
          // Request permission from user
          try {
            await Permission.ask({
              type: 'skill',
              title: `Use skill: ${name}`,
              pattern: `skill:${name}`,
              sessionId: toolCtx.sessionId,
              messageId: toolCtx.messageId,
              callId: toolCtx.toolCallId,
              metadata: {
                skillName: name,
                skillDescription: skill.description,
                skillSource: skill.source,
              },
            })
          } catch (error) {
            if (error instanceof Permission.RejectedError) {
              return {
                title: `Skill rejected: ${name}`,
                output: `The user rejected permission to use the "${name}" skill.`,
                metadata: {
                  skillName: name,
                  skillSource: skill.source,
                  permission,
                },
              }
            }
            throw error
          }
        }

        // Read skill content
        let content: string
        try {
          content = fs.readFileSync(skill.path, 'utf-8')
        } catch (error) {
          return {
            title: `Failed to read skill: ${name}`,
            output: `Error reading skill file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            metadata: {
              skillName: name,
              skillSource: skill.source,
              permission,
            },
          }
        }

        // Replace {baseDir} placeholder with actual skill directory path
        const instructions = skill.instructions.replace(/\{baseDir\}/g, skill.directoryPath)

        // Build output with skill information
        const output = `# Skill: ${skill.name}

${skill.description}

---

${instructions}

---

Skill directory: ${skill.directoryPath}
${skill.files?.length ? `Additional files:\n${skill.files.map(f => `- ${skill.directoryPath}/${f.name}`).join('\n')}\n` : ''}
Follow the instructions above to complete the task.`

        return {
          title: `Loaded skill: ${name}`,
          output,
          metadata: {
            skillName: name,
            skillSource: skill.source,
            permission,
          },
        }
      },
    }
  }
)
