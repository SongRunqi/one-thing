/**
 * Prompt Template Types
 *
 * Type definitions for the Handlebars-based prompt template system.
 */

/**
 * Operating system type for OS-specific prompts
 */
export type OSType = 'macos' | 'windows' | 'linux'

/**
 * Template names that can be rendered
 */
export type TemplateName =
  | 'main/system-prompt'
  | 'main/tool-agent'
  | 'main/custom-agent'
  | 'main/ask-mode'
  | 'main/context-compact'
  | 'skills/awareness'
  | 'skills/direct'
  | 'skills/tool'

/**
 * Plan item status
 */
export type PlanItemStatus = 'pending' | 'in_progress' | 'completed'

/**
 * Plan item for template rendering
 */
export interface TemplatePlanItem {
  content: string
  activeForm: string
  status: PlanItemStatus
}

/**
 * Session plan for template rendering
 */
export interface TemplatePlan {
  items: TemplatePlanItem[]
  completedCount: number
  totalCount: number
}

/**
 * Skill definition for template rendering
 */
export interface TemplateSkill {
  name: string
  description: string
  source: string
  directoryPath?: string
  path?: string
  files?: Array<{ name: string }>
  instructions?: string
}

/**
 * Custom tool parameter for template rendering
 */
export interface TemplateToolParameter {
  name: string
  type: string
  description: string
  required: boolean
}

/**
 * Custom tool for template rendering
 */
export interface TemplateCustomTool {
  id: string
  name: string
  description: string
  parameters: TemplateToolParameter[]
}

/**
 * Variables for system prompt template (main/system-prompt.hbs)
 */
export interface SystemPromptVariables {
  // Feature flags
  hasTools: boolean

  // Agent/workspace persona
  workspaceSystemPrompt?: string

  // Memory
  userProfilePrompt?: string
  agentMemoryPrompt?: string

  // Context
  workingDirectory?: string
  displayPath?: string
  baseDirectory: string
  osType: OSType

  // Builtin mode (ask/build)
  builtinMode?: 'build' | 'ask'

  // Plan context
  sessionPlan?: TemplatePlan

  // Skills (currently unused in system prompt, but kept for flexibility)
  skills?: TemplateSkill[]

  // macOS automation docs path (for AI to reference osascript examples)
  macosAutomationDocsPath?: string

  // Tool usage guide path (for AI to reference detailed tool usage examples)
  toolUsageDocsPath?: string
}

/**
 * Variables for tool agent template (main/tool-agent.hbs)
 */
export interface ToolAgentVariables {
  skills?: TemplateSkill[]
}

/**
 * Variables for custom agent template (main/custom-agent.hbs)
 */
export interface CustomAgentVariables {
  systemPrompt: string
  customTools: TemplateCustomTool[]
  hasCustomTools: boolean
}

/**
 * Variables for skills templates
 */
export interface SkillsVariables {
  skills: TemplateSkill[]
  maxInstructionLength?: number
}

/**
 * Variables for context compact template (main/context-compact.hbs)
 */
export interface ContextCompactVariables {
  messages: string
}

/**
 * Union type of all template variable types
 */
export type TemplateVariables =
  | SystemPromptVariables
  | ToolAgentVariables
  | CustomAgentVariables
  | SkillsVariables
  | ContextCompactVariables
  | Record<string, unknown>
