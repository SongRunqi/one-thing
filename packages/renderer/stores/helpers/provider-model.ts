import type { AppSettings } from '@/types'

/**
 * Single home for the "is this provider enabled" read: an unset flag means
 * enabled. Every surface must call this instead of hand-writing the
 * `enabled !== false` idiom so the default semantics cannot drift.
 */
export function isProviderConfigEnabled(config?: { enabled?: boolean } | null): boolean {
  return config?.enabled !== false
}

export interface SessionModelLike {
  lastProvider?: string
  lastModel?: string
  /** The user picked lastProvider/lastModel by hand (not the per-turn stamp). */
  modelPinned?: boolean
}

export interface AgentModelBindingLike {
  providerId?: string
  modelId?: string
}

interface ResolveProviderModelOptions {
  settings?: AppSettings | null
  session?: SessionModelLike | null
  /** The session agent's model binding, when it has one. */
  agentModel?: AgentModelBindingLike | null
}

interface ResolvedProviderModel {
  providerId: string
  model: string
}

/**
 * Display-side mirror of the engine's provider resolution
 * (packages/onething-runtime/src/providers/provider-config.ts,
 * getEffectiveProviderConfig). The two MUST stay rule-for-rule identical —
 * this helper decides what the model picker SHOWS, the engine decides what
 * requests SEND, and any divergence means the UI displays one provider
 * while the request goes to another (which is exactly how a "selected
 * deepseek, billed on codex" incident happens).
 *
 * The rule: a model the user PINNED on this session wins; then the session
 * agent's model binding; then session.lastProvider (which is also stamped
 * automatically by every assistant message, hence ranked below the binding);
 * then the global selection. lastModel falls back to the provider's configured
 * default. No inference, no repair of mismatched pairs.
 */
export function resolveProviderModelSelection({
  settings,
  session,
  agentModel,
}: ResolveProviderModelOptions): ResolvedProviderModel {
  const sessionProviderId = session?.lastProvider || ''
  const sessionSelection = (): ResolvedProviderModel | null => {
    if (!sessionProviderId) return null
    const providerConfig = settings?.ai?.providers?.[sessionProviderId]
    if (!providerConfig) return null
    return {
      providerId: sessionProviderId,
      model: session?.lastModel || providerConfig.model || '',
    }
  }

  if (session?.modelPinned) {
    const pinned = sessionSelection()
    if (pinned) return pinned
  }

  const agentProviderId = agentModel?.providerId || ''
  if (agentProviderId) {
    const providerConfig = settings?.ai?.providers?.[agentProviderId]
    if (providerConfig) {
      return {
        providerId: agentProviderId,
        model: agentModel?.modelId || providerConfig.model || '',
      }
    }
  }

  const fromSession = sessionSelection()
  if (fromSession) return fromSession

  const globalProviderId = settings?.ai?.provider || ''
  const globalModel = globalProviderId
    ? settings?.ai?.providers?.[globalProviderId]?.model || ''
    : ''
  return { providerId: globalProviderId, model: globalModel }
}
