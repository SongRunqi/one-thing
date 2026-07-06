import path from 'node:path'
import type {
  ChannelReplyDeliveryRecord,
  ChannelUserProfile,
  ChannelUserLink,
} from '../../shared/ipc.js'
import {
  getStorePath,
  readJsonFile,
  writeJsonFile,
} from '../stores/paths.js'
import {
  LOCAL_CLIENT_USER_ID,
  LOCAL_MEMORY_SCOPE_ID,
} from './origin.js'

interface ChannelIdentityStoreData {
  profiles: ChannelUserProfile[]
  links: ChannelUserLink[]
  deliveries: ChannelReplyDeliveryRecord[]
}

const DEFAULT_DATA: ChannelIdentityStoreData = {
  profiles: [],
  links: [],
  deliveries: [],
}

function storePath(): string {
  return path.join(getStorePath(), 'channel-identity.json')
}

function normalizeWorkspaceId(workspaceId?: string): string | undefined {
  const trimmed = workspaceId?.trim()
  return trimmed || undefined
}

function sanitizeProfileId(value: string, fallback = 'user'): string {
  return (value || fallback).trim().replace(/[^a-zA-Z0-9_.@-]+/g, '-').replace(/-+/g, '-') || fallback
}

function defaultProfile(now = Date.now()): ChannelUserProfile {
  return {
    id: LOCAL_CLIENT_USER_ID,
    name: 'Local user',
    memoryScopeId: LOCAL_MEMORY_SCOPE_ID,
    isMain: true,
    source: 'local',
    createdAt: now,
    updatedAt: now,
  }
}

function channelMemoryScope(input: {
  connector: string
  workspaceId?: string
  externalUserId: string
}): string {
  const workspaceId = normalizeWorkspaceId(input.workspaceId) || 'default'
  return `channel:${sanitizeProfileId(input.connector, 'unknown')}:${sanitizeProfileId(workspaceId, 'default')}:${sanitizeProfileId(input.externalUserId, 'unknown')}`
}

function channelProfileId(input: {
  connector: string
  workspaceId?: string
  externalUserId: string
}): string {
  const workspaceId = normalizeWorkspaceId(input.workspaceId) || 'default'
  return sanitizeProfileId(`channel-${input.connector}-${workspaceId}-${input.externalUserId}`, 'channel-user')
}

function readStore(): ChannelIdentityStoreData {
  const data = readJsonFile<ChannelIdentityStoreData>(storePath(), DEFAULT_DATA)
  const now = Date.now()
  const profiles = Array.isArray(data.profiles) ? data.profiles : []
  if (!profiles.some(profile => profile.id === LOCAL_CLIENT_USER_ID)) {
    profiles.unshift(defaultProfile(now))
  }
  return {
    profiles,
    links: Array.isArray(data.links) ? data.links : [],
    deliveries: Array.isArray(data.deliveries) ? data.deliveries : [],
  }
}

function writeStore(data: ChannelIdentityStoreData): void {
  writeJsonFile(storePath(), data)
}

export class ChannelIdentityStore {
  listProfiles(): ChannelUserProfile[] {
    return [...readStore().profiles].sort((left, right) => {
      if (left.isMain && !right.isMain) return -1
      if (!left.isMain && right.isMain) return 1
      return (right.lastSentAt || right.updatedAt) - (left.lastSentAt || left.updatedAt)
    })
  }

  getProfile(id: string): ChannelUserProfile | undefined {
    return readStore().profiles.find(profile => profile.id === id)
  }

  getMainProfile(): ChannelUserProfile {
    const data = readStore()
    const profile = data.profiles.find(item => item.isMain) || data.profiles.find(item => item.id === LOCAL_CLIENT_USER_ID)
    return profile || defaultProfile()
  }

  createProfile(input: {
    id?: string
    name: string
    isMain?: boolean
    source?: ChannelUserProfile['source']
    memoryScopeId?: string
  }): ChannelUserProfile {
    const now = Date.now()
    const data = readStore()
    const id = sanitizeProfileId(input.id || input.name, `user-${now}`)
    const existing = data.profiles.find(profile => profile.id === id)

    if (input.isMain) {
      data.profiles.forEach(profile => {
        profile.isMain = profile.id === id
      })
    }

    if (existing) {
      existing.name = input.name.trim() || existing.name
      existing.memoryScopeId = input.memoryScopeId || existing.memoryScopeId
      existing.source = input.source || existing.source
      existing.isMain = input.isMain === undefined ? existing.isMain : input.isMain
      existing.updatedAt = now
      writeStore(data)
      return existing
    }

    const profile: ChannelUserProfile = {
      id,
      name: input.name.trim() || id,
      memoryScopeId: input.memoryScopeId || (id === LOCAL_CLIENT_USER_ID ? LOCAL_MEMORY_SCOPE_ID : `client:${id}`),
      isMain: input.isMain === true,
      source: input.source || 'manual',
      createdAt: now,
      updatedAt: now,
    }
    data.profiles.push(profile)
    if (profile.isMain) {
      data.profiles.forEach(item => {
        item.isMain = item.id === profile.id
      })
    }
    writeStore(data)
    return profile
  }

