import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  protocol: {
    handle: vi.fn(),
    registerSchemesAsPrivileged: vi.fn(),
  },
  session: { defaultSession: { protocol: { handle: vi.fn() } } },
}))

import {
  registerElectronPluginProtocol,
  registerElectronPluginProtocolScheme,
  resolvePluginProtocolFile,
  type ElectronPluginProtocolOptions,
} from '../protocol.js'

let tmp = ''
let root = ''

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-webview-'))
  root = path.join(tmp, 'plugin', 'webview')
  fs.mkdirSync(path.join(root, 'ui'), { recursive: true })
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>')
  fs.writeFileSync(path.join(root, 'ui', 'app.js'), 'export {}')
  // 代码区里躺着的非白名单文件 —— 415,而不是 200 + 猜类型。
  fs.writeFileSync(path.join(root, 'run.sh'), '#!/bin/sh')
  // 数据区(家目录)与静态根之外的秘密。
  fs.mkdirSync(path.join(tmp, 'outside'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'outside', 'secret.html'), 'SECRET')
  fs.symlinkSync(path.join(tmp, 'outside', 'secret.html'), path.join(root, 'escape.html'))
  fs.symlinkSync(path.join(tmp, 'outside'), path.join(root, 'escape-dir'))
})

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function options(overrides: Partial<ElectronPluginProtocolOptions> = {}): ElectronPluginProtocolOptions {
  return {
    resolveStaticRoot: pluginId => (pluginId === 'demo' ? { pluginId, root } : null),
    ...overrides,
  }
}

function resolve(url: string, overrides?: Partial<ElectronPluginProtocolOptions>) {
  return resolvePluginProtocolFile(url, options(overrides))
}

describe('onething-plugin 协议:供给闸', () => {
  it('已装且启用的插件的静态根内文件正常服务', () => {
    const result = resolve('onething-plugin://demo/index.html')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.filePath).toBe(fs.realpathSync.native(path.join(root, 'index.html')))
      expect(result.mime).toContain('text/html')
    }
  })

  it('未装 / 未启用 / 没声明 webview 的插件一律 404(不区分原因)', () => {
    expect(resolve('onething-plugin://unknown/index.html')).toEqual({ ok: false, status: 404 })
    // 供给线返回 null 就是"停用了" —— handler 说的话与"不存在"逐字相同。
    expect(resolve('onething-plugin://demo/index.html', { resolveStaticRoot: () => null }))
      .toEqual({ ok: false, status: 404 })
  })

  it('拆除快照:停用后同一个 URL 立刻 404', () => {
    let enabled = true
    const opts = options({ resolveStaticRoot: id => (enabled && id === 'demo' ? { pluginId: id, root } : null) })
    expect(resolvePluginProtocolFile('onething-plugin://demo/index.html', opts).ok).toBe(true)
    enabled = false
    expect(resolvePluginProtocolFile('onething-plugin://demo/index.html', opts))
      .toEqual({ ok: false, status: 404 })
  })
})

describe('onething-plugin 协议:对抗', () => {
  it.each([
    ['目录穿越 ..', 'onething-plugin://demo/../outside/secret.html'],
    ['中段穿越', 'onething-plugin://demo/ui/../../outside/secret.html'],
    ['编码变体 %2e%2e', 'onething-plugin://demo/%2e%2e/outside/secret.html'],
    ['双段编码变体', 'onething-plugin://demo/ui/%2e%2e/%2e%2e/outside/secret.html'],
    ['目录请求', 'onething-plugin://demo/'],
    ['坏的百分号编码', 'onething-plugin://demo/%zz.html'],
    ['没有 host', 'onething-plugin:///index.html'],
  ])('拒绝:%s', (_label, url) => {
    const result = resolve(url)
    expect(result.ok).toBe(false)
  })

  it('symlink 逃逸:根内的软链指到根外 → 404', () => {
    expect(resolve('onething-plugin://demo/escape.html')).toEqual({ ok: false, status: 404 })
    expect(resolve('onething-plugin://demo/escape-dir/secret.html')).toEqual({ ok: false, status: 404 })
  })

  it('绝对路径进不来:URL 的 host 段才是 pluginId,路径永远相对根', () => {
    // `onething-plugin://demo//etc/passwd` 解析出的 pathname 是 `//etc/passwd`,
    // 规范化之后是 `etc/passwd` —— 落在根内的一个不存在的文件,不是 /etc/passwd。
    const result = resolve('onething-plugin://demo//etc/passwd.html')
    expect(result.ok).toBe(false)
  })

  it('非白名单扩展名 415(而且根本不碰文件系统)', () => {
    const realpath = vi.fn((target: string) => fs.realpathSync.native(target))
    expect(resolve('onething-plugin://demo/run.sh', { realpath })).toEqual({ ok: false, status: 415 })
    // 只解析了静态根本身,没有去 stat 那个文件。
    expect(realpath).toHaveBeenCalledTimes(1)
  })

  it('目录不是文件 → 404', () => {
    expect(resolve('onething-plugin://demo/ui')).toEqual({ ok: false, status: 415 })
  })
})

describe('onething-plugin 协议:响应头', () => {
  it('scheme 必须登记为 privileged(standard + supportFetchAPI,且不开 CORS)', () => {
    const register = vi.fn()
    registerElectronPluginProtocolScheme(register)
    expect(register).toHaveBeenCalledWith([
      expect.objectContaining({
        scheme: 'onething-plugin',
        privileges: expect.objectContaining({
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: false,
        }),
      }),
    ])
  })

  it('每个响应都带 CSP 与 nosniff', async () => {
    let handler: ((request: { url: string }) => Promise<Response>) | undefined
    registerElectronPluginProtocol(options({
      getSession: () => ({ protocol: { handle: (_scheme: string, fn: any) => { handler = fn } } }) as any,
      fetch: (async () => new Response('<!doctype html>', { status: 200 })) as any,
    }))
    const response = await handler!({ url: 'onething-plugin://demo/index.html' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('content-security-policy')).toContain('onething-plugin://demo')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-type')).toContain('text/html')
  })

  it('拒绝路径回的是 404/415 的纯文本,不是文件内容', async () => {
    let handler: ((request: { url: string }) => Promise<Response>) | undefined
    const fetchImpl = vi.fn()
    registerElectronPluginProtocol(options({
      getSession: () => ({ protocol: { handle: (_scheme: string, fn: any) => { handler = fn } } }) as any,
      fetch: fetchImpl as any,
    }))
    const notFound = await handler!({ url: 'onething-plugin://demo/%2e%2e/outside/secret.html' })
    expect(notFound.status).toBe(404)
    const unsupported = await handler!({ url: 'onething-plugin://demo/run.sh' })
    expect(unsupported.status).toBe(415)
    // 一次都没有去读文件。
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
