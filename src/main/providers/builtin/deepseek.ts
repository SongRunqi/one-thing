/**
 * DeepSeek Provider Definition
 *
 * Uses the official @ai-sdk/deepseek package for proper reasoning/thinking support.
 */

import { createDeepSeek } from '@ai-sdk/deepseek'
import type { ProviderDefinition } from '../types.js'

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
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createDeepSeek({
      apiKey,
      baseURL: baseUrl || 'https://api.deepseek.com',
    })
    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}

export default deepseekProvider