  updateProfile(input: {
    id: string
    name?: string
    isMain?: boolean
  }): ChannelUserProfile {
    const data = readStore()
    const profile = data.profiles.find(item => item.id === input.id)
    if (!profile) throw new Error('Channel user profile not found')

    if (input.name !== undefined) profile.name = input.name.trim() || profile.name
    if (input.isMain !== undefined) {
      data.profiles.forEach(item => {
        item.isMain = input.isMain ? item.id === input.id : item.isMain && item.id !== input.id
      })
      profile.isMain = input.isMain
    }
    profile.updatedAt = Date.now()
    writeStore(data)
    return profile
  }

  ensureClientProfile(clientUserId: string, displayName?: string): ChannelUserProfile {
    const existing = this.getProfile(clientUserId)
    if (existing) return existing
    return this.createProfile({
      id: clientUserId,
      name: displayName || clientUserId,
      source: clientUserId === LOCAL_CLIENT_USER_ID ? 'local' : 'manual',
      memoryScopeId: clientUserId === LOCAL_CLIENT_USER_ID ? LOCAL_MEMORY_SCOPE_ID : `client:${clientUserId}`,
      isMain: clientUserId === LOCAL_CLIENT_USER_ID,
    })
  }

  ensureChannelProfile(input: {
    connector: string
    workspaceId?: string
    externalUserId: string
    displayName?: string
  }): ChannelUserProfile {
    const id = channelProfileId(input)
    const existing = this.getProfile(id)
    if (existing) return existing
    return this.createProfile({
      id,
      name: input.displayName || input.externalUserId,
      source: 'channel',
      memoryScopeId: channelMemoryScope(input),
    })
  }

  touchProfile(id: string, input: {
    sentAt?: number
    transport?: ChannelUserProfile['lastTransport']
    connector?: string
    displayName?: string
  } = {}): void {
    const data = readStore()
    const profile = data.profiles.find(item => item.id === id)
    if (!profile) return
    const now = Date.now()
    profile.lastSentAt = input.sentAt || now
    profile.lastTransport = input.transport || profile.lastTransport
    profile.lastConnector = input.connector || profile.lastConnector
    if (input.displayName && profile.source === 'channel') profile.name = input.displayName
    profile.updatedAt = now
    writeStore(data)
  }

  listLinks(filter: {
    connector?: string
    workspaceId?: string
    clientUserId?: string
  } = {}): ChannelUserLink[] {
    const workspaceId = normalizeWorkspaceId(filter.workspaceId)
    return readStore().links.filter(link => {
      if (filter.connector && link.connector !== filter.connector) return false
      if (workspaceId !== undefined && normalizeWorkspaceId(link.workspaceId) !== workspaceId) return false
      if (filter.clientUserId && link.clientUserId !== filter.clientUserId) return false
      return true
    })
  }

  findLink(input: {
    connector: string
    workspaceId?: string
    externalUserId: string
  }): ChannelUserLink | undefined {
    const workspaceId = normalizeWorkspaceId(input.workspaceId)
    return readStore().links.find(link =>
      link.connector === input.connector
      && normalizeWorkspaceId(link.workspaceId) === workspaceId
      && link.externalUserId === input.externalUserId
    )
  }

  createLink(input: {
    connector: string
    workspaceId?: string
    externalUserId: string
    clientUserId: string
  }): ChannelUserLink {
    this.ensureClientProfile(input.clientUserId)
    const now = Date.now()
    const data = readStore()
    const workspaceId = normalizeWorkspaceId(input.workspaceId)
    const existing = data.links.find(link =>
      link.connector === input.connector
      && normalizeWorkspaceId(link.workspaceId) === workspaceId
      && link.externalUserId === input.externalUserId
    )

    if (existing) {
      existing.clientUserId = input.clientUserId
      existing.updatedAt = now
      writeStore(data)
      return existing
    }

    const link: ChannelUserLink = {
      id: `link-${now}-${Math.random().toString(36).slice(2, 10)}`,
      connector: input.connector,
      workspaceId,
      externalUserId: input.externalUserId,
      clientUserId: input.clientUserId,
      createdAt: now,
      updatedAt: now,
    }
    data.links.push(link)
    writeStore(data)
    return link
  }

  deleteLink(id: string): boolean {
    const data = readStore()
    const nextLinks = data.links.filter(link => link.id !== id)
    if (nextLinks.length === data.links.length) return false
    writeStore({ ...data, links: nextLinks })
    return true
  }

  listDeliveries(): ChannelReplyDeliveryRecord[] {
    return readStore().deliveries
  }

  getDelivery(assistantMessageId: string): ChannelReplyDeliveryRecord | undefined {
    return readStore().deliveries.find(record => record.assistantMessageId === assistantMessageId)
  }

  upsertDelivery(record: ChannelReplyDeliveryRecord): void {
    const data = readStore()
    const existingIndex = data.deliveries.findIndex(item => item.assistantMessageId === record.assistantMessageId)
    if (existingIndex >= 0) {
      data.deliveries[existingIndex] = record
    } else {
      data.deliveries.push(record)
    }
    writeStore(data)
  }
}

let singleton: ChannelIdentityStore | null = null

export function getChannelIdentityStore(): ChannelIdentityStore {
  if (!singleton) singleton = new ChannelIdentityStore()
  return singleton
}
