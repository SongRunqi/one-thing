/**
 * Zhipu (GLM) Provider Definition
 *
 * Uses OpenAI-compatible API with chat/completions endpoint.
 */

import { createOpenAI } from '@ai-sdk/openai'
import type { ProviderDefinition } from '../types.js'

const zhipuProvider: ProviderDefinition = {
  id: 'zhipu',

  info: {
    id: 'zhipu',
    name: '智谱 GLM',
    description: 'GLM-4, GLM-3 and other Zhipu AI models',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    icon: 'zhipu',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createOpenAI({
      apiKey,
      baseURL: baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
    })
    return {
      // Use provider.chat() to use chat/completions API instead of responses API
      createModel: (modelId: string) => provider.chat(modelId),
    }
  },
}

export default zhipuProvider
