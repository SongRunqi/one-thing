/**
 * Kimi (Moonshot AI) Provider Definition
 */

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

}

export default kimiProvider
