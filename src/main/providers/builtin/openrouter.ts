/**
 * OpenRouter Provider Definition
 *
 * OpenRouter provides access to multiple AI models through a unified API.
 */

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

}

export default openrouterProvider
