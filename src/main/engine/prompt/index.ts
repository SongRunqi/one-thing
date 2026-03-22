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
  SkillsVariables,
  TemplateSkill,
} from './types.js'

// Hot reload watcher (dev only)
export { startTemplateWatcher, stopTemplateWatcher } from './watcher.js'

// Builders (template-based)
export {
  buildSystemPrompt,
  buildSkillsAwarenessPrompt,
  buildSkillsDirectPrompt,
  buildSkillsToolPrompt,
} from './builders.js'
