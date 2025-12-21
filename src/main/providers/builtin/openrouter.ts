/**
 * OpenRouter Provider Definition
 *
 * OpenRouter provides access to multiple AI models through a unified API.
 * Uses the official @openrouter/ai-sdk-provider package.
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider'
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
  },

  create: ({ apiKey }) => {
    const provider = createOpenRouter({ apiKey })
    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}

export default openrouterProvider
