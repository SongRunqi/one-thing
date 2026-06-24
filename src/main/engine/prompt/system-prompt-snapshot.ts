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
  agentSupportsTools,
  resolveAgentModelCapabilities,
} from '../../agent-loop/capabilities.js'
import {
  createAgentProviderFromRuntime,
} from '../../agent-loop/providers/factory.js'
import { agentToolDefinitionsFromSourceTools } from '../../agent-loop/tools.js'
import { getAgent } from '../../agents/index.js'
import { getSkillsForSession } from '../../ipc/skills.js'
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

type ProviderConfigWithAuth = ProviderConfig & {
  authContext?: ProviderAuthContext
  oauthToken?: OAuthToken
}
type PromptProviderConfigValue = string | number | boolean | null | undefined | object

function skillForInit(skill: SkillDefinition) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    source: skill.source,
    category: skill.category,
    tags: skill.tags,
    relatedSkills: skill.relatedSkills,
    conditions: skill.conditions,
    disableModelInvocation: skill.disableModelInvocation,
    platforms: skill.platforms,
    path: skill.path,
    directoryPath: skill.directoryPath,
    rootPath: skill.rootPath,
    relativePath: skill.relativePath,
    enabled: skill.enabled,
    instructions: skill.instructions,
    runtimeContext: skill.runtimeContext,
    files: skill.files?.map(file => ({
      name: file.name,
      path: file.path,
      type: file.type as 'markdown' | 'script' | 'template' | 'other',
    })),
  }
}

function toolSnapshot(tool: ToolDefinition) {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    modelFacingName: tool.id,
    source: tool.source ?? (
      tool.id.startsWith('mcp:') ? 'mcp' : tool.category === 'custom' ? 'plugin' : 'builtin'
    ),
    serverId: tool.serverId,
    serverName: tool.serverName,
    enabled: tool.enabled,
    autoExecute: tool.autoExecute,
    permissionGuard: tool.permissionGuard,
    executionMode: tool.executionMode,
    renderKind: tool.renderKind,
    parameters: tool.parameters,
  }
}

function normalizeToolParameterType(type: string | undefined): ToolDefinition['parameters'][number]['type'] {
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'object' || type === 'array') {
    return type
  }
  return 'string'
}

function mcpToolSnapshot(name: string, definition: {
  description?: string
  parameters?: Array<{
    name: string
    type: string
    description: string
    required?: boolean
    enum?: string[]
  }>
}) {
  return {
    id: name,
    name,
    description: definition.description,
    category: 'mcp',
    modelFacingName: name,
    source: 'mcp' as const,
    enabled: true,
    autoExecute: false,
    permissionGuard: 'permission-gated' as const,
    executionMode: 'sequential' as const,
    parameters: definition.parameters?.map(param => ({
      ...param,
      type: normalizeToolParameterType(param.type),
    })),
  }
}

function nativeToolSnapshot(name: string) {
  return {
    id: name,
    name,
    description: name === 'image_generation'
      ? 'Codex native image generation'
      : 'Codex native tool',
    category: 'codex-native',
    modelFacingName: name,
    source: 'codex-native' as const,
    enabled: true,
    autoExecute: false,
  }
}

function providerRuntimeApiType(providerConfig: ProviderConfigWithAuth): 'openai' | 'anthropic' | undefined {
  const apiType = 'apiType' in providerConfig ? providerConfig.apiType : undefined
  return apiType === 'openai' || apiType === 'anthropic' ? apiType : undefined
}

