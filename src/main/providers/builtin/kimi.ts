/**
 * Kimi (Moonshot AI) Provider Definition
 *
 * Uses OpenAI-compatible API with chat/completions endpoint.
 */

import { createOpenAI } from '@ai-sdk/openai'
import type { ProviderDefinition } from '../types.js'

const kimiProvider: ProviderDefinition = {
  id: 'kimi',

  info: {
    id: 'kimi',
    name: 'Kimi',
    description: 'Moonshot AI Kimi models with long context support',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    icon: 'kimi',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createOpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.moonshot.cn/v1',
    })
    return {
      // Use provider.chat() to use chat/completions API instead of responses API
      createModel: (modelId: string) => provider.chat(modelId),
    }
  },
}

export default kimiProvider
