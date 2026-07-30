import {
  buildOnethingAgentLoopStreamRuntime,
  createOnethingAgentLoopRuntimeAdapters,
  maybeCompactOnethingAgentLoopContext,
  streamOnethingAgentLoopChunks,
  type BuildOnethingAgentLoopStreamRuntimeResult,
  type OnethingAgentLoopContextBudget,
} from '@onething/runtime/agent-loop'
import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentMessage,
  AgentProviderStreamChunk,
} from '@onething/core/agent-loop'
import {
  buildAgentLoopContextHardLimitError,
  getAgentLoopContextBlockReason,
  getAgentLoopTransientTail,
} from '@onething/core/engine'
import { resolveAgentProfile } from '@onething/runtime/agents'
import * as store from '../../store.js'
import { goalRuntimeHooks } from '../../goals/runtime-hooks.js'
import { defaultAgent, findAgent } from '../../agents/index.js'
import { getSkillsForSession } from '../../skills/session-skills.js'
import { getMCPRouterToolDefinition } from '../../mcp/index.js'
import * as modelRegistry from '../../providers/model-registry.js'
import { createAgentProviderFromRuntime } from '../../providers/agent-runtime.js'
import {
  getEnabledToolsAsync,
  initializeAsyncTools,
  setInitContext,
} from '../../tools/index.js'
import type { ChatMessage, ChatSession, SkillDefinition } from '@shared/ipc.js'
import { toJsonObject } from '@shared/json.js'
import { buildHistoryMessages, type HistoryMessage } from './message-helpers.js'
import type { StreamContext } from './stream-processor.js'
import { buildPrompt } from '../prompt/index.js'
import { buildContextVariablesPromptText } from '../../variables/index.js'
import { buildProjectDirsPromptVars } from '../../project-dirs/index.js'
import { executeToolDirectly } from './tool-execution.js'
import { compactSessionContext } from '../context-compact.js'
import * as contextCompact from '../context-compact.js'
import { getEventBus } from '../../events/index.js'
import { resolvePromptReferences } from '../../prompts/resolver.js'
import type { IPCEmitter } from './ipc-emitter.js'

export {
  buildAgentLoopContextHardLimitError,
  getAgentLoopContextBlockReason,
  getAgentLoopTransientTail,
}

export type BuildAgentLoopStreamRuntimeResult =
  BuildOnethingAgentLoopStreamRuntimeResult<SkillDefinition> & {
    runtime?: AgentLoopOptions
  }

export interface BuildAgentLoopStreamRuntimeOptions {
  emitter?: IPCEmitter
}

export type AgentLoopContextBudget = OnethingAgentLoopContextBudget

function shouldSkipAutoCompactForProviderUsageMismatchSafe(input: {
  providerId: string
  session: ChatSession
  modelContextLength: number
  inputTokens?: number
}): boolean {
  try {
    const fn = (contextCompact as {
      shouldSkipAutoCompactForProviderUsageMismatch?: (input: {
        providerId: string
        session: ChatSession
        modelContextLength: number
        inputTokens?: number
      }) => boolean
    }).shouldSkipAutoCompactForProviderUsageMismatch
    return typeof fn === 'function' ? fn(input) : false
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('shouldSkipAutoCompactForProviderUsageMismatch')) return false
    throw error
  }
}

export async function maybeCompactAgentLoopContext(options: {
  ctx: StreamContext
  turn: number
  messages: AgentMessage[]
  budget: AgentLoopContextBudget
  rebuildMessages: () => Promise<AgentMessage[]>
}): Promise<AgentMessage[] | undefined> {
  return maybeCompactOnethingAgentLoopContext({
    ctx: {
      sessionId: options.ctx.sessionId,
      providerId: options.ctx.providerId,
      providerConfig: options.ctx.providerConfig,
      settings: options.ctx.settings,
    },
    turn: options.turn,
    messages: options.messages,
    budget: options.budget,
    compactEnabled: options.ctx.settings.chat?.contextCompactEnabled !== false,
    keepRecentTurns: options.ctx.settings.chat?.contextCompactKeepRecentTurns ?? 6,
    rebuildMessages: options.rebuildMessages,
    adapters: {
      getSession: sessionId => store.getSession(sessionId),
      compactSessionContext: input => compactSessionContext(input as Parameters<typeof compactSessionContext>[0]),
      emitEvent,
      shouldSkipProviderUsageMismatch: input => shouldSkipAutoCompactForProviderUsageMismatchSafe(input),
      logger: console,
    },
  })
}

