/**
 * Built-in Skill: Translate
 */

import type { SkillDefinition, PromptTemplateConfig } from '../../../../shared/ipc.js'

const config: PromptTemplateConfig = {
  template: `Please translate the following text. If the text is in Chinese, translate to English. If it's in English or another language, translate to Chinese.

{{input}}

Provide a natural, fluent translation that preserves the original meaning and tone.`,
  systemPrompt:
    'You are a professional translator skilled in multiple languages. Provide accurate and natural translations.',
  includeContext: false,
}

export const definition: SkillDefinition = {
  id: 'translate',
  name: 'Translate',
  description: 'Translate text between Chinese and English',
  type: 'prompt-template',
  source: 'builtin',
  triggers: ['/translate', '@translate', '/tr'],
  icon: 'globe',
  category: 'Language',
  enabled: true,
  config,
}
