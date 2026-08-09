/**
 * R5.x-a 验收:锚点地基。
 *
 * 钉住的东西:
 *  1. **锚点清单是宿主编译期常量** —— 插件注册未知锚点/未声明 id/重复 id/
 *     抢占 `ui:` 前缀,四类违规全部被拒且计 registration 熔断;manifest 里
 *     声明未知锚点则是**降级**(unsupported),不是加载错误。
 *  2. **同一套协议与通道** —— `ui:render:` / `ui:action:` 走统一请求通道,
 *     结果过同一套描述树校验,熔断归入 `ui-request` 家族,render 与 action
 *     折叠为同一个 surface(不许出现"画得出来但点不动")。
 *  3. **render ctx 带 anchor 与 sessionId** —— 会话作用域是协议的一部分,
 *     不是二期补丁。
 */
import { describe, expect, it } from 'vitest'
import {
  CorePluginManager,
  PLUGIN_PANEL_PROTOCOL_VERSION,
  PLUGIN_UI_INVOKE_ACTION,
  PLUGIN_UI_RENDER_ACTION,
  UI_ANCHORS,
  UI_ANCHOR_CAPACITY,
  assertUiAnchorRegistryConsistency,
  classifyPluginScope,
  createCorePluginAPI,
  describePluginSurface,
  disposeCorePluginState,
  isUiAnchor,
  pluginScope,
  uiSlotSurfaceId,
  validatePluginContributes,
  type CorePluginDefinition,
  type CorePluginManagerHost,
  type CorePluginRequestHandler,
  type CorePluginStateLike,
  type CorePluginUiSlotRegistration,
  type CorePluginUiSlotContext,
  type PluginPanelTree,
} from '@onething/core/plugins'
import { projectOnethingPluginsForRenderer } from '../../../plugins/plugin-list.js'

interface TestAPI {
  registerUiSlot(registration: CorePluginUiSlotRegistration): void
  registerRequestHandler(action: string, handler: CorePluginRequestHandler): void
}
type TestEntry = (api: TestAPI) => void | Promise<void>
type TestDefinition = CorePluginDefinition<TestEntry>
interface TestCommand { name: string }
interface TestState extends CorePluginStateLike<TestCommand> {
  requestHandlers: Map<string, CorePluginRequestHandler>
  disposed?: boolean
}

function silentLogger() {
  return { log: () => {}, error: () => {} }
}

function createManager(
  definitions: TestDefinition[],
  hostOverrides: Partial<CorePluginManagerHost<TestDefinition, TestEntry, TestAPI, TestState, TestCommand, { ready: true }>> = {},
) {
  const errors: string[] = []
  const failures: Array<{ pluginId: string; scope: string }> = []
  const refreshes: Array<{ pluginId: string; panelId: string }> = []

  const host: CorePluginManagerHost<TestDefinition, TestEntry, TestAPI, TestState, TestCommand, { ready: true }> = {
    ensurePluginDirs() {},
    scanPlugins: () => definitions,
    loadPluginEntry: async definition => definition.entry ?? null,
    createPluginAPI(pluginId) {
      // 声明来自 manifest —— 与 app 层 manager 的取法逐字相同。
      const declaredUiSlots = definitions
        .find(item => item.id === pluginId)
        ?.manifest.contributes?.uiSlots ?? []
      const created = (createCorePluginAPI as any)({
        pluginId,
        declaredUiSlots,
        scheduler: { schedule: () => {}, cancel: () => {} } as any,
        store: { get: () => undefined, set: () => {}, delete: () => {}, keys: () => [] } as any,
        host: {
          emitPanelRefresh(id: string, panelId: string) {
            refreshes.push({ pluginId: id, panelId })
          },
        } as any,
        logger: { log: () => {}, error: (message: string) => errors.push(message) },
        onPluginFailure: (input: { pluginId: string; scope: string }) =>
          failures.push({ pluginId: input.pluginId, scope: input.scope }),
      })
      return { state: created.state as unknown as TestState, api: created.api as unknown as TestAPI }
    },
    disposePlugin(state) {
      disposeCorePluginState(state as any)
    },
    setPluginEnabled() {},
    ...hostOverrides,
  }

  const manager = new CorePluginManager<TestAPI, TestEntry, TestCommand, TestState, TestDefinition, { ready: true }>(
    host,
    silentLogger(),
  )
  return { manager, errors, failures, refreshes }
}

