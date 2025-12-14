/**
 * Claude (Anthropic) Provider Definition
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import type { ProviderDefinition } from '../types.js'

const claudeProvider: ProviderDefinition = {
  id: 'claude',

  info: {
    id: 'claude',
    name: 'Claude',
    description: 'Claude 3.5, Claude 3 and other Anthropic models',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    icon: 'claude',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createAnthropic({
      apiKey,
      baseURL: baseUrl || 'https://api.anthropic.com/v1',
    })
    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}

export default claudeProvider
