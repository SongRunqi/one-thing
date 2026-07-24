import { Permission } from '../permission/index.js'
import { getSession } from '../store.js'
import { ACPManager } from './index.js'
import type { ACPPermissionBridge, ACPPermissionRequestContext } from '@onething/runtime/acp'
import type { ChatMessage } from '@shared/ipc.js'
import type { JsonObject } from '@shared/json.js'

/**
 * The prompt context does not carry the assistant message id today; the
 * session's newest assistant message is the one the ACP stream writes into.
 */
function resolveActiveAssistantMessageId(sessionId: string): string | undefined {
  const messages = getSession(sessionId)?.messages as ChatMessage[] | undefined
  if (!messages) return undefined
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'assistant') return messages[index].id
  }
  return undefined
}

function toSafeJson(value: unknown): JsonObject | string | undefined {
  if (value === undefined || value === null) return undefined
  try {
    return JSON.parse(JSON.stringify(value)) as JsonObject
  } catch {
    return String(value)
  }
}

function permissionTitle(context: ACPPermissionRequestContext): string {
  if (context.toolCall?.title) return `${context.agentName}: ${context.toolCall.title}`
  return `${context.agentName} 请求执行${context.toolCall?.kind ? ` ${context.toolCall.kind}` : '工具'}`
}

/**
 * Routes ACP agent permission prompts into the app's Permission state
 * machine so they render as normal permission cards (and reach gateway
 * remote approval via targetChannel like every other ask).
 */
export function registerACPPermissionBridge(): void {
  const bridge: ACPPermissionBridge = async context => {
    const sessionId = context.localSessionId
    if (!sessionId) {
      // Unattributable request: nobody could see or answer the card.
      return { behavior: 'reject' }
    }

    const messageId = context.messageId ?? resolveActiveAssistantMessageId(sessionId) ?? ''
    try {
      await Permission.ask({
        type: 'external-agent',
        title: permissionTitle(context),
        callId: context.toolCall?.toolCallId,
        sessionId,
        messageId,
        metadata: {
          agentId: context.agentId,
          agentName: context.agentName,
          toolKind: context.toolCall?.kind ?? null,
          toolTitle: context.toolCall?.title ?? null,
          rawInput: toSafeJson(context.toolCall?.rawInput) ?? null,
        },
        workingDirectory: context.cwd,
      })
      return { behavior: 'allow' }
    } catch {
      return { behavior: 'reject' }
    }
  }

  ACPManager.setPermissionBridge(bridge)
}
