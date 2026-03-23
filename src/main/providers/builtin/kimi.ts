/**
 * Kimi (Moonshot AI) Provider Definition
 *
 * Uses the dedicated @ai-sdk/moonshotai provider which correctly handles
 * thinking/reasoning modes, reasoning_content serialization, and
 * reasoning_history for multi-turn tool-call conversations.
 */

import { createMoonshotAI } from '@ai-sdk/moonshotai'
import type { ProviderDefinition } from '../types.js'

const kimiProvider: ProviderDefinition = {
  id: 'kimi',

  info: {
    id: 'kimi',
    name: 'Kimi',
    description: 'Moonshot AI Kimi models with long context support',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-128k',
    icon: 'kimi',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
    // Models fetched dynamically from OpenRouter API (if available)
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createMoonshotAI({
      apiKey,
      baseURL: baseUrl || 'https://api.moonshot.cn/v1',
    })
    return {
      createModel: (modelId: string) => provider.chatModel(modelId),
    }
  },
}

export default kimiProvider
