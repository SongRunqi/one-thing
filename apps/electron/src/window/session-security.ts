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
      // `onething-plugin:`(G 期,L2.5):插件背景层是 `background-image: url(...)`,
      // 而 CSS 背景走的是 **img-src**。少这一个 scheme,协议那边一切正常、
      // 图也确实在包里,但父页的 CSP 会在请求发出前就把它挡掉 —— 症状是
      // "什么都对,就是不显示",最难查的那一种。
      // 与 frame-src 同规:只放 scheme,不放 host —— 谁能被服务的判定在协议
      // handler 那一侧(已装 + 已启用 + 声明了静态资产),不在这行字符串里。
      "img-src 'self' blob: data: https: file: media: onething-plugin:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.deepseek.com https://api.moonshot.cn https://api.moonshot.ai https://api.kimi.com https://auth.kimi.com https://open.bigmodel.cn https://*.zhipuai.cn https://*.aliyuncs.com ws://127.0.0.1:* http://127.0.0.1:*",
      "media-src 'self' blob: data: file:",
      "worker-src 'self' blob:",
      // 插件 webview 面板(C 期):父页面必须放行 `onething-plugin:` 这一个
      // scheme,否则 sandbox iframe 在**加载之前**就被父页的 CSP 挡掉 ——
      // 而那次拦截发生在子文档的 CSP 之前,子文档的 CSP 再严也没机会生效。
      // 只放 scheme,不放 host:协议本身只服务已装且启用的插件的静态根,
      // 谁能被服务的判定在协议 handler 那一侧,不在这行字符串里。
      "frame-src onething-plugin:",
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
