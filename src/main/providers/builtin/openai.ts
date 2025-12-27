/**
 * OpenAI Provider Definition
 */

import { createOpenAI } from '@ai-sdk/openai'
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
    // Models fetched dynamically from OpenRouter API
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createOpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.openai.com/v1',
    })
    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}

export default openaiProvider
