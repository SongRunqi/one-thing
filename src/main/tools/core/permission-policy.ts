import * as PermissionGrants from '../../permission/permission-grants.js'
import { Permission } from '../../permission/index.js'
import {
  createOnethingPermissionRuntime,
} from '@onething/runtime/permissions'
import * as store from '../../store.js'
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

export async function enforcePermissionPolicy(input: EnforcePermissionPolicyInput): Promise<void> {
  await permissionRuntime.enforce(enrichPermissionInput(input))
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
    memoryScopeId: origin.resolvedIdentity?.memoryScopeId,
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

  const directMessage = messages.find(message => message.id === messageId)
  if (directMessage?.origin) return directMessage.origin

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.origin) return messages[i].origin
  }
  return undefined
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
    memoryScopeId: origin.resolvedIdentity?.memoryScopeId,
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
