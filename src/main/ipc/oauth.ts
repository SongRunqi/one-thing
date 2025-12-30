/**
 * OAuth IPC Handlers
 *
 * Handles OAuth flows for Claude Code (PKCE) and GitHub Copilot (Device Flow).
 */

import { ipcMain, shell, BrowserWindow } from 'electron'
import http from 'http'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  OAuthStartRequest,
  OAuthStartResponse,
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  OAuthStatusRequest,
  OAuthStatusResponse,
  OAuthLogoutRequest,
  OAuthLogoutResponse,
  OAuthDevicePollRequest,
  OAuthDevicePollResponse,
} from '../../shared/ipc.js'
import { oauthManager } from '../services/auth/oauth-manager.js'
import { testOAuthDirect } from '../test-oauth-direct.js'

// Store for active callback servers
const callbackServers: Map<string, http.Server> = new Map()

// Store for device flow polling intervals
const devicePollingIntervals: Map<string, NodeJS.Timeout> = new Map()

/**
 * Start a local server to handle OAuth callback
 */
function startCallbackServer(providerId: string, port: number = 54545): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    // Clean up existing server if any
    const existingServer = callbackServers.get(providerId)
    if (existingServer) {
      existingServer.close()
      callbackServers.delete(providerId)
    }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${port}`)

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        // Send success page
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authorization Complete</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .container {
                text-align: center;
                padding: 40px;
                background: rgba(255,255,255,0.1);
                border-radius: 16px;
                backdrop-filter: blur(10px);
              }
              h1 { margin-bottom: 16px; }
              p { opacity: 0.8; }
            </style>
          </head>
          <body>
            <div class="container">
              ${error
                ? `<h1>Authorization Failed</h1><p>${error}</p>`
                : `<h1>Authorization Complete</h1><p>You can close this window and return to the app.</p>`
              }
            </div>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
          </html>
        `)

        // Close server
        server.close()
        callbackServers.delete(providerId)

        if (error) {
          reject(new Error(error))
        } else if (code && state) {
          resolve({ code, state })
        } else {
          reject(new Error('Missing code or state in callback'))
        }
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    server.on('error', (err) => {
      callbackServers.delete(providerId)
      reject(err)
    })

    server.listen(port, () => {
      console.log(`OAuth callback server listening on port ${port}`)
      callbackServers.set(providerId, server)
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      if (callbackServers.has(providerId)) {
        server.close()
        callbackServers.delete(providerId)
        reject(new Error('OAuth callback timeout'))
      }
    }, 5 * 60 * 1000)
  })
}

/**
 * Register OAuth IPC handlers
 */
