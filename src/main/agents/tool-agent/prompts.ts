/**
 * Tool Agent Prompts
 *
 * System prompts and prompt builders for the Tool Agent.
 * In v2, the main LLM uses native tool_call to invoke the delegate tool,
 * so DELEGATION_INSTRUCTIONS is no longer needed.
 */

import type { SkillDefinition } from '../../../shared/ipc.js'

/**
 * Base system prompt for the Tool Agent
 * Focused on autonomous task execution without conversation
 */
const BASE_TOOL_AGENT_PROMPT = `You are a Tool Execution Agent. Your role is to execute tasks using available tools autonomously.

## Your Capabilities
You have access to tools for:
- File system operations (bash commands: ls, cat, mkdir, rm, mv, cp, etc.)
- Code execution and script running
- MCP tool integrations

## CRITICAL: Narrate Your Actions
You MUST output text to explain your process:

1. **Before each tool call**: Briefly explain what you're about to do and why
   - Example: "Reading the skill documentation to understand the available commands..."
   - Example: "Running the list script to get all plans..."

2. **After getting results**: Briefly summarize what you learned before proceeding
   - Example: "The documentation shows I need to use list-plans.sh script."
   - Example: "The script returned 3 plans: plan-a, plan-b, plan-c."

This narration helps users understand your reasoning process.

## Task Execution Guidelines
1. Execute the task described in the user message
2. Use tools as needed to accomplish the task
3. Handle errors gracefully and retry if appropriate
4. When complete, provide a clear summary

## Output Format
When you complete the task, provide:
- What was done
- What files were modified (if any)
- Any relevant output or results
- Any errors encountered

## Important Rules
- Focus ONLY on the task at hand
- Do NOT engage in conversation or ask questions
- Use your best judgment when details are ambiguous
- If a task cannot be completed, explain why clearly
- Be concise but thorough in your summary`

/**
 * Build skills awareness section for Tool Agent
 */
function buildSkillsSection(skills: SkillDefinition[]): string {
  if (!skills || skills.length === 0) return ''

  const skillsList = skills.map(s => {
    let entry = `- **${s.name}**: ${s.description}`
    // Use directoryPath (skill directory) not path (which already includes SKILL.md)
    if (s.directoryPath) {
      const dir = s.directoryPath.replace(/\/+$/, '')  // Remove trailing slashes
      entry += `\n  - SKILL.md location: \`${dir}/SKILL.md\``
    } else if (s.path) {
      // Fallback: path already includes SKILL.md
      entry += `\n  - SKILL.md location: \`${s.path}\``
    }
    return entry
  }).join('\n')

  return `

## Available Skills
You have access to the following skills. When a task involves using a skill, read its SKILL.md file first to understand how to use it properly.

${skillsList}

**How to use skills:**
1. Use \`cat <skill-path>/SKILL.md\` to read the skill documentation
2. Follow the instructions in SKILL.md to execute the skill
3. Skills may have scripts or specific commands to run`
}

/**
 * Build complete Tool Agent system prompt with skills
 */
export function buildToolAgentSystemPrompt(skills?: SkillDefinition[]): string {
  let prompt = BASE_TOOL_AGENT_PROMPT

  if (skills && skills.length > 0) {
    prompt += buildSkillsSection(skills)
  }

  return prompt
}

// Legacy export for backwards compatibility
export const TOOL_AGENT_SYSTEM_PROMPT = BASE_TOOL_AGENT_PROMPT

/**
 * Build the user prompt for the Tool Agent
 */
export function buildToolAgentUserPrompt(
  task: string,
  context: string,
  expectedOutcome: string
): string {
  let prompt = `## Task\n${task}\n`

  if (context && context.trim()) {
    prompt += `\n## Context\n${context}\n`
  }

  if (expectedOutcome && expectedOutcome.trim()) {
    prompt += `\n## Expected Outcome\n${expectedOutcome}\n`
  }

  prompt += `\nExecute this task using the available tools. Provide a summary when complete.`

  return prompt
}

/**
 * Format Tool Agent result for injection back into main conversation
 */
export function formatToolAgentResultForMainLLM(
  result: {
    success: boolean
    summary: string
    details?: string
    filesModified?: string[]
    errors?: string[]
    toolCallCount?: number
  }
): string {
  let formatted = `## Tool Agent Execution Result\n\n`

  formatted += `**Status:** ${result.success ? 'Success' : 'Failed'}\n\n`
  formatted += `**Summary:**\n${result.summary}\n`

  if (result.filesModified && result.filesModified.length > 0) {
    formatted += `\n**Files Modified:**\n${result.filesModified.map(f => `- ${f}`).join('\n')}\n`
  }

  if (result.errors && result.errors.length > 0) {
    formatted += `\n**Errors:**\n${result.errors.map(e => `- ${e}`).join('\n')}\n`
  }

  if (result.toolCallCount !== undefined) {
    formatted += `\n**Tool Calls:** ${result.toolCallCount}\n`
  }

  return formatted
}
