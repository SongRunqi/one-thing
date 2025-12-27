/**
 * Skills Prompt Builder
 *
 * Utilities for formatting skill information for AI prompts.
 * Follows official Claude Code Skills pattern - uses Bash to read SKILL.md files.
 */

import type { SkillDefinition } from '../../shared/ipc.js'

/**
 * Build skills awareness prompt for system message
 * This gives Claude awareness of available skills with instructions to use Bash for reading
 */
export function buildSkillsAwarenessPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return ''

  const skillsList = skills
    .map(skill => {
      let entry = `- **${skill.name}** (${skill.source})
  Description: ${skill.description}
  Path: ${skill.directoryPath}/`

      // List available files if any
      if (skill.files && skill.files.length > 0) {
        const fileNames = skill.files.map(f => f.name).join(', ')
        entry += `
  Files: SKILL.md, ${fileNames}`
      } else {
        entry += `
  Files: SKILL.md`
      }

      return entry
    })
    .join('\n\n')

  return `## Available Skills

You have access to Claude Code Skills - modular capabilities that provide specialized instructions.

### How to Use Skills

When a user's request relates to a skill:
1. **First explain**: Briefly tell the user what you're about to do (e.g., "Let me check the agent-plan skill instructions first.")
2. **Then execute**: Read the skill's SKILL.md file using bash: \`cat {path}/SKILL.md\`
3. **Continue**: Follow the instructions in the skill file and execute any scripts as needed

**Important**: Always explain your intent before executing any command. Don't jump directly to tool calls.

### Available Skills

${skillsList}`
}

/**
 * Build skills prompt for when tools are disabled
 * Includes abbreviated instructions directly since no tool invocation is possible
 */
export function buildSkillsDirectPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return ''

  const MAX_INSTRUCTION_LENGTH = 1000

  const skillsContent = skills
    .map(skill => {
      // Truncate long instructions
      const instructions = skill.instructions.length > MAX_INSTRUCTION_LENGTH
        ? skill.instructions.slice(0, MAX_INSTRUCTION_LENGTH) + '\n\n... (instructions truncated)'
        : skill.instructions

      return `### Skill: ${skill.name}
**Description:** ${skill.description}

${instructions}`
    })
    .join('\n\n---\n\n')

  return `## Available Skills

You have access to the following Claude Code Skills. Use them when the user's request matches their description.

${skillsContent}`
}

/**
 * Build skills prompt for SkillTool usage (OpenCode pattern)
 * Instead of exposing paths, directs the agent to use the skill tool
 */
export function buildSkillToolPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return ''

  const skillsList = skills
    .map(skill => `- **${skill.name}**: ${skill.description}`)
    .join('\n')

  return `## Available Skills

You have access to specialized skills through the \`skill\` tool.

### How to Use Skills

When a user's request relates to a skill:
1. Use the \`skill\` tool with the skill name: \`skill({ name: "skill-name" })\`
2. The tool will return the full skill instructions
3. Follow the returned instructions to complete the task

### Available Skills

${skillsList}

**Note**: Use the skill tool to load instructions - do not try to read skill files directly.`
}

/**
 * Format skill list for error messages
 */
export function formatSkillsList(skills: SkillDefinition[]): string {
  if (skills.length === 0) return 'No skills available'
  return skills.map(s => s.name).join(', ')
}
