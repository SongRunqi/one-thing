/**
 * OAuth IPC Handlers
 *
 * Thin IPC boundary over the main auth subsystem. Provider-specific OAuth
 * behavior lives in src/main/auth/.
 */

import { BrowserWindow, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  OAuthDevicePollRequest,
  OAuthDevicePollResponse,
  OAuthLogoutRequest,
  OAuthLogoutResponse,
  OAuthStartRequest,
  OAuthStartResponse,
  OAuthStatusRequest,
  OAuthStatusResponse,
} from '../../shared/ipc.js'
import { authService } from '../auth/auth-service.js'

function notifyTokenRefreshed(providerId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.OAUTH_TOKEN_REFRESHED, { providerId })
  }
}

function notifyTokenExpired(providerId: string, error?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.OAUTH_TOKEN_EXPIRED, { providerId, error })
  }
}

let listenersRegistered = false

function registerAuthServiceListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  authService.on('token-refreshed', (data: { providerId: string }) => {
    notifyTokenRefreshed(data.providerId)
  })
  authService.on('token-expired', (data: { providerId: string; error?: string }) => {
    notifyTokenExpired(data.providerId, data.error)
  })
}

export function registerOAuthHandlers(): void {
  registerAuthServiceListeners()

  ipcMain.handle(
    IPC_CHANNELS.OAUTH_START,
    async (_event, request: OAuthStartRequest): Promise<OAuthStartResponse> => {
      try {
        const response = await authService.start(request.providerId)
        if (response.success) {
          const url = response.authUrl || response.verificationUri
          if (url) {
            shell.openExternal(url)
          }
        }
        return response
      } catch (error) {
        console.error('[OAuth] Start failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'OAuth start failed',
        }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OAUTH_CALLBACK,
    async (_event, request: OAuthCallbackRequest): Promise<OAuthCallbackResponse> => {
      return authService.completeManualCode(request.providerId, request.code, request.state)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OAUTH_DEVICE_POLL,
    async (_event, request: OAuthDevicePollRequest): Promise<OAuthDevicePollResponse> => {
      try {
        return await authService.pollDeviceFlow(request.providerId, request.flowId || request.deviceCode)
      } catch (error) {
        console.error('[OAuth] Device poll failed:', error)
        return {
          success: false,
          completed: false,
          error: error instanceof Error ? error.message : 'Poll failed',
        }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OAUTH_REFRESH,
    async (_event, request: { providerId: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        await authService.refreshToken(request.providerId)
        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Refresh failed'
        console.error('[OAuth] Refresh failed:', error)
        notifyTokenExpired(request.providerId, message)
        return { success: false, error: message }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OAUTH_STATUS,
    async (_event, request: OAuthStatusRequest): Promise<OAuthStatusResponse> => {
      try {
        return await authService.getStatus(request.providerId)
      } catch (error) {
        console.error('[OAuth] Status check failed:', error)
        return {
          success: false,
          providerId: request.providerId,
          isLoggedIn: false,
          isExpired: false,
          error: error instanceof Error ? error.message : 'Status check failed',
        }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OAUTH_LOGOUT,
    async (_event, request: OAuthLogoutRequest): Promise<OAuthLogoutResponse> => {
      try {
        await authService.deleteToken(request.providerId)
        return { success: true }
      } catch (error) {
        console.error('[OAuth] Logout failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Logout failed',
        }
      }
    }
  )
}

export function cleanupOAuth(): void {
  authService.cleanup()
}
