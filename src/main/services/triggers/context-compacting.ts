/**
 * Context Compacting Trigger
 *
 * When the conversation exceeds a token threshold, this trigger generates
 * a summary of the conversation history. The summary is stored in the session
 * and used to reduce context window usage while preserving important information.
 *
 * Strategy: Keep all messages in storage, but when building history for AI calls,
 * use [summary] + [recent N messages] instead of full history.
 */

import type { Trigger, TriggerContext } from './index.js'
import { calculateSessionTokens, countMessagesAfter } from '../ai/token-counter.js'
import { generateChatResponse } from '../../providers/index.js'
import { updateSessionSummary, getSession } from '../../stores/sessions.js'

// Configuration
const DEFAULT_TOKEN_THRESHOLD = 50000  // Trigger compacting at 50k tokens
const DEFAULT_MIN_MESSAGES_FOR_SUMMARY = 10  // Need at least 10 messages to summarize
const DEFAULT_MESSAGES_SINCE_SUMMARY_THRESHOLD = 20  // Re-summarize after 20 new messages

// Summary generation prompt
const SUMMARY_PROMPT = `你是一个对话摘要助手。请阅读以下对话历史，生成一个结构化摘要。

## 对话历史
{messages}

## 任务
生成一个摘要，包含：
1. **对话主题**: 主要讨论了什么
2. **关键决定**: 做出的重要决定或结论
3. **上下文信息**: 用户偏好、约定、重要背景
4. **进行中的任务**: 未完成的事项或待办

## 要求
- 用清晰的 Markdown 格式输出
- 控制在 500 字以内
- 保留所有重要的技术细节和上下文
- 使用第三人称描述（"用户提到..."、"助手建议..."）`

/**
 * Format messages for the summary prompt
 */
function formatMessagesForSummary(messages: TriggerContext['messages']): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      const role = m.role === 'user' ? '用户' : '助手'
      // Truncate very long messages
      const content = m.content.length > 500
        ? m.content.slice(0, 500) + '...(内容过长已截断)'
        : m.content
      return `**${role}**: ${content}`
    })
    .join('\n\n')
}

/**
 * Generate a summary of the conversation using AI
 */
async function generateSummary(
  ctx: TriggerContext,
  messagesToSummarize: TriggerContext['messages']
): Promise<string | null> {
  const formattedMessages = formatMessagesForSummary(messagesToSummarize)
  const prompt = SUMMARY_PROMPT.replace('{messages}', formattedMessages)

  try {
    const response = await generateChatResponse(
      ctx.providerId,
      {
        apiKey: ctx.providerConfig.apiKey,
        baseUrl: ctx.providerConfig.baseUrl,
        model: ctx.providerConfig.model,
      },
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 800 }
    )

    return response.trim()
  } catch (error) {
    console.error('[ContextCompacting] Failed to generate summary:', error)
    return null
  }
}

/**
 * Context Compacting Trigger
 */
export const contextCompactingTrigger: Trigger = {
  id: 'context-compacting',
  name: 'Context Window Compacting',
  priority: 10,  // Run after memory extraction (priority 5)

  async shouldTrigger(ctx: TriggerContext): Promise<boolean> {
    const { session, messages } = ctx

    // Skip if too few messages
    if (messages.length < DEFAULT_MIN_MESSAGES_FOR_SUMMARY) {
      return false
    }

    // If we already have a summary, check if enough new messages have accumulated
    if (session.summary && session.summaryUpToMessageId) {
      const newMessagesCount = countMessagesAfter(messages, session.summaryUpToMessageId)
      if (newMessagesCount >= DEFAULT_MESSAGES_SINCE_SUMMARY_THRESHOLD) {
        console.log(`[ContextCompacting] ${newMessagesCount} new messages since last summary, will re-summarize`)
        return true
      }
      return false
    }

    // No existing summary - check token count
    const tokenCount = calculateSessionTokens(messages)
    if (tokenCount >= DEFAULT_TOKEN_THRESHOLD) {
      console.log(`[ContextCompacting] Token count ${tokenCount} exceeds threshold ${DEFAULT_TOKEN_THRESHOLD}`)
      return true
    }

    return false
  },

  async execute(ctx: TriggerContext): Promise<void> {
    const { sessionId, session, messages } = ctx

    console.log('[ContextCompacting] Starting context compacting for session:', sessionId)

    // Determine which messages to include in the summary
    // If we have an existing summary, only summarize messages since then
    let messagesToSummarize = messages
    let existingSummary = ''

    if (session.summary && session.summaryUpToMessageId) {
      const summaryIndex = messages.findIndex(m => m.id === session.summaryUpToMessageId)
      if (summaryIndex !== -1) {
        // Include existing summary context and new messages
        existingSummary = session.summary
        messagesToSummarize = messages.slice(summaryIndex + 1)
      }
    }

    // Generate new summary
    // If we have an existing summary, include it as context
    let summaryMessages = messagesToSummarize
    if (existingSummary) {
      // Prepend the existing summary as context
      summaryMessages = [
        { id: 'summary', role: 'assistant' as const, content: `[之前的对话摘要]\n${existingSummary}`, timestamp: 0 },
        ...messagesToSummarize
      ]
    }

    const summary = await generateSummary(ctx, summaryMessages)

    if (!summary) {
      console.error('[ContextCompacting] Failed to generate summary')
      return
    }

    // Find the last message ID to mark where the summary covers
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) {
      console.error('[ContextCompacting] No messages to summarize')
      return
    }

    // Save the summary to the session
    const success = updateSessionSummary(sessionId, summary, lastMessage.id)

    if (success) {
      console.log('[ContextCompacting] Summary saved successfully')
      console.log('[ContextCompacting] Summary preview:', summary.slice(0, 200) + '...')
    } else {
      console.error('[ContextCompacting] Failed to save summary')
    }
  }
}

// Export configuration for external use
export const COMPACTING_CONFIG = {
  tokenThreshold: DEFAULT_TOKEN_THRESHOLD,
  minMessagesForSummary: DEFAULT_MIN_MESSAGES_FOR_SUMMARY,
  messagesSinceSummaryThreshold: DEFAULT_MESSAGES_SINCE_SUMMARY_THRESHOLD,
}
