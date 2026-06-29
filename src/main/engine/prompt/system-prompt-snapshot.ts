import type {
  AppSettings,
  OAuthToken,
  ProviderConfig,
  SkillDefinition,
  SystemPromptSnapshot,
  ToolDefinition,
} from '../../../shared/ipc.js'
import type { ProviderAuthContext } from '../../auth/types.js'
import * as store from '../../store.js'
import {
  createAgentProviderFromRuntime,
} from '../../providers/agent-runtime.js'
import { getAgent } from '../../agents/index.js'
import { getSkillsForSession } from '../../skills/session-skills.js'
import { getMCPRouterToolDefinition } from '../../mcp/index.js'
import { buildProjectDirsPromptVars } from '../../project-dirs/index.js'
import {
  isProviderSupported,
} from '../../providers/index.js'
import * as modelRegistry from '../../providers/model-registry.js'
import {
  getEffectiveProviderConfig,
  resolveProviderAuth,
} from '../stream/provider-helpers.js'
import {
  getEnabledToolsAsync,
  initializeAsyncTools,
  setInitContext,
} from '../../tools/index.js'
import { buildContextVariablesPromptText } from '../../variables/index.js'
import { getCodexNativeToolsForConfig } from '../stream/codex-native-tools.js'
import { resolveAgentLoopStreamRoute } from '../stream/agent-loop-selection.js'
import { buildPrompt } from './system-prompt.js'
import {
  agentSupportsTools,
  agentToolDefinitionsFromSourceTools,
  resolveAgentModelCapabilities,
} from '@onething/core/agent-loop'
import {
  buildSystemPromptSnapshotWithAdapters,
} from '@onething/runtime/prompts'

type ProviderConfigWithAuth = ProviderConfig & {
  authContext?: ProviderAuthContext
  oauthToken?: OAuthToken
}

function providerRuntimeApiType(providerConfig: ProviderConfigWithAuth): 'openai' | 'anthropic' | undefined {
  const apiType = 'apiType' in providerConfig ? providerConfig.apiType : undefined
  return apiType === 'openai' || apiType === 'anthropic' ? apiType : undefined
}

async function resolveModelSupportsToolsForSnapshot(options: {
  provider: Awaited<ReturnType<typeof resolveProviderForSnapshot>>
  agentLoopActive: boolean
  workingDirectory?: string
  sessionId: string
}): Promise<boolean> {
  if (!options.provider.providerSupported) return false

  if (options.agentLoopActive) {
    const agentProvider = createAgentProviderFromRuntime(options.provider.providerId, {
      apiKey: options.provider.providerConfig.apiKey,
      baseUrl: typeof options.provider.providerConfig.baseUrl === 'string'
        ? options.provider.providerConfig.baseUrl
        : undefined,
      model: options.provider.model,
      apiType: providerRuntimeApiType(options.provider.providerConfig),
      oauthToken: options.provider.providerConfig.oauthToken,
      authContext: options.provider.providerConfig.authContext,
      modelCapabilitiesByModel: options.provider.providerConfig.modelCapabilitiesByModel,
      models: options.provider.providerConfig.models,
    }, {
      workingDirectory: options.workingDirectory,
      localSessionId: options.sessionId,
    })

    if (agentProvider) {
      const capabilities = await resolveAgentModelCapabilities(agentProvider, options.provider.model)
      return agentSupportsTools(capabilities)
    }
  }

  return modelRegistry.modelSupportsTools(options.provider.model, options.provider.providerId)
    .catch(() => false)
}

async function resolveProviderForSnapshot(settings: AppSettings, sessionId: string): Promise<{
  providerId: string
  model: string
  providerConfig: ProviderConfigWithAuth
  providerSupported: boolean
  credentialsReady: boolean
}> {
  const { providerId, providerConfig, model } = getEffectiveProviderConfig(settings, sessionId)
  const providerSupported = isProviderSupported(providerId)
  const authContext = await resolveProviderAuth(providerId, providerConfig).catch(() => null)
  const providerConfigWithAuth: ProviderConfigWithAuth = {
    ...providerConfig,
    model,
    selectedModels: providerConfig?.selectedModels ?? [model],
    apiKey: authContext?.kind === 'api-key' ? authContext.apiKey : '',
    ...(authContext ? { authContext } : {}),
    oauthToken: authContext?.kind === 'oauth' ? authContext.token : providerConfig?.oauthToken,
  }

  return {
    providerId,
    model,
    providerConfig: providerConfigWithAuth,
    providerSupported,
    credentialsReady: Boolean(authContext),
  }
}

export async function buildSystemPromptSnapshot(sessionId: string): Promise<SystemPromptSnapshot> {
  const snapshot = await buildSystemPromptSnapshotWithAdapters<
    AppSettings,
    ProviderConfigWithAuth,
    ToolDefinition,
    SkillDefinition
  >({
    sessionId,
    getSession: id => store.getSession(id),
    getSettings: () => store.getSettings(),
    resolveProvider: resolveProviderForSnapshot,
    resolveAgentLoopStreamRoute,
    getSkills: getSkillsForSession,
    async initializeTools(context) {
      setInitContext(context)
      await initializeAsyncTools()
    },
    getEnabledTools: toolSettings => getEnabledToolsAsync(toolSettings),
    getMCPRouterTool: getMCPRouterToolDefinition,
    sourceToolsToModelDefinitions: tools => agentToolDefinitionsFromSourceTools(tools),
    resolveModelSupportsTools: resolveModelSupportsToolsForSnapshot,
    getNativeProviderTools: getCodexNativeToolsForConfig,
    buildProjectDirsPromptVars,
    getAgent,
    buildContextVariablesPromptText,
    buildPrompt,
  })

  const codexNative = snapshot.tools.nativeProvider.map(tool => ({
    ...tool,
    source: 'codex-native' as const,
    category: 'codex-native',
    description: tool.name === 'image_generation'
      ? 'Codex native image generation'
      : 'Codex native tool',
  }))

  return {
    ...snapshot,
    tools: {
      ...snapshot.tools,
      codexNative,
    },
  } as SystemPromptSnapshot
}
