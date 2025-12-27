/**
 * OpenRouter Provider Definition
 *
 * OpenRouter provides access to multiple AI models through a unified API.
 * Uses @ai-sdk/openai-compatible since OpenRouter is OpenAI-compatible.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { ProviderDefinition } from '../types.js'

const openrouterProvider: ProviderDefinition = {
  id: 'openrouter',

  info: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access multiple AI models through OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
    icon: 'openrouter',
    supportsCustomBaseUrl: false,
    requiresApiKey: true,
    // All models fetched dynamically from OpenRouter API
  },

  create: ({ apiKey }) => {
    const provider = createOpenAICompatible({
      name: 'openrouter',
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    })
    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}

export default openrouterProvider