function definition(
  id: string,
  entry: TestEntry,
  uiSlots: Array<{ anchor: string; id: string; label: string }>,
): TestDefinition {
  return {
    id,
    manifest: { name: id, version: '1.0.0', contributes: { uiSlots } },
    dirPath: `/plugins/${id}`,
    entryPath: `/plugins/${id}/plugin-entry.js`,
    enabled: true,
    entry,
  }
}

function simpleTree(text: string): PluginPanelTree {
  return {
    version: PLUGIN_PANEL_PROTOCOL_VERSION,
    body: { type: 'row', children: [{ type: 'markdown', text }] },
  }
}

async function boot(manager: CorePluginManager<any, any, any, any, any, { ready: true }>) {
  await manager.initialize({ ready: true })
}

// ── 清单守卫 ─────────────────────────────────

describe('UI anchor registry', () => {
  it('capacity 键集合与 UI_ANCHORS 产出集合相等(运行时断言)', () => {
    expect(() => assertUiAnchorRegistryConsistency()).not.toThrow()
    for (const anchor of Object.values(UI_ANCHORS)) {
      expect(UI_ANCHOR_CAPACITY[anchor]).toBeDefined()
      expect(isUiAnchor(anchor)).toBe(true)
    }
  })

  it('未知锚点不是锚点', () => {
    expect(isUiAnchor('composer.below')).toBe(false)
    expect(isUiAnchor('message.actions')).toBe(false)
  })
})

// ── manifest 校验:形状管,位置不管 ───────────────

describe('contributes.uiSlots manifest validation', () => {
  it('合法声明通过(含宿主认识的锚点)', () => {
    expect(validatePluginContributes({
      uiSlots: [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }],
    })).toBeNull()
  })

  it('未知锚点**不是**加载期错误(降级为 unsupported 是投影层的职责)', () => {
    expect(validatePluginContributes({
      uiSlots: [{ anchor: 'composer.below', id: 'x', label: 'X' }],
    })).toBeNull()
  })

  it.each([
    [{ uiSlots: 'nope' }, 'must be an array'],
    [{ uiSlots: [{ id: 'x', label: 'X' }] }, 'anchor must be a non-empty string'],
    [{ uiSlots: [{ anchor: 'composer.above', label: 'X' }] }, 'id must be a non-empty string'],
    [{ uiSlots: [{ anchor: 'composer.above', id: 'x' }] }, 'label must be a non-empty string'],
    [{ uiSlots: [{ anchor: 'composer.above', id: 'x', label: 'X', lifetime: 42 }] }, 'lifetime must be a string'],
  ])('形状非法被拒: %j', (contributes, message) => {
    expect(validatePluginContributes(contributes)).toContain(message)
  })

  it('lifetime 合法值通过;未知的未来值也不拒载(闸门读 === persistent,天然降级)', () => {
    expect(validatePluginContributes({
      uiSlots: [{ anchor: 'message.footer', id: 'x', label: 'X', lifetime: 'persistent' }],
    })).toBeNull()
    expect(validatePluginContributes({
      uiSlots: [{ anchor: 'message.footer', id: 'x', label: 'X', lifetime: 'ephemeral' }],
    })).toBeNull()
    expect(validatePluginContributes({
      uiSlots: [{ anchor: 'message.footer', id: 'x', label: 'X', lifetime: 'synced' }],
    })).toBeNull()
  })
})

// ── 注册纪律 ─────────────────────────────────

