/**
 * R6 验收:插件流状态。
 *
 * 本期的核心不是"能显示一行字",是**宿主兜底的生命周期**:插件 show 之后可能
 * 抛错、超时、被熔断、被停用、或者干脆忘了 clear —— 任何一种都会在用户的对话里
 * 留下一个永远转圈的状态,而用户没有任何办法让它消失。所以正确性不能建立在
 * "插件会守规矩"上,验收也就主要打在"不守规矩时会怎样"。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CORE_PLUGIN_STATUS_MAX_PER_SESSION,
  CORE_PLUGIN_STATUS_SWEEP_EVENTS,
  CorePluginStatusRegistry,
  PLUGIN_STATUS_PART_TYPE,
  isPluginStatusSweepEvent,
} from '@onething/core/plugins'

const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-plugin-status-'))
const previousStorePath = process.env.ONETHING_STORE_PATH
process.env.ONETHING_STORE_PATH = storeRoot

afterAll(async () => {
  if (previousStorePath === undefined) delete process.env.ONETHING_STORE_PATH
  else process.env.ONETHING_STORE_PATH = previousStorePath
  for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve))
  fs.rmSync(storeRoot, { recursive: true, force: true })
})

describe('R6 status registry — 格子语义与清扫', () => {
  let registry: CorePluginStatusRegistry

  beforeEach(() => {
    registry = new CorePluginStatusRegistry()
  })

  it('treats (pluginId, id) as a cell: a repeat show updates the label', () => {
    expect(registry.show({ pluginId: 'p', sessionId: 's', id: 'scan', label: 'Scanning 1/40' }))
      .toEqual({ type: PLUGIN_STATUS_PART_TYPE, pluginId: 'p', id: 'scan', label: 'Scanning 1/40' })
    registry.show({ pluginId: 'p', sessionId: 's', id: 'scan', label: 'Scanning 2/40' })
    registry.show({ pluginId: 'p', sessionId: 's', id: 'scan', label: 'Scanning 3/40' })

    // 一个每秒汇报进度的插件不该在气泡里堆出几百行。
    expect(registry.list('s')).toEqual([
      { pluginId: 'p', sessionId: 's', id: 'scan', label: 'Scanning 3/40' },
    ])
  })

  it('keeps two plugins and two ids apart', () => {
    registry.show({ pluginId: 'a', sessionId: 's', id: 'x', label: 'A x' })
    registry.show({ pluginId: 'b', sessionId: 's', id: 'x', label: 'B x' })
    registry.show({ pluginId: 'a', sessionId: 's', id: 'y', label: 'A y' })
    expect(registry.list('s')).toHaveLength(3)
  })

  it('rejects junk without throwing — a bad label must not fail the plugin call', () => {
    expect(registry.show({ pluginId: '', sessionId: 's', id: 'x', label: 'l' })).toBeNull()
    expect(registry.show({ pluginId: 'p', sessionId: '', id: 'x', label: 'l' })).toBeNull()
    expect(registry.show({ pluginId: 'p', sessionId: 's', id: '', label: 'l' })).toBeNull()
    expect(registry.show({ pluginId: 'p', sessionId: 's', id: 'x', label: '   ' })).toBeNull()
    expect(registry.size()).toBe(0)
  })

  it('caps new entries per session but always lets an existing one update', () => {
    for (let i = 0; i < CORE_PLUGIN_STATUS_MAX_PER_SESSION; i += 1) {
      expect(registry.show({ pluginId: 'p', sessionId: 's', id: `i${i}`, label: 'x' })).not.toBeNull()
    }
    // 到顶之后新增被挡。
    expect(registry.show({ pluginId: 'p', sessionId: 's', id: 'overflow', label: 'x' })).toBeNull()
    // 但已挂着的更新永远放行 —— 否则到顶的会话里状态会卡在旧文案上,
    // 比"新的挂不上"更让人困惑。
    expect(registry.show({ pluginId: 'p', sessionId: 's', id: 'i0', label: 'updated' })).not.toBeNull()
    expect(registry.list('s').find(record => record.id === 'i0')?.label).toBe('updated')
  })

  it('clear returns a cleared part once, and nothing the second time', () => {
    registry.show({ pluginId: 'p', sessionId: 's', id: 'x', label: 'l' })
    expect(registry.clear({ pluginId: 'p', sessionId: 's', id: 'x' })).toMatchObject({ cleared: true, id: 'x' })
    expect(registry.clear({ pluginId: 'p', sessionId: 's', id: 'x' })).toBeNull()
  })

  it('sweeps a whole session and reports every part that has to be taken down', () => {
    registry.show({ pluginId: 'a', sessionId: 's1', id: 'x', label: 'l' })
    registry.show({ pluginId: 'b', sessionId: 's1', id: 'y', label: 'l' })
    registry.show({ pluginId: 'a', sessionId: 's2', id: 'z', label: 'l' })

    const swept = registry.clearSession('s1')
    expect(swept.map(part => part.id).sort()).toEqual(['x', 'y'])
    expect(swept.every(part => part.cleared)).toBe(true)
    // 别的会话不受影响。
    expect(registry.list('s2')).toHaveLength(1)
  })

  it('sweeps a plugin across every session and says which session each came from', () => {
    registry.show({ pluginId: 'a', sessionId: 's1', id: 'x', label: 'l' })
    registry.show({ pluginId: 'a', sessionId: 's2', id: 'y', label: 'l' })
    registry.show({ pluginId: 'b', sessionId: 's1', id: 'z', label: 'l' })

    const swept = registry.clearPlugin('a')
    // 撤下事件必须投回**原会话** —— 过线的 part 里没有会话地址,所以这里要带上。
    expect(swept.map(entry => entry.sessionId).sort()).toEqual(['s1', 's2'])
    expect(registry.list('s1')).toEqual([
      { pluginId: 'b', sessionId: 's1', id: 'z', label: 'l' },
    ])
  })

  it('sweeps on all three stream endings — error and aborted are where clear gets skipped', () => {
    expect([...CORE_PLUGIN_STATUS_SWEEP_EVENTS]).toEqual(['stream:complete', 'stream:error', 'stream:aborted'])
    for (const type of CORE_PLUGIN_STATUS_SWEEP_EVENTS) {
      expect(isPluginStatusSweepEvent(type)).toBe(true)
    }
    expect(isPluginStatusSweepEvent('stream:start')).toBe(false)
    expect(isPluginStatusSweepEvent('content:part')).toBe(false)
  })
})

describe('R6 status — 装配层接线', () => {
  async function loadStatus() {
    const module = await import('../status.js')
    module.resetPluginStatusHostForTests()
    const emitted: Array<{ sessionId: string; event: any }> = []
    module.configurePluginStatusHost({
      emitSessionEvent: (sessionId, event) => { emitted.push({ sessionId, event }) },
    })
    return { module, emitted }
  }

  it('delivers a status over the existing content:part rail, not a new one', async () => {
    const { module, emitted } = await loadStatus()
    module.getPluginStatusRegistry().show({ pluginId: 'p', sessionId: 's', id: 'x', label: 'Working' })
    module.emitPluginStatusPart('s', { type: PLUGIN_STATUS_PART_TYPE, pluginId: 'p', id: 'x', label: 'Working' })

    // 走既有轨道 = desktop 的 IPCBridge 与 web 的 SSE 双扇出都是免费的。
    expect(emitted).toEqual([
      { sessionId: 's', event: { type: 'content:part', part: { type: 'plugin-status', pluginId: 'p', id: 'x', label: 'Working' } } },
    ])
  })

  it('force-sweeps a session and emits a cleared part for each survivor', async () => {
    const { module, emitted } = await loadStatus()
    const registry = module.getPluginStatusRegistry()
    registry.show({ pluginId: 'p', sessionId: 's', id: 'a', label: 'l' })
    registry.show({ pluginId: 'q', sessionId: 's', id: 'b', label: 'l' })
    emitted.length = 0

    module.sweepPluginStatusForSession('s')

    expect(emitted).toHaveLength(2)
    expect(emitted.every(entry => entry.event.part.cleared)).toBe(true)
    expect(registry.size()).toBe(0)
  })

  it('sweeps on stream end via the bus — the plugin never has to be well behaved', async () => {
    const { module, emitted } = await loadStatus()
    const handlers: Array<(envelope: any) => void> = []
    const unsubscribe = module.subscribePluginStatusSweep({
      onAnySessionAny: (handler: (envelope: any) => void) => {
        handlers.push(handler)
        return () => {}
      },
    })

    module.getPluginStatusRegistry().show({ pluginId: 'p', sessionId: 's', id: 'x', label: 'Working' })
    emitted.length = 0

    // 插件在 show 之后抛错,永远没走到 clear。
    handlers.forEach(handler => handler({ sessionId: 's', event: { type: 'stream:error' } }))

    expect(emitted).toHaveLength(1)
    expect(emitted[0].event.part).toMatchObject({ id: 'x', cleared: true })
    expect(module.getPluginStatusRegistry().size()).toBe(0)
    unsubscribe()
  })

  it('ignores non-terminal events so a mid-stream chunk does not wipe live statuses', async () => {
    const { module, emitted } = await loadStatus()
    const handlers: Array<(envelope: any) => void> = []
    module.subscribePluginStatusSweep({
      onAnySessionAny: (handler: (envelope: any) => void) => { handlers.push(handler); return () => {} },
    })
    module.getPluginStatusRegistry().show({ pluginId: 'p', sessionId: 's', id: 'x', label: 'Working' })
    emitted.length = 0

    handlers.forEach(handler => handler({ sessionId: 's', event: { type: 'content:part' } }))
    handlers.forEach(handler => handler({ sessionId: 's', event: { type: 'stream:start' } }))

    expect(emitted).toHaveLength(0)
    expect(module.getPluginStatusRegistry().size()).toBe(1)
  })
})

describe('R6 status — 插件 API 面', () => {
  async function createApi(pluginId = 'demo') {
    const status = await import('../status.js')
    status.resetPluginStatusHostForTests()
    const emitted: Array<{ sessionId: string; event: any }> = []
    status.configurePluginStatusHost({
      emitSessionEvent: (sessionId, event) => { emitted.push({ sessionId, event }) },
    })
    const { createPluginAPI, disposePlugin } = await import('../api.js')
    const bus = { emitGlobal: () => {}, onGlobal: () => () => {}, onAnySession: () => () => {} }
    const created = createPluginAPI(pluginId, bus as never, {} as never)
    return { ...created, emitted, status, disposePlugin }
  }

  it('shows and clears through the plugin-facing api', async () => {
    const { api, emitted } = await createApi()
    api.status.show('s1', { id: 'scan', label: 'Scanning…' })
    api.status.clear('s1', 'scan')

    expect(emitted.map(entry => entry.event.part)).toEqual([
      { type: 'plugin-status', pluginId: 'demo', id: 'scan', label: 'Scanning…' },
      { type: 'plugin-status', pluginId: 'demo', id: 'scan', label: 'Scanning…', cleared: true },
    ])
  })

  it('drops a status shown after dispose — nobody would ever come to clean it', async () => {
    const { api, state, emitted, disposePlugin } = await createApi()
    disposePlugin(state)
    emitted.length = 0

    api.status.show('s1', { id: 'late', label: 'Too late' })

    expect(emitted).toHaveLength(0)
  })

  it('sweeps a disabled plugin out of every session it was showing in', async () => {
    const { api, state, emitted, status, disposePlugin } = await createApi('demo')
    api.status.show('s1', { id: 'x', label: 'Working' })
    api.status.show('s2', { id: 'y', label: 'Working' })
    emitted.length = 0

    // 停用 / 熔断走的就是这条路。只等流结束是不够的 —— 那些会话可能几小时后才结束。
    disposePlugin(state)

    expect(emitted).toHaveLength(2)
    expect(emitted.map(entry => entry.sessionId).sort()).toEqual(['s1', 's2'])
    expect(emitted.every(entry => entry.event.part.cleared)).toBe(true)
    expect(status.getPluginStatusRegistry().size()).toBe(0)
  })
})

describe('R6 验收口径 — 新增插件状态零改动 shared 契约', () => {
  it('carries exactly one generic plugin-status member and knows no plugin by name', () => {
    const contractPath = fileURLToPath(new URL('../../../../../shared/ipc/chat.ts', import.meta.url))
    const source = fs.readFileSync(contractPath, 'utf-8')

    // 一个泛化成员。按插件加类型的话,每来一个插件就要改一次这个文件 ——
    // 那正是 soul-memory 让宿主改了 16,989 行的那种形状。
    const members = source.match(/type:\s*'plugin-status'/g) ?? []
    expect(members).toHaveLength(1)

    // 契约面不认识任何具体插件。这条断言就是"零改动"验收的可执行形式:
    // 谁想给自家插件加一个专属状态类型,这里会立刻变红。
    const codeLines = source
      .split('\n')
      .filter(line => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n')
    for (const pluginId of ['log-monitor', 'note-skills', 'soul-memory']) {
      expect(codeLines, `@shared/ipc/chat.ts must not know "${pluginId}"`).not.toContain(pluginId)
    }
  })
})

describe('R6 验收 — log-monitor 示范', () => {
  it('shows progress under one id and clears in finally', async () => {
    const { registerOnethingLogMonitorStatusDemo } = await import('@onething/runtime/plugins')

    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-status-demo-'))
    fs.writeFileSync(path.join(logDir, 'agent-2026-08-07.log'), 'a\n')
    fs.writeFileSync(path.join(logDir, 'agent-2026-08-06.log'), 'bb\n')
    fs.writeFileSync(path.join(logDir, 'notes.txt'), 'ignored')

    try {
      const commands = new Map<string, any>()
      const shown: Array<{ id: string; label: string }> = []
      const cleared: string[] = []
      const notices: string[] = []

      registerOnethingLogMonitorStatusDemo({
        registerCommand: (name, options) => commands.set(name, options),
        status: {
          show: (_sessionId, status) => shown.push(status),
          clear: (_sessionId, id) => cleared.push(id),
        },
      }, { logDir })

      await commands.get('/log-scan').handler('', {
        sessionId: 's1',
        notify: (message: string) => notices.push(message),
      })

      // 全程只用一个 id —— 进度汇报是"更新格子",不是追加。
      expect(new Set(shown.map(entry => entry.id))).toEqual(new Set(['scan']))
      expect(shown.length).toBeGreaterThan(1)
      expect(shown[shown.length - 1].label).toContain('2/2')
      expect(cleared).toEqual(['scan'])
      expect(notices[0]).toContain('Scanned 2 log file(s)')
    } finally {
      fs.rmSync(logDir, { recursive: true, force: true })
    }
  })

  it('leaves no residue when the operation throws before clear', async () => {
    const { registerOnethingLogMonitorStatusDemo } = await import('@onething/runtime/plugins')
    const status = await import('../status.js')
    status.resetPluginStatusHostForTests()
    const emitted: Array<{ sessionId: string; event: any }> = []
    status.configurePluginStatusHost({
      emitSessionEvent: (sessionId, event) => { emitted.push({ sessionId, event }) },
    })

    const commands = new Map<string, any>()
    const registry = status.getPluginStatusRegistry()
    registerOnethingLogMonitorStatusDemo({
      registerCommand: (name, options) => commands.set(name, options),
      status: {
        show: (sessionId, entry) => {
          const part = registry.show({ pluginId: 'log-monitor', sessionId, ...entry })
          if (part) status.emitPluginStatusPart(sessionId, part)
        },
        // 故意**不实现** clear:模拟"插件挂了/忘了收尾"。
        clear: () => {},
      },
    }, { logDir: '/no/such/dir' })

    // 目录不存在 → readdirSync 抛 → finally 里那次 clear 是 no-op。
    await expect(commands.get('/log-scan').handler('', { sessionId: 's1', notify: vi.fn() }))
      .rejects.toThrow()
    expect(registry.size()).toBe(1)

    // 宿主在流结束时强制清扫 —— 这就是 R6 的全部要点。
    status.sweepPluginStatusForSession('s1')
    expect(registry.size()).toBe(0)
    expect(emitted[emitted.length - 1].event.part).toMatchObject({ cleared: true })
  })
})
