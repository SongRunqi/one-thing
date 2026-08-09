import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: vi.fn(),
      },
    },
  },
}))

describe('electron session security', () => {
  function createSecuritySession() {
    return {
      webRequest: {
        onHeadersReceived: vi.fn(),
      },
    }
  }

  function createPermissionSession() {
    return {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    }
  }

  it('registers content security policy and preserves existing headers', async () => {
    const { registerElectronContentSecurityPolicy } = await import('../session-security.js')
    const electronSession = createSecuritySession()
    const callback = vi.fn()

    registerElectronContentSecurityPolicy({ session: electronSession, isDevelopment: true })
    electronSession.webRequest.onHeadersReceived.mock.calls[0][0]({
      responseHeaders: {
        'X-Test': ['ok'],
      },
    }, callback)

    const responseHeaders = callback.mock.calls[0][0].responseHeaders
    const csp = responseHeaders['Content-Security-Policy'][0]
    expect(responseHeaders['X-Test']).toEqual(['ok'])
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain('media-src')
    // 插件 webview(C 期):父页的 frame-src 必须放行这个 scheme —— 否则
    // sandbox iframe 在加载之前就被挡掉,子文档自己的 CSP 根本没机会生效。
    expect(csp).toContain('frame-src onething-plugin:')
    expect(csp).not.toContain("frame-src 'none'")
  })

  it('omits unsafe-eval outside development', async () => {
    const { registerElectronContentSecurityPolicy } = await import('../session-security.js')
    const electronSession = createSecuritySession()
    const callback = vi.fn()

    registerElectronContentSecurityPolicy({ session: electronSession, isDevelopment: false })
    electronSession.webRequest.onHeadersReceived.mock.calls[0][0]({}, callback)

    const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('grants media permission only for app web contents', async () => {
    const { registerElectronMediaPermissions } = await import('../session-security.js')
    const electronSession = createPermissionSession()
    const appWebContents = { id: 'app' } as any
    const otherWebContents = { id: 'other' } as any
    const isAppWebContents = vi.fn((webContents) => webContents === appWebContents)

    const registered = registerElectronMediaPermissions({
      session: electronSession,
      isAppWebContents,
    })

    const requestCallback = vi.fn()
    electronSession.setPermissionRequestHandler.mock.calls[0][0](appWebContents, 'media', requestCallback)
    electronSession.setPermissionRequestHandler.mock.calls[0][0](otherWebContents, 'media', requestCallback)
    const checkHandler = electronSession.setPermissionCheckHandler.mock.calls[0][0]

    expect(registered).toBe(true)
    expect(requestCallback.mock.calls.map(call => call[0])).toEqual([true, false])
    expect(checkHandler(appWebContents, 'media')).toBe(true)
    expect(checkHandler(appWebContents, 'notifications')).toBe(false)
    expect(checkHandler(otherWebContents, 'media')).toBe(false)
  })

  it('does not register media permission handlers more than once per session', async () => {
    const { registerElectronMediaPermissions } = await import('../session-security.js')
    const electronSession = createPermissionSession()
    const options = {
      session: electronSession,
      isAppWebContents: vi.fn(() => true),
    }

    expect(registerElectronMediaPermissions(options)).toBe(true)
    expect(registerElectronMediaPermissions(options)).toBe(false)
    expect(electronSession.setPermissionRequestHandler).toHaveBeenCalledTimes(1)
    expect(electronSession.setPermissionCheckHandler).toHaveBeenCalledTimes(1)
  })
})
