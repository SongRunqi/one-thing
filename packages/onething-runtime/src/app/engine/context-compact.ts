import type { AppSettings, ChatMessage, ChatSession } from '@shared/ipc.js'
import type { ProviderConfigWithKey } from './stream/stream-executor.js'
import { generateChatResponse } from '../providers/index.js'
import { runBeforeContextCompactHooks, type BeforeContextCompactContext } from '../plugins/lifecycle.js'
import * as store from '../store.js'
import {
  buildContextCompactCompletedContent,
  buildContextCompactFailedContent,
  buildContextCompactSummaryMessages,
  buildContextUsageSnapshot,
  createCoreId,
  createContextCompactMessage,
  DEFAULT_KEEP_RECENT_TURNS,
  formatMessagesForSummary,
  normalizeContextCompactError,
  selectCompactPlan,
  shouldSkipAutoCompactForProviderUsageMismatch as shouldSkipAutoCompactForProviderUsageMismatchByUsage,
  SUMMARY_MAX_OUTPUT_TOKENS,
  summarizeContextInChunks,
} from '@onething/core/engine'
import { buildHistoryMessages } from './stream/message-helpers.js'
import * as modelRegistry from '../providers/model-registry.js'
export {
  estimateCurrentInputTokens,
  estimateSessionInputTokens,
  estimateTextTokens,
  formatMessagesForSummary,
  getContextCompactReason,
  normalizeContextSummaryOutput,
  selectCompactPlan,
  shouldAutoCompactBeforeSend,
} from '@onething/core/engine'

export function shouldSkipAutoCompactForProviderUsageMismatch(options: {
  providerId: string
  session: Pick<ChatSession, 'contextSize' | 'lastInputTokens'>
  modelContextLength: number
  inputTokens?: number
}): boolean {
  if (options.providerId !== 'codex') return false
  return shouldSkipAutoCompactForProviderUsageMismatchByUsage(options)
}

export interface ContextCompactResult {
  success: boolean
  skipped?: boolean
  summary?: string
  message?: ChatMessage
  compactedThroughMessageId?: string
  retainedContextSize?: number
  error?: string
}

