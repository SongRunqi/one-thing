import * as PermissionGrants from '../../permission/permission-grants.js'
import { Permission } from '../../permission/index.js'
import { isSessionUnattended } from '../../permission/unattended.js'
import {
  createOnethingPermissionRuntime,
} from '@onething/runtime/permissions'
import * as store from '../../store.js'
import { isSystemInternalOrigin, latestRealOrigin } from '../../channel/origin.js'
import { writeAppLog } from '../../logging/index.js'
import type {
  EnforcePermissionPolicyInput,
  PermissionPolicyInput,
} from '@onething/runtime/permissions'
import type { ChatMessage, MessageOrigin } from '../../../shared/ipc.js'

const permissionRuntime = createOnethingPermissionRuntime({
  grantMatcher: PermissionGrants.matchGrant,
  permissionBridge: Permission,
})

export function decidePermission(input: PermissionPolicyInput) {
  return permissionRuntime.decide(input)
}

/**
 * For unattended sessions (radio DJ turns) an interactive prompt is a hang,
 * not a question — nobody is there to click it. Grants still allow; anything
 * that would ask is denied on the spot with an explanation the model can act
 * on.
 */
const unattendedBridge = {
  getMode: (sessionId: string) => Permission.getMode(sessionId),
  ask: async (request: Parameters<typeof Permission.ask>[0]): Promise<void> => {
    throw new Error(
      `此会话无人值守,权限请求被自动拒绝:${request.title}。请改用免审批的白名单命令(如裸 ncm-cli),或把结果写进已授权的目录。`,
    )
  },
}

/**
 * "Unattended" is a property of the TURN, not just the session: the radio
 * session lives in the Music workspace where the user can open it and talk to
 * the DJ directly — those user-driven turns have a human watching, and denying
 * their prompts would be nonsense. Only turns driven by a system-internal
 * message (radio wake, goal kick) in a marked session degrade ask → deny.
 */
function isUnattendedTurn(sessionId: string): boolean {
  if (!isSessionUnattended(sessionId)) return false
  const messages = store.getSession(sessionId)?.messages as ChatMessage[] | undefined
  const lastUser = [...(messages ?? [])].reverse().find(message => message.role === 'user')
  const origin = lastUser?.origin
  // No origin = an internal drive of unknown provenance — stay unattended.
  return !origin || isSystemInternalOrigin(origin)
}

export async function enforcePermissionPolicy(input: EnforcePermissionPolicyInput): Promise<void> {
  const enriched = enrichPermissionInput(input)
  if (isUnattendedTurn(input.sessionId)) {
    await permissionRuntime.enforce({ ...enriched, permissionBridge: unattendedBridge })
    return
  }
  await permissionRuntime.enforce(enriched)
}

function enrichPermissionInput(input: EnforcePermissionPolicyInput): EnforcePermissionPolicyInput {
  const origin = findOriginForPermission(input.sessionId, input.messageId)
  if (!origin) return input

  const userId = input.userId ?? origin.resolvedIdentity?.userId
  const workspaceId = input.workspaceId ?? origin.conversation?.workspaceId ?? origin.replyTarget?.workspaceId
  const metadata = buildPermissionOriginMetadata(origin)

  writeAppLog('info', 'channel.permission', 'Permission request identity context resolved', {
    sessionId: input.sessionId,
    messageId: input.messageId,
    toolName: input.toolName,
    userId,
    workspaceId,
  })

  return {
    ...input,
    userId,
    workspaceId,
    preview: {
      ...(input.preview ?? {}),
      metadata: {
        ...(input.preview?.metadata ?? {}),
        communicationOrigin: metadata,
      },
    },
  }
}

function findOriginForPermission(sessionId: string, messageId: string): MessageOrigin | undefined {
  const session = store.getSession(sessionId)
  const messages = session?.messages as ChatMessage[] | undefined
  if (!messages?.length) return undefined

  // Goal-driven runs stamp their messages with an identity-less internal
  // origin; permission scoping must attach to the real user behind the
  // session, so skip those and fall through to the latest real origin.
  const directMessage = messages.find(message => message.id === messageId)
  if (directMessage?.origin && !isSystemInternalOrigin(directMessage.origin)) {
    return directMessage.origin
  }

  return latestRealOrigin(messages)
}

function buildPermissionOriginMetadata(origin: MessageOrigin): Record<string, unknown> {
  return {
    transport: origin.transport,
    source: origin.source,
    connector: origin.conversation?.connector ?? origin.replyTarget?.connector,
    workspaceId: origin.conversation?.workspaceId ?? origin.replyTarget?.workspaceId,
    conversationId: origin.conversation?.externalConversationId ?? origin.replyTarget?.externalConversationId,
    conversationType: origin.conversation?.type,
    threadId: origin.conversation?.threadId ?? origin.replyTarget?.threadId,
    externalMessageId: origin.externalMessageId ?? origin.replyTarget?.externalMessageId,
    identityKind: origin.resolvedIdentity?.kind,
    identityUserId: origin.resolvedIdentity?.userId,
  }
}

export type {
  EnforcePermissionPolicyInput,
  PermissionEffect,
  PermissionGrantMatcher,
  PermissionBridge,
  PermissionMetadata,
  PermissionPolicyDecision,
  PermissionPolicyInput,
  PermissionPolicyMode,
  PermissionPolicyResult,
  PermissionPreview,
} from '@onething/runtime/permissions'
