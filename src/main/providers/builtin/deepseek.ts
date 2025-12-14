/**
 * DeepSeek Provider Definition
 *
 * Uses OpenAI-compatible API with chat/completions endpoint.
 */

import { createOpenAI } from '@ai-sdk/openai'
import type { ProviderDefinition } from '../types.js'

const deepseekProvider: ProviderDefinition = {
  id: 'deepseek',

  info: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek-V3, DeepSeek-R1 and other DeepSeek models',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    icon: 'deepseek',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createOpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.deepseek.com/v1',
    })
    return {
      // Use provider.chat() to use chat/completions API instead of responses API
      createModel: (modelId: string) => provider.chat(modelId),
    }
  },
}

export default deepseekProvider
