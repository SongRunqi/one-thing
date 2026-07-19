import type { JsonObject } from '../json.js'

export type OriginTransport = 'desktop' | 'voice' | 'api' | 'im'
export type ConversationType = 'desktop' | 'dm' | 'group' | 'thread'
export type ResolvedIdentityKind = 'client-user' | 'channel-user'

export interface ChannelActor {
  externalUserId: string
  displayName?: string
  handle?: string
  avatarUrl?: string
  locale?: string
  timezone?: string
}

export interface ChannelConversation {
  connector: string
  workspaceId?: string
  externalConversationId: string
  type: ConversationType
  title?: string
  threadId?: string
}

export interface ReplyTarget {
  connector: string
  workspaceId?: string
  externalConversationId: string
  threadId?: string
  externalMessageId?: string
}

export interface ResolvedIdentity {
  kind: ResolvedIdentityKind
  userId: string
  profileId?: string
  displayName?: string
  linkedClientUserId?: string
  externalUserKey?: string
}

export interface MessageOrigin {
  transport: OriginTransport
  source: 'text' | 'voice' | 'api' | string
  actor?: ChannelActor
  conversation?: ChannelConversation
  replyTarget?: ReplyTarget
  externalMessageId?: string
  receivedAt: number
  resolvedIdentity?: ResolvedIdentity
}

export interface IMConnectorIncomingMessage {
  content: string
  attachments?: JsonObject[]
  origin: MessageOrigin
}

export interface IMConnectorReplyPayload {
  text: string
  sessionId: string
  messageId: string
}

export interface IMConnector {
  id: string
  sendReply(target: ReplyTarget, payload: IMConnectorReplyPayload): Promise<void>
  normalizeIncoming(raw: unknown): Promise<IMConnectorIncomingMessage>
}

export interface ChannelUserLink {
  id: string
  connector: string
  workspaceId?: string
  externalUserId: string
  clientUserId: string
  createdAt: number
  updatedAt: number
}

export interface ChannelUserProfile {
  id: string
  name: string
  isMain?: boolean
  source?: 'local' | 'channel' | 'manual'
  /** Set for source 'channel': where this person was first observed. */
  connector?: string
  workspaceId?: string
  externalUserId?: string
  createdAt: number
  updatedAt: number
  lastSentAt?: number
  lastTransport?: OriginTransport
  lastConnector?: string
}

export interface ChannelIdentityListProfilesResponse {
  success: boolean
  profiles?: ChannelUserProfile[]
  error?: string
}

export interface ChannelIdentityCreateProfileRequest {
  id?: string
  name: string
  isMain?: boolean
}

export interface ChannelIdentityCreateProfileResponse {
  success: boolean
  profile?: ChannelUserProfile
  error?: string
}

export interface ChannelIdentityUpdateProfileRequest {
  id: string
  name?: string
  isMain?: boolean
}

export interface ChannelIdentityUpdateProfileResponse {
  success: boolean
  profile?: ChannelUserProfile
  error?: string
}

export interface ChannelIdentityListLinksRequest {
  connector?: string
  workspaceId?: string
  clientUserId?: string
}

export interface ChannelIdentityListLinksResponse {
  success: boolean
  links?: ChannelUserLink[]
  error?: string
}

export interface ChannelIdentityCreateLinkRequest {
  connector: string
  workspaceId?: string
  externalUserId: string
  clientUserId: string
}

export interface ChannelIdentityCreateLinkResponse {
  success: boolean
  link?: ChannelUserLink
  error?: string
}

export interface ChannelIdentityDeleteLinkRequest {
  id: string
}

export interface ChannelIdentityDeleteLinkResponse {
  success: boolean
  error?: string
}

export interface ChannelIdentityResolveRequest {
  origin: MessageOrigin
}

export interface ChannelIdentityResolveResponse {
  success: boolean
  identity?: ResolvedIdentity
  origin?: MessageOrigin
  sessionId?: string
  error?: string
}

export interface ChannelReplyDeliveryRecord {
  assistantMessageId: string
  sessionId: string
  connector: string
  replyTarget: ReplyTarget
  status: 'sent' | 'failed'
  externalReplyId?: string
  error?: string
  createdAt: number
  updatedAt: number
}
