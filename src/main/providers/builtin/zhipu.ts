/**
 * Zhipu (GLM) Provider Definition
 */

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
}

export default zhipuProvider
