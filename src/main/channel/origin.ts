import type {
  ChannelActor,
  ChannelConversation,
  MessageOrigin,
  OriginTransport,
  ResolvedIdentity,
} from '../../shared/ipc.js'

export const LOCAL_CLIENT_USER_ID = 'local-owner'
export const LOCAL_MEMORY_SCOPE_ID = `client:${LOCAL_CLIENT_USER_ID}`

export function createLocalClientIdentity(displayName = 'Local user'): ResolvedIdentity {
  return {
    kind: 'client-user',
    userId: LOCAL_CLIENT_USER_ID,
    memoryScopeId: LOCAL_MEMORY_SCOPE_ID,
    profileId: LOCAL_CLIENT_USER_ID,
    displayName,
    linkedClientUserId: LOCAL_CLIENT_USER_ID,
  }
}

export function createDesktopOrigin(input: {
  source?: string
  receivedAt?: number
  displayName?: string
} = {}): MessageOrigin {
  return {
    transport: 'desktop',
    source: input.source || 'text',
    receivedAt: input.receivedAt ?? Date.now(),
    resolvedIdentity: createLocalClientIdentity(input.displayName),
  }
}

export function createVoiceOrigin(input: {
  receivedAt?: number
  displayName?: string
} = {}): MessageOrigin {
  return {
    transport: 'voice',
    source: 'voice',
    receivedAt: input.receivedAt ?? Date.now(),
    resolvedIdentity: createLocalClientIdentity(input.displayName),
  }
}

export function createApiOrigin(input: {
  actor?: ChannelActor
  conversation?: ChannelConversation
  receivedAt?: number
} = {}): MessageOrigin {
  return {
    transport: 'api',
    source: 'api',
    actor: input.actor,
    conversation: input.conversation,
    receivedAt: input.receivedAt ?? Date.now(),
  }
}

export function cloneOrigin(origin: MessageOrigin | undefined): MessageOrigin | undefined {
  return origin ? JSON.parse(JSON.stringify(origin)) as MessageOrigin : undefined
}

export function sanitizeRendererOrigin(command: Record<string, unknown>): MessageOrigin {
  const source = typeof command.source === 'string' ? command.source : undefined
  const transport: OriginTransport = source === 'voice' ? 'voice' : 'desktop'
  return transport === 'voice'
    ? createVoiceOrigin()
    : createDesktopOrigin({ source })
}

export function identitySessionKey(origin: MessageOrigin): string | undefined {
  const identity = origin.resolvedIdentity
  if (!identity) return undefined
  if (origin.transport === 'desktop' || origin.transport === 'voice') return undefined

  const connector = origin.conversation?.connector || origin.replyTarget?.connector || origin.transport
  const workspaceId = origin.conversation?.workspaceId || origin.replyTarget?.workspaceId || 'default'
  return `identity:${origin.transport}:${connector}:${workspaceId}:${identity.userId}`
}

export function originDisplayName(origin: MessageOrigin): string {
  return origin.resolvedIdentity?.displayName
    || origin.actor?.displayName
    || origin.actor?.handle
    || origin.actor?.externalUserId
    || origin.resolvedIdentity?.userId
    || 'Unknown user'
}

export function originConnector(origin: MessageOrigin): string | undefined {
  return origin.conversation?.connector || origin.replyTarget?.connector
}

export function originWorkspaceId(origin: MessageOrigin): string | undefined {
  return origin.conversation?.workspaceId || origin.replyTarget?.workspaceId
}
