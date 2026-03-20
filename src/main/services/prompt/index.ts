/**
 * Prompt Service
 *
 * Exports for the Handlebars-based prompt template system.
 */

// Core manager
export {
  getPromptManager,
  initializePromptManager,
  PromptManager,
} from './prompt-manager.js'

// Types
export type {
  OSType,
  TemplateName,
  TemplateVariables,
  SystemPromptVariables,
  ToolAgentVariables,
  CustomAgentVariables,
  SkillsVariables,
  TemplatePlan,
  TemplatePlanItem,
  TemplateSkill,
  TemplateCustomTool,
  TemplateToolParameter,
  PlanItemStatus,
} from './types.js'

// Hot reload watcher (dev only)
export { startTemplateWatcher, stopTemplateWatcher } from './watcher.js'

// V2 Builders (template-based)
export {
  buildSystemPromptV2,
  buildToolAgentSystemPromptV2,
  buildCustomAgentSystemPromptV2,
  buildSkillsAwarenessPromptV2,
  buildSkillsDirectPromptV2,
  buildSkillsToolPromptV2,
} from './builders.js'