function providerConfigForPrompt(providerConfig: ProviderConfigWithAuth): Record<string, PromptProviderConfigValue> {
  return { ...providerConfig }
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

function skillSnapshot(skill: SkillDefinition) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    source: skill.source,
    category: skill.category,
    tags: skill.tags,
    enabled: skill.enabled,
    allowedTools: skill.allowedTools,
    relatedSkills: skill.relatedSkills,
    platforms: skill.platforms,
    conditions: skill.conditions,
    path: skill.path,
    directoryPath: skill.directoryPath,
    rootPath: skill.rootPath,
    relativePath: skill.relativePath,
    files: skill.files?.map(file => ({
      name: file.name,
      path: file.path,
      type: file.type,
    })),
  }
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
  const session = store.getSession(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  const settings = store.getSettings()
  const provider = await resolveProviderForSnapshot(settings, sessionId)
  const agentLoopStream = resolveAgentLoopStreamRoute({
    providerId: provider.providerId,
    settings,
  })
  const skillsEnabled = settings.skills?.enableSkills !== false
  const enabledSkills = skillsEnabled ? getSkillsForSession(session.workingDirectory) : []

  const enableToolCalls = settings.tools?.enableToolCalls !== false

  if (enableToolCalls) {
    setInitContext({
      skills: enabledSkills.map(skillForInit),
      workingDirectory: session.workingDirectory,
      workingDirectoryRoots: session.workingDirectoryRoots,
      providerId: provider.providerId,
      providerConfig: {
        apiKey: String(provider.providerConfig.apiKey || ''),
        baseUrl: typeof provider.providerConfig.baseUrl === 'string'
          ? provider.providerConfig.baseUrl
          : undefined,
        model: provider.model,
      },
    })
    await initializeAsyncTools()
  }

  const allEnabledTools = enableToolCalls ? await getEnabledToolsAsync(settings.tools?.tools) : []
  const builtinTools = allEnabledTools.filter(tool => !tool.id.startsWith('mcp:'))
  const mcpRouterTool = enableToolCalls ? getMCPRouterToolDefinition() : null
  const mcpTools = mcpRouterTool && settings.tools?.tools?.[mcpRouterTool.id]?.enabled !== false
    ? agentToolDefinitionsFromSourceTools([mcpRouterTool])
    : {}
  const modelSupportsTools = await resolveModelSupportsToolsForSnapshot({
    provider,
    agentLoopActive: agentLoopStream.active,
    workingDirectory: session.workingDirectory,
    sessionId,
  })
  const codexNativeTools = await getCodexNativeToolsForConfig({
    providerId: provider.providerId,
    providerConfig: provider.providerConfig,
    toolSettings: settings.tools,
    supportsTools: modelSupportsTools,
  })
  const hasTools = modelSupportsTools && (
    builtinTools.length > 0 ||
    Object.keys(mcpTools).length > 0 ||
    codexNativeTools.length > 0
  )
  const builtinToolDefinitions = hasTools ? agentToolDefinitionsFromSourceTools(builtinTools) : {}
  const projectVars = buildProjectDirsPromptVars(session.workingDirectory)
  const agent = getAgent(session.agentId)
  const requestMessages = await buildPrompt({
    sessionId,
    agentId: session.agentId,
    providerId: provider.providerId,
    providerConfig: providerConfigForPrompt(provider.providerConfig),
    settings,
    hasTools,
    skills: enabledSkills,
    workingDirectory: session.workingDirectory,
    workingDirectoryRoots: session.workingDirectoryRoots,
    contextVariables: await buildContextVariablesPromptText(sessionId),
    activeProject: projectVars.active,
    knownProjects: projectVars.known,
    toolNames: [...Object.keys(builtinToolDefinitions), ...codexNativeTools],
    mcpToolNames: Object.keys(mcpTools),
    historyMessages: [],
  })

  return {
    sessionId,
    generatedAt: Date.now(),
    providerId: provider.providerId,
    model: provider.model,
    providerSupported: provider.providerSupported,
    credentialsReady: provider.credentialsReady,
    workingDirectory: session.workingDirectory,
    agentId: agent.id,
    agentName: agent.name,
    systemPrompt: requestMessages.systemPrompt,
    systemPromptChars: requestMessages.systemPrompt.length,
    tools: {
      enableToolCalls,
      modelSupportsTools,
      hasTools,
      configuredCount: allEnabledTools.length + Object.keys(mcpTools).length + codexNativeTools.length,
      modelFacingCount: Object.keys(builtinToolDefinitions).length + Object.keys(mcpTools).length + codexNativeTools.length,
      builtin: builtinTools.map(toolSnapshot),
      mcp: Object.entries(mcpTools).map(([name, definition]) => mcpToolSnapshot(name, definition)),
      codexNative: codexNativeTools.map(nativeToolSnapshot),
    },
    agentLoopStream,
    skills: {
      enabled: skillsEnabled,
      includedInPrompt: requestMessages.systemPrompt.includes('# Skills'),
      count: enabledSkills.length,
      items: enabledSkills.map(skillSnapshot),
    },
  }
}
