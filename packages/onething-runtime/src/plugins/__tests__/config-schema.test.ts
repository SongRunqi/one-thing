/**
 * R3 验收(产品层部分):JSON Schema 子集归约与取值归一化。
 *
 * **支持的子集 = 设置 UI 能渲染的控件集** —— 这两件事必须是同一份清单:
 * 能校验但渲染不出来 = 用户改不了;能渲染但校验不了 = 脏值进盘。
 */
import { describe, expect, it } from 'vitest'
import {
  coercePluginConfig,
  describePluginConfigSchema,
} from '../config-schema.js'
import {
  ONETHING_LOG_MONITOR_MANIFEST,
  resolveOnethingLogMonitorConfig,
} from '../log-monitor.js'

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

describe('R3 schema subset — the supported set is the renderable set', () => {
  it('reduces every supported type to a control', () => {
    const described = describePluginConfigSchema(DEMO_SCHEMA, { title: 'Demo' })
    expect(described.supported).toBe(true)
    if (!described.supported) return

    expect(described.fields.map(field => [field.key, field.control])).toEqual([
      ['enabled', 'switch'],
      ['label', 'text'],
      ['retention', 'number'],
      ['mode', 'select'],
      ['tags', 'string-list'],
    ])
    expect(described.fields[1]).toMatchObject({ label: 'Label', required: true })
    expect(described.fields[2]).toMatchObject({ integer: true, minimum: 1, maximum: 30 })
    expect(described.fields[3]).toMatchObject({ options: ['fast', 'slow'], defaultValue: 'fast' })
  })

  it('derives a humane label when neither ui nor title says otherwise', () => {
    const described = describePluginConfigSchema({
      type: 'object',
      properties: { flushIntervalMs: { type: 'integer', default: 1 } },
    })
    expect(described.supported && described.fields[0].label).toBe('Flush Interval Ms')
  })

  it('honors ui hints over schema-derived presentation', () => {
    const described = describePluginConfigSchema(DEMO_SCHEMA, {
      ui: { label: { label: 'Display name', hint: 'shown in the header' } },
    })
    expect(described.supported && described.fields[1]).toMatchObject({
      label: 'Display name',
      hint: 'shown in the header',
    })
  })

  it('reports every reason at once when the schema leaves the subset', () => {
    const described = describePluginConfigSchema({
      type: 'object',
      properties: {
        nested: { type: 'object' },
        mixed: { enum: ['a', 2] },
        numbers: { type: 'array', items: { type: 'number' } },
      },
    })
    expect(described.supported).toBe(false)
    if (described.supported) return
    expect(described.reasons).toHaveLength(3)
    expect(described.reasons.join(' ')).toContain('unsupported type "object"')
    expect(described.reasons.join(' ')).toContain('only string enums')
    expect(described.reasons.join(' ')).toContain('arrays of strings')
  })

  it('rejects a top-level schema that is not an object', () => {
    expect(describePluginConfigSchema({ type: 'array' }).supported).toBe(false)
    expect(describePluginConfigSchema('nope').supported).toBe(false)
  })
})

describe('R3 coercion — defaults in, junk out', () => {
  const described = describePluginConfigSchema(DEMO_SCHEMA)
  const fields = described.supported ? described.fields : []

  it('fills defaults for missing keys', () => {
    expect(coercePluginConfig(fields, {}).config).toEqual({
      enabled: true,
      label: 'hi',
      retention: 7,
      mode: 'fast',
      tags: [],
    })
  })

  it('falls back to the default for stored junk and says so', () => {
    const result = coercePluginConfig(fields, { retention: 'seven', mode: 'sideways' })
    expect(result.config.retention).toBe(7)
    expect(result.config.mode).toBe('fast')
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings[0]).toContain('falling back to the default')
  })

  it('enforces the numeric bounds and integer-ness declared by the schema', () => {
    expect(coercePluginConfig(fields, { retention: 0 }).errors[0]).toContain('>= 1')
    expect(coercePluginConfig(fields, { retention: 99 }).errors[0]).toContain('<= 30')
    expect(coercePluginConfig(fields, { retention: 1.5 }).errors[0]).toContain('integer')
  })

  it('strips keys the schema never declared', () => {
    const result = coercePluginConfig(fields, { label: 'x', legacyKey: 'gone' })
    expect(result.strippedKeys).toEqual(['legacyKey'])
    expect(result.config).not.toHaveProperty('legacyKey')
  })
})

describe('R3 acceptance — log-monitor moved a hardcoded constant into schema', () => {
  it('declares the constants as manifest settings, not code', () => {
    const schema = ONETHING_LOG_MONITOR_MANIFEST.contributes?.settings?.schema
    expect(schema).toBeTruthy()
    const described = describePluginConfigSchema(schema, {})
    expect(described.supported).toBe(true)
    if (!described.supported) return
    expect(described.fields.map(field => field.key)).toEqual([
      'retentionDays',
      'flushIntervalMs',
      'notifyOnErrors',
    ])
    // 设置页据此自动出现三个控件 —— 没有一行专门为 log-monitor 写的 UI 代码。
    expect(described.fields.map(field => field.control)).toEqual(['number', 'number', 'switch'])
  })

  it('resolves an effective config that keeps the old constants as defaults', () => {
    expect(resolveOnethingLogMonitorConfig(undefined)).toEqual({
      retentionDays: 7,
      flushIntervalMs: 1000,
      notifyOnErrors: true,
    })
    expect(resolveOnethingLogMonitorConfig({ retentionDays: 2 })).toMatchObject({
      retentionDays: 2,
      flushIntervalMs: 1000,
    })
  })
})
