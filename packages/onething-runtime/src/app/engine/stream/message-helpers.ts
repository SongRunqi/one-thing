/**
 * Message Helpers Module
 * Handles message building, history construction, and system prompt generation
 */

import type { ChatMessage } from '@shared/ipc.js'
import type { AgentProviderData } from '@onething/core/agent-loop'
import type { JsonObject, JsonValue } from '@shared/json.js'
import type { AIMessageContent } from '../../providers/index.js'
import { logMessageBodyShape } from './chat-logger.js'
import {
  formatMessagesForLog,
  getTextFromContent,
  historyMessagesForLog,
  renderContextUpdateBlock,
  sanitizeToolResultForAI,
} from '@onething/core/engine'
import {
  buildOnethingHistoryMessages,
  buildOnethingMessageContent,
  filterOnethingHistoryForNonToolAPI,
} from '@onething/runtime/sessions'
import {
  appendCollabReactionSummary,
  formatCollabFlattenedToolCall,
  COLLAB_SYSTEM_SPEAKER_LABEL,
  wrapCollabMessageEnvelope,
  formatCollabReplyQuote,
  isCollabDriveMessage,
  isCollabPassMessage,
  isCollabProjectedSystemLine,
  isCollabThinkingMessage,
  mergeCollabProjectedRows,
  renderCollabMentionText,
  resolveCollabSpeakerLabel,
  type CollabAgentLike,
} from '@onething/runtime/collab'
import { findAgent } from '../../agents/index.js'
import * as store from '../../store.js'

export { formatMessagesForLog, getTextFromContent, sanitizeToolResultForAI }

/**
 * Convert message with attachments to multimodal format
 */
export function buildMessageContent(message: ChatMessage): AIMessageContent {
  return buildOnethingMessageContent(prepareUserMessageForModel(message), {
    onImageAttachment: ({ mimeType, base64Length, dataUrlPrefix }) => {
      console.log('[Chat] Adding image attachment:', {
        mimeType,
        base64Length,
        dataUrlPrefix,
      })
    },
  }) as AIMessageContent
}

/**
 * History message type for AI conversation
 * Supports user, assistant (with optional tool calls), and tool result messages
 */
export type HistoryMessage =
  | { role: 'user'; content: AIMessageContent }
  | {
      role: 'assistant'
      content: AIMessageContent
      reasoningContent?: string
      providerData?: AgentProviderData[]
      toolCalls?: Array<{ toolCallId: string; toolName: string; args: JsonObject }>
    }
  | {
      role: 'tool'
      content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: JsonValue }>
    }

/**
 * Build history messages from session messages
 * Includes reasoningContent for assistant messages (required by DeepSeek Reasoner)
 * Includes tool calls and tool results for multi-turn tool context preservation
 * Filters out streaming messages (empty assistant messages being generated)
 * When session has a summary, uses [summary] + [recent messages] to reduce context window usage
 */
export function buildHistoryMessages(
  messages: ChatMessage[],
  session?: {
    id?: string
    summary?: string
    summaryUpToMessageId?: string
    kind?: string
    agentId?: string
    collab?: { roomSessionId?: string }
  }
): HistoryMessage[] {
  return buildOnethingHistoryMessages(
    collapseSupersededGoalDrives(projectRoomMessagesForModel(messages, session)).map(prepareUserMessageForModel),
    session,
    {
    onImageAttachment: ({ mimeType, base64Length, dataUrlPrefix }) => {
      console.log('[Chat] Adding image attachment:', {
        mimeType,
        base64Length,
        dataUrlPrefix,
      })
    },
    onCompactedHistory: details => {
      logMessageBodyShape('[buildHistoryMessages] compacted history body', historyMessagesForLog(details.resultMessages as HistoryMessage[]), {
        sessionId: details.sessionId,
        summaryUpToMessageId: details.summaryUpToMessageId,
        summaryIndex: details.summaryIndex,
        totalSessionMessages: details.totalSessionMessages,
        recentSessionMessages: details.recentSessionMessages,
        retainedRecentMessages: details.retainedRecentMessages,
        degradedRecentMessages: details.degradedRecentMessages,
        droppedRecentMessages: details.droppedRecentMessages,
        retainedPayloadChars: details.retainedPayloadChars,
        originalRecentPayloadChars: details.originalRecentPayloadChars,
        retainedPayloadBudgetChars: details.retainedPayloadBudgetChars,
        summaryChars: details.summaryChars,
        retainedMessages: details.retainedMessages,
        degradedMessageIds: details.degradedMessageIds,
        droppedMessages: details.droppedMessages,
      })
    },
    onMissingSummaryAnchor: details => {
      console.warn('[buildHistoryMessages] Ignoring summary with missing anchor:', {
        sessionId: details.sessionId,
        summaryUpToMessageId: details.summaryUpToMessageId,
      })
    },
  }) as HistoryMessage[]
}

