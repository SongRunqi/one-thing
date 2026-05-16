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
  PromptSegment,
} from './types.js'

// Hot reload watcher (dev only)
export { startTemplateWatcher, stopTemplateWatcher } from './watcher.js'

// Builders (template-based)
export {
  buildSystemPrompt,
  buildSkillsAwarenessPrompt,
  buildSkillsDirectPrompt,
  buildSkillsToolPrompt,
  buildContextCompactPrompt,
} from './builders.js'

export {
  buildPromptContext,
  buildRequestMessages,
  loadAgentsMdInstructions,
} from './context.js'
export type {
  BuildPromptContextOptions,
  PromptContextBuildResult,
  PromptRequestMessage,
  BuildRequestMessagesResult,
} from './context.js'

export {
  registerPromptContextProvider,
  collectPluginPromptContext,
} from './plugin-context.js'
export type {
  PluginPromptContext,
  PluginPromptContextFragmentInput,
  PluginPromptContextProvider,
} from './plugin-context.js'
