/**
 * R7 试点注册表:IM 连接器。
 *
 * 这是插件系统第一个对外开放的**既有注册表**。选它不是因为它最有用,是因为它
 * 形状最适配:候选五个里只有它自带退订函数(变量提供者恰恰相反 —— 它至今没有
 * unregister,原方案建议拿它当试点是选反了)。
 *
 * 验收的重点是**停用之后**:注册表回到基线、经该渠道的回复得到一个说得清的
 * 错误而不是静默丢消息、已有会话不受影响。拆除语义在策略表里声明为
 * `degrade-to-default`,这里验证实现与声明一致。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLUGIN_REGISTRY_POLICY } from '@onething/core/plugins'

const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-plugin-connector-'))
const previousStorePath = process.env.ONETHING_STORE_PATH
process.env.ONETHING_STORE_PATH = storeRoot

afterAll(async () => {
  if (previousStorePath === undefined) delete process.env.ONETHING_STORE_PATH
  else process.env.ONETHING_STORE_PATH = previousStorePath
  for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve))
  fs.rmSync(storeRoot, { recursive: true, force: true })
})

async function load() {
  vi.resetModules()
  const [api, registry] = await Promise.all([
    import('../api.js'),
    import('../../channel/connector-registry.js'),
  ])
  return { api, registry }
}

function fakeConnector(id: string, sent: string[]) {
  return {
    id,
    async sendReply(_target: unknown, payload: { text: string }) {
      sent.push(payload.text)
    },
    async normalizeIncoming(raw: unknown) {
      return {
        content: String((raw as { text?: string })?.text ?? ''),
        origin: { connector: id, conversationId: 'c1', userId: 'u1' } as never,
      }
    },
  }
}

const bus = { emitGlobal: () => {}, onGlobal: () => () => {}, onAnySession: () => () => {} }

describe('R7 IM connector — 开放一个既有注册表', () => {
  let sent: string[]

  beforeEach(() => {
    sent = []
  })

  it('routes real traffic through a plugin-registered connector', async () => {
    const { api, registry } = await load()
    const { api: pluginApi, state } = api.createPluginAPI('chat-bridge', bus as never, {} as never)

    pluginApi.registerIMConnector(fakeConnector('fake-im', sent) as never)

    expect(registry.listIMConnectorIds()).toContain('fake-im')
    await registry.sendIMReply(
      { connector: 'fake-im', conversationId: 'c1' } as never,
      { text: 'hello', sessionId: 's1', messageId: 'm1' },
    )
    expect(sent).toEqual(['hello'])

    api.disposePlugin(state)
  })

  it('degrades to default on disable: unregistered, and later replies fail loudly', async () => {
    const { api, registry } = await load()
    const { api: pluginApi, state } = api.createPluginAPI('chat-bridge', bus as never, {} as never)
    pluginApi.registerIMConnector(fakeConnector('fake-im', sent) as never)

    // 停用 = dispose。声明的语义是 degrade-to-default。
    expect(PLUGIN_REGISTRY_POLICY['im-connector'].teardown).toBe('degrade-to-default')
    api.disposePlugin(state)

    // 注册表回到基线 —— 拆除测试的判据。
    expect(registry.listIMConnectorIds()).not.toContain('fake-im')

    // 之后的回复要**说得清地失败**,不是静默丢消息。
    await expect(registry.sendIMReply(
      { connector: 'fake-im', conversationId: 'c1' } as never,
      { text: 'late', sessionId: 's1', messageId: 'm2' },
    )).rejects.toThrow(/not registered/)
    expect(sent).toEqual([])
  })

  it('does not need the plugin to call the returned unsubscribe', async () => {
    const { api, registry } = await load()
    const { api: pluginApi, state } = api.createPluginAPI('chat-bridge', bus as never, {} as never)

    // 插件拿到退订函数但**不调**(忘了、或者抛在半路)。
    pluginApi.registerIMConnector(fakeConnector('forgetful', sent) as never)
    api.disposePlugin(state)

    // 拆除语义不建立在插件守规矩上 —— 这是整条战役的主线。
    expect(registry.listIMConnectorIds()).not.toContain('forgetful')
  })

  it('is idempotent when the plugin does call unsubscribe as well', async () => {
    const { api, registry } = await load()
    const { api: pluginApi, state } = api.createPluginAPI('chat-bridge', bus as never, {} as never)
    const release = pluginApi.registerIMConnector(fakeConnector('polite', sent) as never)

    release()
    expect(registry.listIMConnectorIds()).not.toContain('polite')
    // 再调一次、再 dispose 一次都不该抛。
    expect(() => release()).not.toThrow()
    expect(() => api.disposePlugin(state)).not.toThrow()
  })

  it('does not clobber another plugin connector that registered the same id later', async () => {
    const { api, registry } = await load()
    const first = api.createPluginAPI('a', bus as never, {} as never)
    const second = api.createPluginAPI('b', bus as never, {} as never)

    first.api.registerIMConnector(fakeConnector('shared-id', sent) as never)
    second.api.registerIMConnector(fakeConnector('shared-id', sent) as never)

    // 撤下**先注册**的那个,不能把后来者一起摘掉(registry 的退订按实例比对)。
    api.disposePlugin(first.state)
    expect(registry.listIMConnectorIds()).toContain('shared-id')

    api.disposePlugin(second.state)
    expect(registry.listIMConnectorIds()).not.toContain('shared-id')
  })

  it('refuses a connector with no id instead of registering an unaddressable one', async () => {
    const { api, registry } = await load()
    const { api: pluginApi, state } = api.createPluginAPI('chat-bridge', bus as never, {} as never)
    const before = registry.listIMConnectorIds().length

    pluginApi.registerIMConnector({ sendReply: async () => {} } as never)

    expect(registry.listIMConnectorIds()).toHaveLength(before)
    api.disposePlugin(state)
  })

  it('ignores a registration attempted after teardown', async () => {
    const { api, registry } = await load()
    const { api: pluginApi, state } = api.createPluginAPI('chat-bridge', bus as never, {} as never)
    api.disposePlugin(state)

    // 拆除之后再注册 = 往一个没人再会来清扫的表里塞东西。
    pluginApi.registerIMConnector(fakeConnector('too-late', sent) as never)
    expect(registry.listIMConnectorIds()).not.toContain('too-late')
  })
})
