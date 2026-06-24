/**
 * ACP Provider Definition
 *
 * Runtime calls are handled by the ACP manager. This provider exists so ACP
 * agents appear in the normal provider/model UI.
 */

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
}

export default acp
