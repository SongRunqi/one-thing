/**
 * ACP Provider Definition
 *
 * Runtime calls are handled by the ACP manager before falling through to the
 * generic AI SDK path. This provider exists so ACP agents appear in the normal
 * provider/model UI.
 */

import type { LanguageModel } from 'ai'
import type { ProviderDefinition } from '../types.js'

export const ACP_PROVIDER_ID = 'acp'

const acp: ProviderDefinition = {
  id: ACP_PROVIDER_ID,
  info: {
    id: ACP_PROVIDER_ID,
    name: 'ACP Agents',
    description: 'Connect to local Agent Client Protocol agents such as Claude Code, Codex CLI, and Pi.',
    defaultBaseUrl: '',
    defaultModel: 'claude-code',
    icon: 'acp',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
  },
  create: () => ({
    createModel: () => {
      throw new Error('ACP agents are streamed through the ACP manager, not the AI SDK model adapter.')
    },
  }) as { createModel: (modelId: string) => LanguageModel },
}

export default acp