/**
 * Room projection (docs/design/multi-agent-collab.md D3, five classes):
 * activated agent X keeps its own assistant messages structural; every other
 * voice becomes signed user-side text. Tool calls on other agents' messages
 * are flattened to prose — their structural tool companions must never reach
 * the provider (orphan tool_result → 400). Coordinator drives, pass turns and
 * W14b thinking records
 * are excluded entirely; MARKED collab system lines (task lifecycle,
 * membership) become signed「系统: …」user-side text (W9.1 — without them the
 * reviewer only knows what other agents CLAIM), while unmarked system lines
 * stay display-only; consecutive user-side blocks merge for
 * alternation-strict providers. Ordinary sessions pass through untouched.
 *
 * The RULES are specified and unit-tested in @onething/runtime/collab
 * projection.ts (projectRoomHistory) — this is the ChatMessage-level adapter
 * of the same five classes (structural self-messages, attachment merging).
 * Behavioral changes to the five classes must land in both.
 *
 * ONE thing is adapter-only and has no counterpart in the pure spec: the
 * `kind === 'agent'` branch below, which turns an EXECUTION session into
 * "room projection + this round's drive". The spec's input is a room message
 * list; it has no notion of an execution session, so there is nothing to
 * mirror there — see the branch's own comment for the boundary.
 */