export function registerOAuthHandlers(): void {
  // Start OAuth flow
  ipcMain.handle(
    IPC_CHANNELS.OAUTH_START,
    async (_event, request: OAuthStartRequest): Promise<OAuthStartResponse> => {
      const { providerId } = request

      try {
        const config = oauthManager.getConfig(providerId)
        if (!config) {
          return { success: false, error: `Unknown provider: ${providerId}` }
        }

        // Check OAuth flow type
        if (config.deviceCodeUrl) {
          // Device Flow (GitHub Copilot)
          const result = await oauthManager.startDeviceFlow(providerId)

          // Open verification URL in browser
          shell.openExternal(result.verificationUri)

          return {
            success: true,
            userCode: result.userCode,
            verificationUri: result.verificationUri,
            expiresIn: result.expiresIn,
            interval: result.interval,
          }
        } else {
          // PKCE Flow (Claude Code)
          const authData = oauthManager.buildAuthorizationUrl(providerId)
          if (!authData) {
            return { success: false, error: 'Failed to build authorization URL' }
          }

          // Open auth URL in browser
          shell.openExternal(authData.authUrl)

          // For Claude Code, we use code entry flow (user copies code from page)
          // The response tells the frontend to show a code input field
          return {
            success: true,
            authUrl: authData.authUrl,
            state: authData.state,
            requiresCodeEntry: true, // Tell frontend to show code input
            instructions: 'After authorizing, copy the entire code shown on the page (including any # and text after it) and paste it here.',
          }
        }
      } catch (error) {
        console.error('OAuth start failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'OAuth start failed',
        }
      }
    }
  )

  // Handle OAuth callback (manual - for cases where automatic callback doesn't work)
  ipcMain.handle(
    IPC_CHANNELS.OAUTH_CALLBACK,
    async (_event, request: OAuthCallbackRequest): Promise<OAuthCallbackResponse> => {
      const { providerId, code, state } = request

      try {
        await oauthManager.exchangeCodeForToken(providerId, code, state)
        return { success: true }
      } catch (error) {
        console.error('OAuth callback failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Callback failed',
        }
      }
    }
  )

  // Poll device flow status
  ipcMain.handle(
    IPC_CHANNELS.OAUTH_DEVICE_POLL,
    async (_event, request: OAuthDevicePollRequest): Promise<OAuthDevicePollResponse> => {
      const { providerId } = request

      try {
        const result = await oauthManager.pollDeviceFlow(providerId)

        if (result.completed) {
          // Notify renderer of successful login
          const windows = BrowserWindow.getAllWindows()
          windows.forEach(win => {
            win.webContents.send(IPC_CHANNELS.OAUTH_TOKEN_REFRESHED, { providerId })
          })
        }

        return {
          success: true,
          completed: result.completed,
          pollStatus: result.error,
        }
      } catch (error) {
        console.error('OAuth device poll failed:', error)
        return {
          success: false,
          completed: false,
          error: error instanceof Error ? error.message : 'Poll failed',
        }
      }
    }
  )

  // Refresh token
  ipcMain.handle(
    IPC_CHANNELS.OAUTH_REFRESH,
    async (_event, request: { providerId: string }): Promise<{ success: boolean; error?: string }> => {
      const { providerId } = request

      try {
        await oauthManager.refreshToken(providerId)
        return { success: true }
      } catch (error) {
        console.error('OAuth refresh failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Refresh failed',
        }
      }
    }
  )

  // Get OAuth status
  ipcMain.handle(
    IPC_CHANNELS.OAUTH_STATUS,
    async (_event, request: OAuthStatusRequest): Promise<OAuthStatusResponse> => {
      const { providerId } = request

      try {
        const token = await oauthManager.getToken(providerId)
        const isLoggedIn = token !== null && !oauthManager.isTokenExpired(token)

        return {
          success: true,
          isLoggedIn,
          expiresAt: token?.expiresAt,
        }
      } catch (error) {
        console.error('OAuth status check failed:', error)
        return {
          success: false,
          isLoggedIn: false,
          error: error instanceof Error ? error.message : 'Status check failed',
        }
      }
    }
  )

  // Logout
  ipcMain.handle(
    IPC_CHANNELS.OAUTH_LOGOUT,
    async (_event, request: OAuthLogoutRequest): Promise<OAuthLogoutResponse> => {
      const { providerId } = request

      try {
        await oauthManager.deleteToken(providerId)

        // Stop any device polling
        const interval = devicePollingIntervals.get(providerId)
        if (interval) {
          clearInterval(interval)
          devicePollingIntervals.delete(providerId)
        }

        return { success: true }
      } catch (error) {
        console.error('OAuth logout failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Logout failed',
        }
      }
    }
  )

  // Test OAuth API directly (bypassing SDK)
  ipcMain.handle(
    'oauth:test-direct',
    async (_event, providerId: string): Promise<{ success: boolean; error?: string; response?: any; token?: string }> => {
      try {
        const token = await oauthManager.refreshTokenIfNeeded(providerId)
        if (!token) {
          return { success: false, error: 'Not logged in' }
        }

        console.log('[OAuth Test] Testing direct API call for', providerId)
        console.log('[OAuth Test] Token expires at:', new Date(token.expiresAt).toISOString())
        console.log('[OAuth Test] Full token:', token.accessToken)

        const result = await testOAuthDirect(token.accessToken)
        return { ...result, token: token.accessToken }
      } catch (error) {
        console.error('OAuth direct test failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Test failed',
        }
      }
    }
  )
}

/**
 * Clean up OAuth resources
 */
export function cleanupOAuth(): void {
  // Close all callback servers
  callbackServers.forEach((server, providerId) => {
    server.close()
    console.log(`Closed OAuth callback server for ${providerId}`)
  })
  callbackServers.clear()

  // Clear all polling intervals
  devicePollingIntervals.forEach((interval) => {
    clearInterval(interval)
  })
  devicePollingIntervals.clear()
}
