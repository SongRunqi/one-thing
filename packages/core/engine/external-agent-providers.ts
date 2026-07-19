/**
 * Provider ids that are external agents driven over a local process rather
 * than an HTTP model API. They need no API key / OAuth credentials (auth
 * lives with the agent CLI itself), and the engine must not run context
 * compaction for them — the agent owns its own context window.
 */
const CORE_EXTERNAL_AGENT_PROVIDER_IDS = new Set(['acp', 'claude-code-agent'])

export function isCoreExternalAgentProvider(providerId: string): boolean {
  return CORE_EXTERNAL_AGENT_PROVIDER_IDS.has(providerId)
}
