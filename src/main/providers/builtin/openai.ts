/**
 * OpenAI Provider Definition
 */

import type { ProviderDefinition } from '../types.js'

const openaiProvider: ProviderDefinition = {
  id: 'openai',

  info: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5 and other OpenAI models',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    icon: 'openai',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}

export default openaiProvider
