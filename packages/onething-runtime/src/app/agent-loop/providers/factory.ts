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
import { CODEX_PROVIDER_ID } from '../../providers/builtin/codex.js'
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

function hasCodexOAuthCredentials(config: AgentProviderRuntimeConfig): boolean {
  return config.authContext?.kind === 'oauth' || Boolean(config.oauthToken)
}

function createCodexRefreshOAuthToken(
  config: AgentProviderRuntimeConfig,
): CreateAgentProviderFromRuntimeOptions['codexRefreshOAuthToken'] | undefined {
  if (!hasCodexOAuthCredentials(config)) return undefined

  return forceRefresh => forceRefresh
    ? authService.refreshToken(CODEX_PROVIDER_ID) as Promise<OAuthToken | undefined>
    : authService.refreshTokenIfNeeded(CODEX_PROVIDER_ID) as Promise<OAuthToken | undefined>
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
    codexRefreshOAuthToken: options.codexRefreshOAuthToken ?? createCodexRefreshOAuthToken(config),
    requestDumper: options.requestDumper ?? options.codexRequestDumper ?? dumpProviderRequest,
  })
}
