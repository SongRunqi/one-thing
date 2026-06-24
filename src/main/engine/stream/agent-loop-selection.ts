import type { AppSettings } from '../../../shared/ipc.js'
import {
  getSupportedAgentProviderRuntimeIds,
  isAgentProviderRuntimeSupported,
} from '../../agent-loop/providers/factory.js'

export const AGENT_LOOP_STREAM_ENV = 'ONETHING_AGENT_LOOP_STREAM'

export type AgentLoopStreamEnabledBy = 'env' | 'settings' | 'default'

export interface AgentLoopStreamSelectionContext {
  providerId: string
  settings?: {
    chat?: Partial<AppSettings['chat']>
  }
}

export interface AgentLoopStreamRoute {
  enabled: boolean
  enabledBy: AgentLoopStreamEnabledBy
  providerSupported: boolean
  active: boolean
  supportedProviderIds: string[]
}

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

export function resolveAgentLoopStreamRoute(ctx: AgentLoopStreamSelectionContext): AgentLoopStreamRoute {
  const envEnabled = isEnabled(process.env[AGENT_LOOP_STREAM_ENV])
  const configured = ctx.settings?.chat?.agentLoopStream
  const settingsEnabled = configured === true
  const enabledBy: AgentLoopStreamEnabledBy = envEnabled
    ? 'env'
    : settingsEnabled
      ? 'settings'
      : 'default'
  const providerSupported = isAgentProviderRuntimeSupported(ctx.providerId)

  return {
    enabled: true,
    enabledBy,
    providerSupported,
    active: providerSupported,
    supportedProviderIds: getSupportedAgentProviderRuntimeIds(),
  }
}

export function shouldUseAgentLoopStream(ctx: AgentLoopStreamSelectionContext): boolean {
  return resolveAgentLoopStreamRoute(ctx).active
}
