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
}

interface ResolveProviderModelOptions {
  settings?: AppSettings | null
  session?: SessionModelLike | null
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
 * The rule: session.lastProvider (when its config exists) wins, lastModel
 * falls back to that provider's configured default; everything else is the
 * global selection. No inference, no repair of mismatched pairs.
 */
export function resolveProviderModelSelection({
  settings,
  session,
}: ResolveProviderModelOptions): ResolvedProviderModel {
  const sessionProviderId = session?.lastProvider || ''
  if (sessionProviderId) {
    const providerConfig = settings?.ai?.providers?.[sessionProviderId]
    if (providerConfig) {
      return {
        providerId: sessionProviderId,
        model: session?.lastModel || providerConfig.model || '',
      }
    }
  }

  const globalProviderId = settings?.ai?.provider || ''
  const globalModel = globalProviderId
    ? settings?.ai?.providers?.[globalProviderId]?.model || ''
    : ''
  return { providerId: globalProviderId, model: globalModel }
}