describe('registerUiSlot', () => {
  it('声明匹配的块注册成功,render 经通道可拉取且 ctx 带 anchor/sessionId', async () => {
    let seenCtx: CorePluginUiSlotContext | null = null
    const def = definition('plan-status', api => {
      api.registerUiSlot({
        anchor: 'composer.above',
        id: 'plan-status',
        render(ctx) {
          seenCtx = ctx
          return simpleTree('steps 3/5')
        },
      })
    }, [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }])

    const { manager, failures } = createManager([def])
    await boot(manager)

    const result = await manager.handleRequest({
      pluginId: 'plan-status',
      action: `${PLUGIN_UI_RENDER_ACTION}:composer.above:plan-status`,
      payload: { sessionId: 'session-1' },
    })
    expect(result.success).toBe(true)
    expect((result as any).result.body.type).toBe('row')
    expect(failures).toEqual([])
    expect(seenCtx).not.toBeNull()
    expect(seenCtx!.anchor).toBe('composer.above')
    expect(seenCtx!.sessionId).toBe('session-1')
  })

  it('消息级锚点:render payload 带 messageId 时 ctx.messageId 随之过线', async () => {
    let seenCtx: CorePluginUiSlotContext | null = null
    const def = definition('tps-meter', api => {
      api.registerUiSlot({
        anchor: 'message.footer',
        id: 'tps-meter',
        render(ctx) {
          seenCtx = ctx
          return simpleTree('42 tok/s')
        },
      })
    }, [{ anchor: 'message.footer', id: 'tps-meter', label: 'TPS' }])

    const { manager, failures } = createManager([def])
    await boot(manager)

    const result = await manager.handleRequest({
      pluginId: 'tps-meter',
      action: `${PLUGIN_UI_RENDER_ACTION}:message.footer:tps-meter`,
      payload: { sessionId: 'session-1', messageId: 'msg-42' },
    })
    expect(result.success).toBe(true)
    expect(failures).toEqual([])
    expect(seenCtx).not.toBeNull()
    expect(seenCtx!.anchor).toBe('message.footer')
    expect(seenCtx!.sessionId).toBe('session-1')
    expect(seenCtx!.messageId).toBe('msg-42')
  })

  it('render payload 不带 messageId 时 ctx.messageId 缺席(会话级锚点不变)', async () => {
    let seenCtx: CorePluginUiSlotContext | null = null
    const def = definition('tps-meter', api => {
      api.registerUiSlot({
        anchor: 'message.footer',
        id: 'tps-meter',
        render(ctx) {
          seenCtx = ctx
          return simpleTree('x')
        },
      })
    }, [{ anchor: 'message.footer', id: 'tps-meter', label: 'TPS' }])

    const { manager } = createManager([def])
    await boot(manager)

    await manager.handleRequest({
      pluginId: 'tps-meter',
      action: `${PLUGIN_UI_RENDER_ACTION}:message.footer:tps-meter`,
      payload: { sessionId: 'session-1' },
    })
    expect(seenCtx!.messageId).toBeUndefined()
  })

  it('render payload 不带 sessionId 时 ctx.sessionId 为 null(全局块)', async () => {
    let seenCtx: CorePluginUiSlotContext | null = null
    const def = definition('plan-status', api => {
      api.registerUiSlot({
        anchor: 'composer.above',
        id: 'plan-status',
        render(ctx) {
          seenCtx = ctx
          return simpleTree('idle')
        },
      })
    }, [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }])

    const { manager } = createManager([def])
    await boot(manager)
    await manager.handleRequest({
      pluginId: 'plan-status',
      action: `${PLUGIN_UI_RENDER_ACTION}:composer.above:plan-status`,
    })
    expect(seenCtx!.sessionId).toBeNull()
  })

  it('ctx.refresh() 走 panel-refresh 通知轨,panelId 带 ui: 前缀的 surface id', async () => {
    const def = definition('plan-status', api => {
      api.registerUiSlot({
        anchor: 'composer.above',
        id: 'plan-status',
        render: () => simpleTree('x'),
        onAction(_input, ctx) {
          ctx.refresh()
          return { refresh: false }
        },
      })
    }, [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }])

    const { manager, refreshes } = createManager([def])
    await boot(manager)
    await manager.handleRequest({
      pluginId: 'plan-status',
      action: `${PLUGIN_UI_INVOKE_ACTION}:composer.above:plan-status`,
      payload: { actionId: 'poke' },
    })
    expect(refreshes).toEqual([{
      pluginId: 'plan-status',
      panelId: uiSlotSurfaceId('composer.above', 'plan-status'),
    }])
  })

  it('未声明的 id 被拒且计 registration 熔断', async () => {
    const def = definition('plan-status', api => {
      api.registerUiSlot({
        anchor: 'composer.above',
        id: 'not-declared',
        render: () => simpleTree('x'),
      })
    }, [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }])

    const { manager, errors, failures } = createManager([def])
    await boot(manager)
    expect(errors.some(message => message.includes('does not match'))).toBe(true)
    expect(failures).toEqual([{ pluginId: 'plan-status', scope: pluginScope.registration('UiSlot') }])
    await expect(manager.handleRequest({
      pluginId: 'plan-status',
      action: `${PLUGIN_UI_RENDER_ACTION}:composer.above:not-declared`,
    })).resolves.toMatchObject({ success: false })
  })

  it('未知锚点在注册期是代码错误(与 manifest 层的降级不同)', async () => {
    const def = definition('plan-status', api => {
      api.registerUiSlot({
        anchor: 'composer.below',
        id: 'plan-status',
        render: () => simpleTree('x'),
      })
    }, [{ anchor: 'composer.below', id: 'plan-status', label: 'Plan' }])

    const { manager, errors, failures } = createManager([def])
    await boot(manager)
    expect(errors.some(message => message.includes('unknown anchor'))).toBe(true)
    expect(failures).toEqual([{ pluginId: 'plan-status', scope: pluginScope.registration('UiSlot') }])
  })

  it('重复注册被拒且计熔断', async () => {
    const def = definition('plan-status', api => {
      const registration = {
        anchor: 'composer.above',
        id: 'plan-status',
        render: () => simpleTree('x'),
      }
      api.registerUiSlot(registration)
      api.registerUiSlot(registration)
    }, [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }])

    const { manager, errors, failures } = createManager([def])
    await boot(manager)
    expect(errors.some(message => message.includes('already registered'))).toBe(true)
    expect(failures).toEqual([{ pluginId: 'plan-status', scope: pluginScope.registration('UiSlot') }])
  })

  it('插件直接抢占 ui: 前缀的 handler 被拒', async () => {
    const def = definition('plan-status', api => {
      api.registerRequestHandler(`${PLUGIN_UI_RENDER_ACTION}:composer.above:plan-status`, () => simpleTree('fake'))
    }, [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }])

    const { manager, errors, failures } = createManager([def])
    await boot(manager)
    expect(errors.some(message => message.includes('namespace'))).toBe(true)
    expect(failures).toEqual([{ pluginId: 'plan-status', scope: pluginScope.registration('RequestHandler') }])
  })
})

