/**
 * Prompt Service
 *
 * TypeScript prompt builders and context assembly. No Handlebars templates are used.
 */

export type {
  OSType,
  TemplateSkill,
  PromptSegment,
} from './types.js'

export {
  buildContextCompactPrompt,
} from './compact.js'

export {
  buildPrompt,
  loadAgentsMdInstructions,
} from './context.js'
export type {
  BuildPromptContextOptions,
  BuildPromptOptions,
  BuildPromptResult,
  PromptRequestMessage,
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
