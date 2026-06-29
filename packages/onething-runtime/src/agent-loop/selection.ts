import {
  resolveAgentLoopStreamRoute as resolveCoreAgentLoopStreamRoute,
  shouldUseAgentLoopStream as shouldUseCoreAgentLoopStream,
  type AgentLoopStreamEnabledBy,
  type AgentLoopStreamRoute,
  type AgentLoopStreamSelectionContext as CoreAgentLoopStreamSelectionContext,
} from '@onething/core/engine'
import {
  getSupportedAgentProviderRuntimeIds,
  isAgentProviderRuntimeSupported,
} from './providers/index.js'

export const ONETHING_AGENT_LOOP_STREAM_ENV = 'ONETHING_AGENT_LOOP_STREAM'

export type { AgentLoopStreamEnabledBy, AgentLoopStreamRoute }

export interface OnethingAgentLoopStreamSelectionSettings {
  chat?: {
    agentLoopStream?: boolean
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface OnethingAgentLoopStreamSelectionContext
  extends Omit<CoreAgentLoopStreamSelectionContext, 'settings'> {
  providerId: string
  settings?: OnethingAgentLoopStreamSelectionSettings
}

export function resolveOnethingAgentLoopStreamRoute(
  ctx: OnethingAgentLoopStreamSelectionContext,
): AgentLoopStreamRoute {
  return resolveCoreAgentLoopStreamRoute({
    ...ctx,
    envFlagName: ctx.envFlagName ?? ONETHING_AGENT_LOOP_STREAM_ENV,
    supportedProviderIds: ctx.supportedProviderIds ?? getSupportedAgentProviderRuntimeIds(),
    isProviderSupported: ctx.isProviderSupported ?? isAgentProviderRuntimeSupported,
  })
}

export function shouldUseOnethingAgentLoopStream(
  ctx: OnethingAgentLoopStreamSelectionContext,
): boolean {
  return shouldUseCoreAgentLoopStream({
    ...ctx,
    envFlagName: ctx.envFlagName ?? ONETHING_AGENT_LOOP_STREAM_ENV,
    supportedProviderIds: ctx.supportedProviderIds ?? getSupportedAgentProviderRuntimeIds(),
    isProviderSupported: ctx.isProviderSupported ?? isAgentProviderRuntimeSupported,
  })
}
