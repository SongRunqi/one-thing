import {
  createAgentProviderFromRuntime as createCoreAgentProviderFromRuntime,
  getSupportedAgentProviderRuntimeIds,
  isAgentProviderRuntimeSupported,
  registerAgentProviderRuntime as registerCoreAgentProviderRuntime,
  type AgentProviderRuntimeConfig as CoreAgentProviderRuntimeConfig,
  type CreateAgentProviderFromRuntimeOptions,
  type RegisterAgentProviderRuntimeOptions,
} from '@onething/runtime/agent-loop/providers'
import type { OAuthToken } from '@shared/ipc.js'
import { ACPManager } from '../../acp/index.js'
import {
  getExternalAgentConnectors,
  persistExternalAgentSessionLink,
  resolveExternalAgentSessionLink,
} from '../../external-agents/index.js'
import { authService } from '../../auth/auth-service.js'
import type { ProviderAuthContext } from '../../auth/types.js'
import { createRequiredAppFetch } from '../../providers/bound-fetch.js'
import { dumpProviderRequest } from '../../providers/request-dump.js'
import type { AgentProvider } from '@onething/core/agent-loop'

export {
  getSupportedAgentProviderRuntimeIds,
  isAgentProviderRuntimeSupported,
}
export type {
  CreateAgentProviderFromRuntimeOptions,
  RegisterAgentProviderRuntimeOptions,
}

export interface AgentProviderRuntimeConfig extends Omit<CoreAgentProviderRuntimeConfig, 'oauthToken' | 'authContext'> {
  oauthToken?: OAuthToken
  authContext?: ProviderAuthContext
}

export type AgentProviderRuntimeFactory = (
  config: AgentProviderRuntimeConfig,
  options: CreateAgentProviderFromRuntimeOptions,
) => AgentProvider | undefined

export function registerAgentProviderRuntime(
  providerId: string,
  factory: AgentProviderRuntimeFactory,
  options: RegisterAgentProviderRuntimeOptions = {},
): () => void {
  return registerCoreAgentProviderRuntime(
    providerId,
    (config, runtimeOptions) => factory(config as AgentProviderRuntimeConfig, runtimeOptions),
    options,
  )
}

function hasOAuthCredentials(config: AgentProviderRuntimeConfig): boolean {
  return config.authContext?.kind === 'oauth' || Boolean(config.oauthToken)
}

/**
 * authService is already keyed by provider id, so nothing here is codex-specific
 * — it used to be only because the option was. Providers that never ask for a
 * refresh simply never call it.
 */
function createRefreshOAuthToken(
  config: AgentProviderRuntimeConfig,
): CreateAgentProviderFromRuntimeOptions['refreshOAuthToken'] | undefined {
  if (!hasOAuthCredentials(config)) return undefined

  return (providerId, forceRefresh) => forceRefresh
    ? authService.refreshToken(providerId) as Promise<OAuthToken | undefined>
    : authService.refreshTokenIfNeeded(providerId) as Promise<OAuthToken | undefined>
}

export function createAgentProviderFromRuntime(
  providerId: string,
  config: AgentProviderRuntimeConfig,
  options: CreateAgentProviderFromRuntimeOptions = {},
): AgentProvider | undefined {
  return createCoreAgentProviderFromRuntime(providerId, config as CoreAgentProviderRuntimeConfig, {
    ...options,
    fetchImpl: options.fetchImpl ?? createRequiredAppFetch({ policy: 'streaming' }),
    acpStreamPrompt: options.acpStreamPrompt ?? ((model, promptOptions) => ACPManager.streamPrompt(model, promptOptions)),
    acpCwd: options.acpCwd ?? (() => process.cwd()),
    externalAgentConnectors: options.externalAgentConnectors ?? getExternalAgentConnectors(),
    resolveExternalAgentSessionLink:
      options.resolveExternalAgentSessionLink ?? resolveExternalAgentSessionLink,
    onExternalAgentSessionLink:
      options.onExternalAgentSessionLink ?? persistExternalAgentSessionLink,
    refreshOAuthToken: options.refreshOAuthToken ?? createRefreshOAuthToken(config),
    requestDumper: options.requestDumper ?? dumpProviderRequest,
  })
}