export async function buildAgentLoopRuntimeFromStreamContext(
  ctx: StreamContext,
  historyMessages: HistoryMessage[],
  options: BuildAgentLoopStreamRuntimeOptions = {},
): Promise<BuildAgentLoopStreamRuntimeResult> {
  const result = await buildOnethingAgentLoopStreamRuntime(
    ctx,
    historyMessages,
    createAgentLoopRuntimeAdapters(options),
  )
  return result as BuildAgentLoopStreamRuntimeResult
}

export async function* streamAgentLoopChunksFromStreamContext(
  ctx: StreamContext,
  historyMessages: HistoryMessage[],
): AsyncGenerator<AgentProviderStreamChunk, AgentLoopResult, void> {
  const result = yield* streamOnethingAgentLoopChunks(ctx, historyMessages, createAgentLoopRuntimeAdapters())
  return result
}

function createAgentLoopRuntimeAdapters(
  options: BuildAgentLoopStreamRuntimeOptions = {},
) {
  return createOnethingAgentLoopRuntimeAdapters({
    getSession: (sessionId: string) => store.getSession(sessionId),
    getSkillsForSession,
    async initializeTools(skills) {
      setInitContext({
        skills,
      })
      await initializeAsyncTools()
    },
    createProvider: createAgentProviderFromRuntime,
    resolveModelContextLength: modelRegistry.getModelContextLength,
    resolveModelMaxOutputTokens: modelRegistry.getModelMaxOutputTokens,
    getEnabledTools: getEnabledToolsAsync,
    getMCPRouterToolDefinition,
    getAgentToolAllowlist: (agentId: string | undefined, session?: unknown) => {
      // Fallback only: a run with a resolved profile reads the snapshot
      // instead (see stream-runtime.ts). Same pure rule either way — the
      // collab room/work special-casing that used to live here is now a
      // capability grant inside resolveAgentProfile.
      return resolveAgentProfile({
        // persona/能力功能兜底(域模型 §3.3),与 profile.ts 同一条规则。
        agent: findAgent(agentId) ?? defaultAgent(),
        session: { kind: (session as { kind?: string } | undefined)?.kind },
      }).tools
    },
    buildContextVariablesPromptText,
    buildProjectPromptVars: buildProjectDirsPromptVars,
    buildPrompt: (promptOptions: Parameters<typeof buildPrompt>[0]) => buildPrompt({
      ...promptOptions,
      providerConfig: toJsonObject(promptOptions.providerConfig),
    } as Parameters<typeof buildPrompt>[0]),
    buildHistoryMessages: (messages: ChatMessage[], session: ChatSession) =>
      buildHistoryMessages(messages, session),
    resolvePromptReferences(content, input) {
      const resolvedPromptRefs = resolvePromptReferences(content, { skills: input.skills })
      return {
        modelContent: resolvedPromptRefs.modelContent,
        contentParts: resolvedPromptRefs.contentParts,
      }
    },
    persistInjectedChatMessage(sessionId: string, injectedMessage: unknown) {
      store.addMessage(sessionId, injectedMessage as ChatMessage)
    },
    executeToolDirectly: (
      toolName: string,
      args: Parameters<typeof executeToolDirectly>[1],
      toolContext: Parameters<typeof executeToolDirectly>[2],
    ) =>
      executeToolDirectly(toolName, args, toolContext as Parameters<typeof executeToolDirectly>[2]),
    compactSessionContext: (input: Parameters<typeof compactSessionContext>[0]) =>
      compactSessionContext(input as Parameters<typeof compactSessionContext>[0]),
    emitEvent,
    shouldSkipProviderUsageMismatch: (input: {
      providerId: string
      session: ChatSession
      modelContextLength: number
      inputTokens?: number
    }) => shouldSkipAutoCompactForProviderUsageMismatchSafe(input),
    sendActiveMemoryPart: (part: { type: 'loading-memory' } | { type: 'waiting' }) =>
      options.emitter?.sendContentPart(part),
    goal: goalRuntimeHooks,
    logger: console,
    createId: undefined,
  })
}

async function emitEvent(sessionId: string, event: unknown): Promise<void> {
  await getEventBus().emit(sessionId, event as Parameters<ReturnType<typeof getEventBus>['emit']>[1])
}