// ── 通道守卫:同一套描述树校验 ────────────────────

describe('ui: channel guard', () => {
  it('ui:render 返回带函数成员的树被通道当场拒绝', async () => {
    const def = definition('plan-status', api => {
      api.registerUiSlot({
        anchor: 'composer.above',
        id: 'plan-status',
        render: () => ({
          version: PLUGIN_PANEL_PROTOCOL_VERSION,
          body: { type: 'row', children: [{ type: 'button', label: 'x', actionId: 'a', onClick: () => {} }] },
        } as unknown as PluginPanelTree),
      })
    }, [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }])

    const { manager } = createManager([def])
    await boot(manager)
    const result = await manager.handleRequest({
      pluginId: 'plan-status',
      action: `${PLUGIN_UI_RENDER_ACTION}:composer.above:plan-status`,
    })
    expect(result.success).toBe(false)
    // 序列化浅校验先于形状校验命中 —— 两道口都在通道上,拒绝即达标。
    expect((result as any).error).toContain('onClick is a function')
  })
})

// ── 熔断归族与 surface 折叠 ──────────────────────

describe('ui: scope classification & surface folding', () => {
  it('request:ui:* 归入 ui-request 家族(用户主动触发,降级不连坐)', () => {
    expect(classifyPluginScope(pluginScope.uiSlotRender('composer.above:plan-status'))).toBe('ui-request')
    expect(classifyPluginScope(pluginScope.uiSlotAction('composer.above:plan-status'))).toBe('ui-request')
  })

  it('同一块的 render 与 action 折叠为同一个 surface', () => {
    const renderScope = pluginScope.uiSlotRender('composer.above:plan-status')
    const actionScope = pluginScope.uiSlotAction('composer.above:plan-status')
    expect(describePluginSurface(renderScope)).toBe('ui:composer.above:plan-status')
    expect(describePluginSurface(actionScope)).toBe('ui:composer.above:plan-status')
  })

  it('降级闸按折叠后的 surface 短路:render 与 action 同生共死', async () => {
    const degraded = new Set<string>(['ui:composer.above:plan-status'])
    let renderCalls = 0
    let actionCalls = 0
    const def = definition('plan-status', api => {
      api.registerUiSlot({
        anchor: 'composer.above',
        id: 'plan-status',
        render: () => {
          renderCalls += 1
          return simpleTree('x')
        },
        onAction: () => {
          actionCalls += 1
          return { refresh: false }
        },
      })
    }, [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan' }])

    const { manager } = createManager([def], {
      isSurfaceDegraded: (pluginId, surface) => degraded.has(surface),
      describeDegradedSurface: () => 'too many failures',
    })
    await boot(manager)

    const render = await manager.handleRequest({
      pluginId: 'plan-status',
      action: `${PLUGIN_UI_RENDER_ACTION}:composer.above:plan-status`,
    })
    const action = await manager.handleRequest({
      pluginId: 'plan-status',
      action: `${PLUGIN_UI_INVOKE_ACTION}:composer.above:plan-status`,
      payload: { actionId: 'poke' },
    })
    expect(render).toMatchObject({ success: false, degraded: true, surface: 'ui:composer.above:plan-status' })
    expect(action).toMatchObject({ success: false, degraded: true, surface: 'ui:composer.above:plan-status' })
    // 短路在进插件之前 —— 降级不是"少罚一点",是这块界面不再被调用。
    expect(renderCalls).toBe(0)
    expect(actionCalls).toBe(0)

    // bypassDegraded 是显式"再试一次"的逃生口,与面板同规。
    const retry = await manager.handleRequest({
      pluginId: 'plan-status',
      action: `${PLUGIN_UI_RENDER_ACTION}:composer.above:plan-status`,
      bypassDegraded: true,
    })
    expect(retry.success).toBe(true)
    expect(renderCalls).toBe(1)
  })
})

// ── 清单投影:unsupported 标记 ─────────────────────

describe('renderer projection', () => {
  it('未知锚点的块在投影里标记 unsupported,认识的锚点不标', () => {
    const [plugin] = projectOnethingPluginsForRenderer([{
      definition: {
        id: 'plan-status',
        source: 'user',
        enabled: true,
        dirPath: '/plugins/plan-status',
        manifest: {
          name: 'plan-status',
          version: '1.0.0',
          contributes: {
            uiSlots: [
              { anchor: 'composer.above', id: 'a', label: 'A' },
              { anchor: 'composer.below', id: 'b', label: 'B' },
            ],
          },
        },
      },
      loaded: true,
      commands: [],
    }])
    expect(plugin.contributes.uiSlots).toEqual([
      { anchor: 'composer.above', id: 'a', label: 'A', unsupported: false, lifetime: '' },
      { anchor: 'composer.below', id: 'b', label: 'B', unsupported: true, lifetime: '' },
    ])
  })

  it('lifetime 原样流出(不归一成布尔)—— 装前确认页据此披露持久内容', () => {
    const [plugin] = projectOnethingPluginsForRenderer([{
      definition: {
        id: 'tps-meter',
        source: 'user',
        enabled: true,
        dirPath: '/plugins/tps-meter',
        manifest: {
          name: 'tps-meter',
          version: '1.0.2',
          contributes: {
            uiSlots: [
              { anchor: 'message.footer', id: 'tps', label: 'TPS', lifetime: 'persistent' },
              { anchor: 'composer.above', id: 'hint', label: 'Hint', lifetime: 'ephemeral' },
              { anchor: 'composer.above', id: 'future', label: 'F', lifetime: 'synced' },
            ],
          },
        },
      },
      loaded: true,
      commands: [],
    }])
    expect(plugin.contributes.uiSlots.map(slot => slot.lifetime))
      .toEqual(['persistent', 'ephemeral', 'synced'])
  })
})
