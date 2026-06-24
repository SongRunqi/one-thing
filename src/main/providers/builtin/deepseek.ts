/**
 * DeepSeek Provider Definition
 */

import type { ProviderDefinition } from '../types.js'

const deepseekProvider: ProviderDefinition = {
  id: 'deepseek',

  info: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek-V3, DeepSeek-R1, DeepSeek-V4 and other DeepSeek models',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    icon: 'deepseek',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}

export default deepseekProvider
