import { Permission } from '../permission/index.js'
import { resolvePermissionMessageAnchor } from '../permission/message-anchor.js'
import { ACPManager } from './index.js'
import type { ACPPermissionBridge, ACPPermissionRequestContext } from '@onething/runtime/acp'
import type { JsonObject } from '@shared/json.js'

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

    // 提示上下文今天不带 assistant 消息号,而一个渲染侧找不到的锚 = 卡永远不上屏。
    // 判据与 SDK 那条通路共用同一个所有者(`app/permission/message-anchor.ts`)。
    const messageId = resolvePermissionMessageAnchor(sessionId, context.messageId)
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
