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

When a user's request matches a skill's description:
1. Use Bash to read the SKILL.md file: \`cat {path}/SKILL.md\`
2. Follow the instructions in the file
3. If the skill references additional files, read them with Bash as needed

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
 * Format skill list for error messages
 */
export function formatSkillsList(skills: SkillDefinition[]): string {
  if (skills.length === 0) return 'No skills available'
  return skills.map(s => s.name).join(', ')
}
