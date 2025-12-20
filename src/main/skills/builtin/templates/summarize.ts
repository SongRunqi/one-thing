/**
 * Built-in Skill: Summarize
 */

import type { SkillDefinition, PromptTemplateConfig } from '../../../../shared/ipc.js'

const config: PromptTemplateConfig = {
  template: `Please summarize the following content:

{{input}}

Provide a concise summary that captures the main points and key takeaways.`,
  systemPrompt: 'You are a helpful assistant skilled at extracting and summarizing key information.',
  includeContext: false,
}

export const definition: SkillDefinition = {
  id: 'summarize',
  name: 'Summarize',
  description: 'Summarize text content into key points',
  type: 'prompt-template',
  source: 'builtin',
  triggers: ['/summarize', '@summarize', '/sum'],
  icon: 'list',
  category: 'Writing',
  enabled: true,
  config,
}