export async function compactSessionContext(options: {
  sessionId: string
  providerId: string
  configWithApiKey: ProviderConfigWithKey
  settings: AppSettings
  keepRecentTurns?: number
  onMessageCreated?: (message: ChatMessage) => Promise<void>
  onMessageUpdated?: (messageId: string, updates: Partial<ChatMessage>) => Promise<void>
}): Promise<ContextCompactResult> {
  const session = store.getSession(options.sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  const plan = selectCompactPlan(session, options.keepRecentTurns)
  if (!plan) {
    return {
      success: true,
      skipped: true,
      error: `Nothing to compact yet. Need more than ${options.keepRecentTurns ?? DEFAULT_KEEP_RECENT_TURNS} recent turns.`,
    }
  }

  const compactMessage = createContextCompactMessage({
    id: createCoreId(),
    timestamp: Date.now(),
    compactedMessageCount: plan.messagesToSummarize.length,
  }) as ChatMessage

  store.insertMessageAfter(options.sessionId, plan.cutoffMessage.id, compactMessage)
  await options.onMessageCreated?.(compactMessage)

  try {
    const configWithApiKeyForHooks: BeforeContextCompactContext['configWithApiKey'] = {
      ...options.configWithApiKey,
    }
    // N7-a:某插件的 beforeContextCompact 返回了替换摘要 → 跳过宿主自压,直接用它。
    // 无人返回(或全体抛错 / 超时,fail-open)→ 回落宿主的 summarizeInChunks。
    const replacement = await runBeforeContextCompactHooks({
      sessionId: options.sessionId,
      providerId: options.providerId,
      configWithApiKey: configWithApiKeyForHooks,
      settings: options.settings,
      keepRecentTurns: options.keepRecentTurns,
      messagesToSummarize: plan.messagesToSummarize,
    })

    let summary: string
    if (replacement) {
      console.log('[ContextCompact] using plugin replacement summary', {
        sessionId: options.sessionId,
        pluginId: replacement.pluginId,
        hookId: replacement.hookId,
        length: replacement.summary.length,
      })
      summary = replacement.summary
    } else {
      const formattedMessages = formatMessagesForSummary(plan.messagesToSummarize)
      summary = await summarizeInChunks({
        providerId: options.providerId,
        configWithApiKey: options.configWithApiKey,
        settings: options.settings,
        messages: formattedMessages,
        previousSummary: plan.previousSummary,
      })
    }

    const finalContent = buildContextCompactCompletedContent(summary, plan.messagesToSummarize.length)

    store.updateSessionSummary(options.sessionId, summary, plan.cutoffMessage.id)
    store.updateMessageContent(options.sessionId, compactMessage.id, finalContent)
    const retainedContextSize = await computeRetainedContextSizeAfterCompact({
      sessionId: options.sessionId,
      providerId: options.providerId,
      configWithApiKey: options.configWithApiKey,
      settings: options.settings,
    })
    store.updateSessionContextSize(options.sessionId, retainedContextSize, 'context-compact-retained-usage')
    await options.onMessageUpdated?.(compactMessage.id, { content: finalContent })

    return {
      success: true,
      summary,
      message: { ...compactMessage, content: finalContent },
      compactedThroughMessageId: plan.cutoffMessage.id,
      retainedContextSize,
    }
  } catch (error) {
    console.error('[ContextCompact] Failed to compact session:', error)
    const errorMessage = normalizeContextCompactError(error)
    const failedContent = buildContextCompactFailedContent(errorMessage, plan.messagesToSummarize.length)
    store.updateMessageContent(options.sessionId, compactMessage.id, failedContent)
    await options.onMessageUpdated?.(compactMessage.id, { content: failedContent })

    return {
      success: false,
      message: { ...compactMessage, content: failedContent },
      error: errorMessage,
    }
  }
}

async function computeRetainedContextSizeAfterCompact(options: {
  sessionId: string
  providerId: string
  configWithApiKey: ProviderConfigWithKey
  settings: AppSettings
}): Promise<number> {
  const session = store.getSession(options.sessionId)
  if (!session) return 0

  let modelContextLength = 128000
  let reservedOutputTokens = options.settings.chat?.maxTokens || 4096
  try {
    modelContextLength = await modelRegistry.getModelContextLength(options.configWithApiKey.model, options.providerId)
    const modelMaxOutputTokens = await modelRegistry.getModelMaxOutputTokens(options.configWithApiKey.model, options.providerId)
    const perModelOverride = options.configWithApiKey.maxOutputByModel?.[options.configWithApiKey.model]
    const halfDefault = modelMaxOutputTokens > 0 ? Math.max(1, Math.floor(modelMaxOutputTokens / 2)) : 0
    const requested = perModelOverride ?? (halfDefault > 0 ? halfDefault : reservedOutputTokens)
    reservedOutputTokens = modelMaxOutputTokens > 0 ? Math.min(requested, modelMaxOutputTokens) : requested
  } catch (error) {
    console.warn('[ContextCompact] Failed to resolve model context budget after compact:', error)
  }

  const historyMessages = buildHistoryMessages(session.messages, session)
  const usage = buildContextUsageSnapshot({
    session,
    historyMessages,
    modelContextLength,
    thresholdPercent: options.settings.chat?.contextCompactThreshold ?? 85,
    reservedOutputTokens,
    providerId: options.providerId,
    model: options.configWithApiKey.model,
  })

  console.log('[ContextCompact] retained usage after compact', {
    sessionId: options.sessionId,
    providerId: options.providerId,
    model: options.configWithApiKey.model,
    visibleInputTokens: usage.visibleInputTokens,
    providerInputTokens: usage.providerInputTokens,
    requestEstimatedInputTokens: usage.requestEstimatedInputTokens,
    modelContextLength: usage.modelContextLength,
    reservedOutputTokens: usage.reservedOutputTokens,
    source: usage.source,
  })

  return usage.visibleInputTokens
}

async function summarizeInChunks(options: {
  providerId: string
  configWithApiKey: ProviderConfigWithKey
  settings: AppSettings
  messages: string
  previousSummary?: string
}): Promise<string> {
  return summarizeContextInChunks({
    messages: options.messages,
    previousSummary: options.previousSummary,
    summarizeChunk: async ({ chunk, previousSummary }) => {
      return generateChatResponse(
        options.providerId,
        options.configWithApiKey,
        buildContextCompactSummaryMessages({ chunk, previousSummary }),
        {
          temperature: 0,
          maxTokens: SUMMARY_MAX_OUTPUT_TOKENS,
        },
      )
    },
  })
}
