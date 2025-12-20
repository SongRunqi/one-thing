/**
 * Skill System Internal Types
 *
 * Defines the core types for the skill system, including:
 * - Skill definition and registration
 * - Skill execution context and results
 * - Skill handlers
 */

import type {
  SkillDefinition,
  SkillExecutionContext,
  SkillExecutionResult,
  PromptTemplateConfig,
  WorkflowConfig,
} from '../../shared/ipc.js'

// Re-export shared types
export type {
  SkillDefinition,
  SkillExecutionContext,
  SkillExecutionResult,
  PromptTemplateConfig,
  WorkflowConfig,
}

/**
 * Skill handler function type
 */
export type SkillHandler = (
  config: PromptTemplateConfig | WorkflowConfig,
  context: SkillExecutionContext
) => Promise<SkillExecutionResult>

/**
 * Internal skill registration with handler
 */
export interface RegisteredSkill {
  definition: SkillDefinition
  handler: SkillHandler
}

/**
 * Default prompt template handler - expands template with context
 */
export async function executePromptTemplate(
  config: PromptTemplateConfig,
  context: SkillExecutionContext
): Promise<SkillExecutionResult> {
  try {
    let output = config.template

    // Replace placeholders
    output = output.replace(/\{\{input\}\}/g, context.input || '')
    output = output.replace(/\{\{selection\}\}/g, context.selection || '')

    // Handle parameters if any
    if (context.parameters) {
      for (const [key, value] of Object.entries(context.parameters)) {
        output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
      }
    }

    return {
      success: true,
      output,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to expand template',
    }
  }
}