function projectRoomMessagesForModel(
  messages: ChatMessage[],
  session?: { kind?: string; agentId?: string; collab?: { roomSessionId?: string } },
): ChatMessage[] {
  /**
   * W18 §4.6「模型输入不变」: a room turn runs in the agent's own execution
   * session now, and what it must read is still the ROOM — persona + 情况说明 +
   * the room's IM projection. The execution session's own transcript (thinking
   * records, tool traffic, older drives) is an execution LOG and is deliberately
   * not input this round ("agent 连续自我记忆" is a later, separate evolution).
   *
   * ONE exception, and it is the whole reason this round is happening
   * (2026-07-30): the CURRENT drive. The coordinator's drive line — 「(小李 ·
   * 被 @ 激活) / (你的发言通过 say 工具送出…)」 — is a `user` message in this
   * very execution session, so the blanket exclusion above swallowed it: every
   * comment claiming the drive "sits at the end of the context, where
   * instruction-following is strongest" described a message the model had
   * never once seen. With the forced opening `say` call removed (todo2 P0-4)
   * that silence became load-bearing: the drive line is the only place the
   * model is told how the channel works.
   *
   * Only the LAST drive is appended (the one this round is answering); earlier
   * drives are the log they always were. It goes in as a plain user message with
   * NO 「用户」 envelope: the envelope means "someone in the room said this", and
   * the coordinator is not in the room — being outside every `<msg>` tag is
   * exactly what marks it as machinery rather than something a member could
   * forge from inside a room message.
   */
  if (session?.kind === 'agent') {
    const roomSessionId = session.collab?.roomSessionId
    const room = roomSessionId ? store.getSession(roomSessionId) : undefined
    if (room?.kind !== 'room') return []
    const projected = projectRoomMessagesForModel(room.messages, { kind: 'room', agentId: session.agentId })
    const drive = latestCollabDriveMessage(messages)
    if (!drive) return projected
    // Through the merge pass, not `push`: the projection's tail is often a
    // user-side block, and two adjacent user messages are a 400 from any
    // alternation-strict provider. Merging leaves the drive text last either
    // way — appended to that block, or its own row after a self assistant one.
    return mergeProjectedChatRows([...projected, {
      ...drive,
      role: 'user',
      // Deliberately NOT the drive's own id. buildOnethingHistoryMessages
      // matches `session.summaryUpToMessageId` against these ids, and every
      // other row here carries a ROOM id that cannot collide with the execution
      // session's compaction anchor — this one would. A hit would slice the room
      // projection away and ship a summary of the execution LOG in its place;
      // the summary mechanism has nothing to say about this branch (its input is
      // the room), so the tail stays unmatchable.
      id: `${drive.id}#turn-drive`,
      toolCalls: undefined,
      steps: undefined,
      reasoning: undefined,
      contentParts: undefined,
      isStreaming: undefined,
      // `contextUpdate` is deliberately KEPT (unlike relayed room messages,
      // which carry a stale block): on the drive it is this turn's own
      // turn-volatile context, rendered by appendContextUpdateForModel exactly
      // as it is for an ordinary session's current user message.
    }])
  }
  if (session?.kind !== 'room') return messages
  const selfAgentId = session.agentId

  const projected: ChatMessage[] = []
  /**
   * Adjacency is no longer decided here: the walk pushes rows and
   * `mergeCollabProjectedRows` (the pure spec's own function, R4) merges them
   * afterwards. The two projections used to implement that rule twice, inline,
   * and shared its blind spot — neither merged the ASSISTANT side, so an agent
   * that said three things in one turn produced three adjacent assistant rows
   * and a 400 from any alternation-strict provider.
   */
  const pushUserSide = (message: ChatMessage, content: string) => {
    projected.push({
      ...message,
      role: 'user',
      content,
      toolCalls: undefined,
      steps: undefined,
      reasoning: undefined,
      contentParts: undefined,
      contextUpdate: undefined,
      isStreaming: undefined,
    })
  }

  /**
   * A speech block dressed with its IM metadata: quote line on top (§3.5 A),
   * reaction tally on the tail (§3.5 B). Self messages take neither — they are
   * pushed structurally above, so an agent never reads its own past output with
   * words appended that it did not write.
   */
  const withImMetadata = (message: ChatMessage, block: string): string => {
    const withReactions = appendCollabReactionSummary(block, message.reactions)
    const quote = formatCollabReplyQuote(message.replyTo)
    return quote ? `${quote}\n${withReactions}` : withReactions
  }

  /**
   * W14a: `@名字` is repainted from the message's mentions[] against the
   * CURRENT roster, so a renamed member is addressed by the name it goes by
   * now. Only the mentioned ids are looked up — the roster slice IS the
   * mention list. Same rule as the pure spec (projection.ts) and the
   * willingness window; self messages stay structural and untouched.
   */
  const renderMentions = (message: ChatMessage): string => {
    if (!message.mentions?.length) return message.content
    const roster: CollabAgentLike[] = []
    for (const mention of message.mentions) {
      const agent = findAgent(mention.agentId)
      if (agent) roster.push({ id: agent.id, name: agent.name })
    }
    return renderCollabMentionText(message.content, message.mentions, roster)
  }

  // IM-relay style「名字: 内容」(v3, 用户反馈) — the bracketed [名字 · 职务]
  // script style read as a simulation transcript; titles live in the room note.
  // P2-16: the global lookup IS the fallback here (a member that left the room
  // still exists), so what is left after it is a genuinely unknown speaker —
  // and a raw `agent-a1b2…` in prompt text is a riddle, not a name.
  const speakerLabel = (agentId: string | undefined): string =>
    resolveCollabSpeakerLabel(agentId, [], id => findAgent(id)?.name)

  for (const message of messages) {
    if (message.role === 'assistant') {
      if (isCollabPassMessage(message.content)) continue
      // W14b: a thinking record is not speech and leaves the projection for
      // everyone, its own author included. Dropping the WHOLE message keeps
      // tool calls and their results together (they ride on one ChatMessage
      // here), so no orphan tool_result can reach a provider.
      if (isCollabThinkingMessage(message)) continue
      if (message.agentId && message.agentId === selfAgentId) {
        projected.push(message)
        continue
      }
      const flattened = (message.toolCalls ?? []).map(call =>
        formatCollabFlattenedToolCall({ name: call.toolName, arguments: call.arguments, result: call.result }))
      const body = [renderMentions(message), ...flattened].filter(Boolean).join('\n')
      if (!body) continue
      // collab-team-v2 §6.2 信封:说话人搬进 from 属性,正文里不再重复名字。
      // 与纯 spec(projection.ts)必须逐字一致 —— 只改一边 = 测试全绿真机没变。
      pushUserSide(message, wrapCollabMessageEnvelope(speakerLabel(message.agentId), withImMetadata(message, body)))
      continue
    }
    if (message.role === 'user') {
      if (isCollabDriveMessage(message)) continue
      if (!message.content && !message.attachments?.length) continue
      pushUserSide(message, wrapCollabMessageEnvelope('用户', withImMetadata(message, renderMentions(message))))
      continue
    }
    if (isCollabProjectedSystemLine(message)) {
      // Must become user-side text, not a kept system row: downstream history
      // building drops system messages entirely, so a "projected" system line
      // that stayed role='system' would reach nobody (W9.1).
      if (message.content) {
        pushUserSide(message, wrapCollabMessageEnvelope(COLLAB_SYSTEM_SPEAKER_LABEL, message.content))
      }
      continue
    }
    // error/unmarked system are display-only; downstream filtering ignores them.
    projected.push(message)
  }
  return mergeProjectedChatRows(projected)
}

