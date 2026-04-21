/**
 * DeepSeek Provider Definition
 *
 * Uses the official @ai-sdk/deepseek package for proper reasoning/thinking support.
 */

import { createDeepSeek } from '@ai-sdk/deepseek'
import type { ProviderDefinition } from '../types.js'
import { createBoundFetch } from '../bound-fetch.js'

const deepseekProvider: ProviderDefinition = {
  id: 'deepseek',

  info: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek-V3, DeepSeek-R1 and other DeepSeek models',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    icon: 'deepseek',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
    // Models fetched dynamically from OpenRouter API
  },

  create: ({ apiKey, baseUrl, localAddress }) => {
    const provider = createDeepSeek({
      apiKey,
      baseURL: baseUrl || 'https://api.deepseek.com',
      fetch: createBoundFetch(localAddress),
    })
    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}

export default deepseekProvider
