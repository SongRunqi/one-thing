/**
 * R3 验收(装配层部分):配置存储、写入校验、onChange 软隔离。
 *
 * 裁决要点在这里被钉住:schema 的唯一事实源是 manifest,存储与校验全在宿主 ——
 * 于是**未启用的插件也能配**,整条路径不执行一行插件代码。
 *
 * 纯 schema 归约与取值归一化的用例住在产品层
 * (packages/onething-runtime/src/plugins/__tests__/config-schema.test.ts):
 * 装配层的测试不许伸手进产品层(守卫:plugin logic stays out of the host assembly tree)。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  configurePluginConfigHost,
  describePluginConfig,
  getEffectivePluginConfig,
  notifyPluginConfigChange,
  resetPluginConfigListenersForTests,
  setPluginConfig,
  subscribePluginConfigChange,
} from '../config.js'
import { createPluginConfigAccess } from '../config-access.js'
import {
  configurePluginHealthHost,
  getPluginRuntimeHealth,
  resetPluginRuntimeHealthForTests,
} from '../health.js'

const DEMO_SCHEMA = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean', default: true },
    label: { type: 'string', default: 'hi', title: 'Label' },
    retention: { type: 'integer', default: 7, minimum: 1, maximum: 30 },
    mode: { enum: ['fast', 'slow'], default: 'fast' },
    tags: { type: 'array', items: { type: 'string' }, default: [] },
  },
  required: ['label'],
}

function installHost(options: {
  schema?: Record<string, unknown> | undefined
  ui?: Record<string, { label?: string; hint?: string; control?: string }>
  stored?: Record<string, unknown>
} = {}) {
  const disk: Record<string, Record<string, unknown>> = {
    demo: options.stored ?? {},
  }
  configurePluginConfigHost({
    getSettingsContribution: pluginId => (pluginId === 'demo'
      ? { title: 'Demo', schema: options.schema ?? DEMO_SCHEMA, ui: options.ui }
      : undefined),
    readConfig: pluginId => disk[pluginId] ?? {},
    writeConfig: (pluginId, config) => {
      if (config) disk[pluginId] = config
      else delete disk[pluginId]
    },
  })
  return disk
}

describe('R3 store — the host owns storage, not the plugin', () => {
  it('reads an effective config for a plugin that was never loaded', () => {
    installHost({ stored: { label: 'stored' } })
    // 关键红利:没有任何插件代码跑过,配置照样有效 —— 未启用的插件也能配。
    expect(getEffectivePluginConfig('demo')).toEqual({
      enabled: true,
      label: 'stored',
      retention: 7,
      mode: 'fast',
      tags: [],
    })
  })

  it('warns once about stored junk instead of failing the read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installHost({ stored: { retention: 'seven' } })
    try {
      expect(getEffectivePluginConfig('demo').retention).toBe(7)
      expect(getEffectivePluginConfig('demo').retention).toBe(7)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('persists a validated config and strips unknown keys on write', () => {
    const disk = installHost()
    const result = setPluginConfig('demo', { label: 'saved', retention: 3, legacyKey: 'gone' })
    expect(result.success).toBe(true)
    expect(disk.demo).toEqual({
      enabled: true,
      label: 'saved',
      retention: 3,
      mode: 'fast',
      tags: [],
    })
    expect(disk.demo).not.toHaveProperty('legacyKey')
  })

  it('refuses an invalid write and leaves the stored value alone', () => {
    const disk = installHost({ stored: { retention: 5 } })
    const result = setPluginConfig('demo', { retention: 999 })
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('<= 30')
    expect(disk.demo).toEqual({ retention: 5 })
  })

  it('refuses to write for a plugin with an unsupported schema, with the reasons', () => {
    installHost({ schema: { type: 'object', properties: { nested: { type: 'object' } } } })
    const result = setPluginConfig('demo', { nested: {} })
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('unsupported type "object"')
    // 但读取路径不崩:schema 不受支持就原样返回盘上的东西。
    expect(() => getEffectivePluginConfig('demo')).not.toThrow()
  })

  it('describes an undeclared plugin as "no schema" rather than erroring', () => {
    installHost()
    expect(describePluginConfig('nobody')).toBeNull()
    expect(createPluginConfigAccess().describe('nobody')).toMatchObject({
      declared: false,
      supported: false,
    })
  })
})

describe('R3 onChange — plugin code, therefore soft-isolated', () => {
  it('pushes a frozen snapshot to subscribers after a save', async () => {
    installHost()
    resetPluginConfigListenersForTests()
    const seen: Array<Record<string, unknown>> = []
    subscribePluginConfigChange('demo', config => {
      seen.push(config)
    })

    setPluginConfig('demo', { label: 'pushed' })
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]).toMatchObject({ label: 'pushed' })
    expect(Object.isFrozen(seen[0])).toBe(true)
  })

  it('does not let a hanging onChange block the save itself', async () => {
    const disk = installHost()
    resetPluginConfigListenersForTests()
    resetPluginRuntimeHealthForTests()
    configurePluginHealthHost({ disablePlugin: () => {}, notify: () => {} })
    subscribePluginConfigChange('demo', () => new Promise(() => {}) as unknown as void)

    // 保存是同步返回的:通知在它之后,挂起的回调影响不到已经通过校验的写入。
    const result = setPluginConfig('demo', { label: 'saved anyway' })
    expect(result.success).toBe(true)
    expect(disk.demo.label).toBe('saved anyway')

    configurePluginHealthHost(null)
  })

  it('books a failing onChange into the R1 breaker ledger', async () => {
    installHost()
    resetPluginConfigListenersForTests()
    resetPluginRuntimeHealthForTests()
    configurePluginHealthHost({ disablePlugin: () => {}, notify: () => {} })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      subscribePluginConfigChange('demo', () => {
        throw new Error('onChange exploded')
      })
      await notifyPluginConfigChange('demo', { label: 'x' })

      expect(getPluginRuntimeHealth('demo')).toMatchObject({
        status: 'degraded',
        lastErrorScope: 'settings:onChange',
        lastError: 'onChange exploded',
      })
    } finally {
      error.mockRestore()
      configurePluginHealthHost(null)
      resetPluginRuntimeHealthForTests()
    }
  })

  it('stops pushing after unsubscribe', async () => {
    installHost()
    resetPluginConfigListenersForTests()
    let calls = 0
    const unsubscribe = subscribePluginConfigChange('demo', () => {
      calls += 1
    })
    await notifyPluginConfigChange('demo', {})
    unsubscribe()
    await notifyPluginConfigChange('demo', {})
    expect(calls).toBe(1)
  })
})