/**
 * The adjacency pass, shared by the room walk and the execution-session branch
 * (which appends one row to an already-merged projection and re-runs it — the
 * merge is idempotent, so the only pair it can change is the new tail).
 */
function mergeProjectedChatRows(rows: ChatMessage[]): ChatMessage[] {
  return mergeCollabProjectedRows(rows, {
    // Display-only rows are dropped downstream, so two blocks separated by one
    // are adjacent as far as the provider is concerned.
    isTransparent: row => row.role === 'system' || row.role === 'error',
    // A self message is pushed structurally, tool calls and all. Merging its
    // text into a neighbour would drop those calls while their tool_result
    // companions stayed — the orphan-result 400 this projection exists to avoid.
    hasStructuralPayload: row => Boolean(
      row.toolCalls?.length || row.steps?.length || row.contentParts?.length,
    ),
  })
}

/**
 * The drive this round is answering: the newest coordinator drive in the
 * execution session's own transcript. Empty-content drives are ignored —
 * nothing to say, nothing to append.
 */
function latestCollabDriveMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'user' || !isCollabDriveMessage(message)) continue
    return message.content ? message : undefined
  }
  return undefined
}

const SUPERSEDED_GOAL_DRIVE_MARKER =
  '(automatic goal continuation — superseded by a later one)'

/**
 * Goal drives are persisted as user messages whose content is largely the
 * same template each time. Replaying them all verbatim makes the model read
 * the transcript as "the user keeps repeating the same message", so the
 * model view keeps only the newest drive in full and shrinks the superseded
 * ones to a one-line marker. Roles are kept (providers require user/assistant
 * alternation) and the renderer view is untouched — it folds these visually
 * via origin.source already.
 */
export function collapseSupersededGoalDrives(messages: ChatMessage[]): ChatMessage[] {
  let latestGoalDriveIndex = -1
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role === 'user' && message.origin?.source === 'goal') {
      latestGoalDriveIndex = index
      break
    }
  }
  if (latestGoalDriveIndex === -1) return messages

  return messages.map((message, index) => {
    if (index >= latestGoalDriveIndex) return message
    if (message.role !== 'user' || message.origin?.source !== 'goal') return message
    return {
      ...message,
      content: SUPERSEDED_GOAL_DRIVE_MARKER,
      // The stale turn-context block adds nothing to a superseded ping.
      contextUpdate: undefined,
    }
  })
}

function prepareUserMessageForModel(message: ChatMessage): ChatMessage {
  return appendContextUpdateForModel(labelUserMessageForModel(message))
}

function labelUserMessageForModel(message: ChatMessage): ChatMessage {
  if (message.role !== 'user') return message
  const actor = message.origin?.actor
  if (!actor) return message

  const speaker = actor.displayName || actor.handle || actor.externalUserId
  if (!speaker) return message
  return {
    ...message,
    content: `${speaker} said:\n${message.content}`,
  }
}

/**
 * Render the persisted turn-volatile context block into the model-facing
 * content. The stored field is replayed verbatim on every history rebuild so
 * the request bytes stay identical (prompt-cache safe, append-only history).
 */
function appendContextUpdateForModel(message: ChatMessage): ChatMessage {
  if (message.role !== 'user' || !message.contextUpdate) return message
  return {
    ...message,
    content: renderContextUpdateBlock(message.content, message.contextUpdate),
  }
}

/**
 * Filter history messages for non-tool-aware APIs
 * Removes tool messages and extracts only user/assistant messages
 * Used for APIs like generateChatResponseWithReasoning that don't support tool messages
 */
export function filterHistoryForNonToolAPI(
  messages: HistoryMessage[]
): Array<{ role: 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string }> {
  return filterOnethingHistoryForNonToolAPI(messages) as Array<{
    role: 'user' | 'assistant'
    content: AIMessageContent
    reasoningContent?: string
  }>
}
