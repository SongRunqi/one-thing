/**
 * Tool Agent Module
 *
 * Provides tool delegation architecture for reducing token consumption.
 * In v2, the main LLM calls the `delegate` builtin tool which internally
 * runs the Tool Agent to execute tasks autonomously.
 */

// Types
export type {
  DelegationRequest,
  ToolAgentResult,
  ToolAgentContext,
  ToolAgentStep,
  ToolAgentSettings,
} from './types.js'

// Prompts
export {
  TOOL_AGENT_SYSTEM_PROMPT,
  buildToolAgentUserPrompt,
  formatToolAgentResultForMainLLM,
} from './prompts.js'

// Agent executor (for delegation mode only)
export {
  executeToolAgent,
  type ToolAgentEvents,
} from './agent.js'
