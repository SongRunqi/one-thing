import { session, type WebContents } from 'electron'

type ResponseHeaders = Record<string, string | string[]>

export interface ElectronWebRequestLike {
  onHeadersReceived(
    listener: (
      details: { responseHeaders?: ResponseHeaders },
      callback: (response: { responseHeaders: ResponseHeaders }) => void,
    ) => void,
  ): void
}

export interface ElectronSessionSecurityLike {
  webRequest: ElectronWebRequestLike
}

export interface ElectronMediaPermissionSessionLike {
  setPermissionRequestHandler?(
    handler: (webContents: WebContents, permission: string, callback: (granted: boolean) => void) => void,
  ): void
  setPermissionCheckHandler?(
    handler: (webContents: WebContents | null, permission: string) => boolean,
  ): void
}

export interface ElectronContentSecurityPolicyOptions {
  session?: ElectronSessionSecurityLike
  isDevelopment?: boolean
}

export interface ElectronMediaPermissionsOptions {
  session?: ElectronMediaPermissionSessionLike
  isAppWebContents(webContents: WebContents | null): boolean
}

const mediaPermissionSessions = new WeakSet<object>()

export function registerElectronContentSecurityPolicy(
  options: ElectronContentSecurityPolicyOptions = {},
): void {
  const electronSession = options.session ?? session.defaultSession
  const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV === 'development'

  electronSession.webRequest.onHeadersReceived((details, callback) => {
    const cspDirectives = [
      "default-src 'self'",
      isDevelopment
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https: file: media:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.deepseek.com https://api.moonshot.cn https://open.bigmodel.cn https://*.zhipuai.cn https://*.aliyuncs.com ws://127.0.0.1:* http://127.0.0.1:*",
      "media-src 'self' blob: data: file:",
      "worker-src 'self' blob:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives.join('; ')],
      },
    })
  })
}

export function registerElectronMediaPermissions(
  options: ElectronMediaPermissionsOptions,
): boolean {
  const electronSession = options.session ?? session.defaultSession
  if (mediaPermissionSessions.has(electronSession)) return false

  if (
    typeof electronSession.setPermissionRequestHandler !== 'function'
    || typeof electronSession.setPermissionCheckHandler !== 'function'
  ) {
    return false
  }

  mediaPermissionSessions.add(electronSession)

  electronSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && options.isAppWebContents(webContents))
  })

  electronSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media' && options.isAppWebContents(webContents)
  })

  return true
}
