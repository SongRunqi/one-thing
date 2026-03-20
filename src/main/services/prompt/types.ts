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
  | 'main/context-compact'
  | 'skills/awareness'
  | 'skills/direct'
  | 'skills/tool'

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
 * Variables for system prompt template (main/system-prompt.hbs)
 */
export interface SystemPromptVariables {
  // Feature flags
  hasTools: boolean

  // Workspace persona
  workspaceSystemPrompt?: string

  // User context
  userProfilePrompt?: string

  // Context
  workingDirectory?: string
  displayPath?: string
  baseDirectory: string
  osType: OSType

  // Skills (currently unused in system prompt, but kept for flexibility)
  skills?: TemplateSkill[]

  // macOS automation docs path (for AI to reference osascript examples)
  macosAutomationDocsPath?: string

  // Tool usage guide path (for AI to reference detailed tool usage examples)
  toolUsageDocsPath?: string
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
  | SkillsVariables
  | ContextCompactVariables
  | Record<string, unknown>
