import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type ChannelIdentityCreateLinkRequest,
  type ChannelIdentityCreateLinkResponse,
  type ChannelIdentityCreateProfileRequest,
  type ChannelIdentityCreateProfileResponse,
  type ChannelIdentityDeleteLinkRequest,
  type ChannelIdentityDeleteLinkResponse,
  type ChannelIdentityListLinksRequest,
  type ChannelIdentityListLinksResponse,
  type ChannelIdentityListProfilesResponse,
  type ChannelIdentityResolveRequest,
  type ChannelIdentityResolveResponse,
  type ChannelIdentityUpdateProfileRequest,
  type ChannelIdentityUpdateProfileResponse,
} from '@shared/ipc.js'
import {
  getChannelIdentityService,
  getChannelIdentityStore,
  identitySessionKey,
} from '../channel/index.js'

export function registerChannelIdentityHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CHANNEL_IDENTITY_LIST_PROFILES,
    async (): Promise<ChannelIdentityListProfilesResponse> => {
      try {
        return {
          success: true,
          profiles: getChannelIdentityStore().listProfiles(),
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHANNEL_IDENTITY_CREATE_PROFILE,
    async (_event, request: ChannelIdentityCreateProfileRequest): Promise<ChannelIdentityCreateProfileResponse> => {
      try {
        return {
          success: true,
          profile: getChannelIdentityStore().createProfile(request),
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHANNEL_IDENTITY_UPDATE_PROFILE,
    async (_event, request: ChannelIdentityUpdateProfileRequest): Promise<ChannelIdentityUpdateProfileResponse> => {
      try {
        return {
          success: true,
          profile: getChannelIdentityStore().updateProfile(request),
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHANNEL_IDENTITY_LIST_LINKS,
    async (_event, request?: ChannelIdentityListLinksRequest): Promise<ChannelIdentityListLinksResponse> => {
      try {
        return {
          success: true,
          links: getChannelIdentityStore().listLinks(request ?? {}),
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHANNEL_IDENTITY_CREATE_LINK,
    async (_event, request: ChannelIdentityCreateLinkRequest): Promise<ChannelIdentityCreateLinkResponse> => {
      try {
        return {
          success: true,
          link: getChannelIdentityStore().createLink(request),
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHANNEL_IDENTITY_DELETE_LINK,
    async (_event, request: ChannelIdentityDeleteLinkRequest): Promise<ChannelIdentityDeleteLinkResponse> => {
      try {
        const deleted = getChannelIdentityStore().deleteLink(request.id)
        return deleted ? { success: true } : { success: false, error: 'Channel user link not found' }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHANNEL_IDENTITY_RESOLVE,
    async (_event, request: ChannelIdentityResolveRequest): Promise<ChannelIdentityResolveResponse> => {
      try {
        const origin = getChannelIdentityService().resolveOrigin(request.origin)
        return {
          success: true,
          identity: origin.resolvedIdentity,
          origin,
          sessionId: identitySessionKey(origin),
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.CHANNEL_DELIVERY_LIST, async () => {
    try {
      return {
        success: true,
        deliveries: getChannelIdentityStore().listDeliveries(),
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
