/**
 * R7 验收:两张策略表。
 *
 * 它们治的是同一个病 —— **判据撒在各个上报点上就必然漂移**。这条战役里同一个
 * 病出现过四次(熔断计数的粒度、transient 的两类、终止事件名单、白名单的补集),
 * 每次的修法都是同一句话:收进一张表,并让"漏登记"在编译期或测试里变红。
 *
 * 所以这里的断言分两层:
 *  - **行为层**:面板连败降级面板、promptContext 连败禁用插件;
 *  - **完备层**:代码里真实出现过的每一个 scope 都必须能归到某个家族,
 *    每个开放的注册表都必须在拆除语义表里有条目。第二层才是防漂移的那一半。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CorePluginHealthTracker,
  PLUGIN_DEFERRED_REGISTRIES,
  PLUGIN_OPEN_REGISTRIES,
  PLUGIN_REGISTRY_POLICY,
  PLUGIN_SCOPE_FAMILIES,
  PLUGIN_SEVERITY_TABLE,
  classifyPluginScope,
  describePluginSurface,
  resolvePluginScopeSeverity,
} from '@onething/core/plugins'

const REPO_ROOT = fileURLToPath(new URL('../../../../../..', import.meta.url))

describe('R7 severity table — 罚则来自表,不在上报点上判', () => {
  it('degrades the panel and leaves the plugin alone after repeated UI failures', () => {
    const tripped: string[] = []
    const degraded: Array<{ pluginId: string; surface: string }> = []
    const tracker = new CorePluginHealthTracker({
      onTrip: pluginId => tripped.push(pluginId),
      onDegradeSurface: (pluginId, surface) => degraded.push({ pluginId, surface }),
    })

    // 面板动作连败 3 次。
    for (let i = 0; i < 3; i += 1) {
      tracker.recordFailure('notes', 'request:panel:action:inbox', new Error('boom'))
    }

    // **插件没有被禁用** —— 它的工具/命令/提示词/定时任务照常。
    expect(tripped).toEqual([])
    expect(tracker.get('notes')?.status).not.toBe('disabled')
    // 只有那一个面板被标记。
    expect(degraded).toEqual([{ pluginId: 'notes', surface: 'panel:inbox' }])
    expect(tracker.isSurfaceDegraded('notes', 'panel:inbox')).toBe(true)
    // 同一个插件的另一个面板不受连坐。
    expect(tracker.isSurfaceDegraded('notes', 'panel:archive')).toBe(false)
  })

  it('still disables the whole plugin when a per-turn hook keeps failing', () => {
    const tripped: string[] = []
    const tracker = new CorePluginHealthTracker({ onTrip: pluginId => tripped.push(pluginId) })

    for (let i = 0; i < 3; i += 1) {
      tracker.recordFailure('notes', 'promptContext:notes', new Error('hung'))
    }

    // 既有行为不变:每轮都跑的东西坏了会拖垮全应用,禁用是较小的伤害。
    expect(tripped).toEqual(['notes'])
    expect(tracker.get('notes')?.status).toBe('disabled')
  })

  it('brings a degraded surface back on the first success — the user pressed Retry', () => {
    const degraded: string[] = []
    const tracker = new CorePluginHealthTracker({ onDegradeSurface: (_id, surface) => degraded.push(surface) })

    for (let i = 0; i < 3; i += 1) tracker.recordFailure('notes', 'request:panel:render:inbox', new Error('boom'))
    expect(tracker.isSurfaceDegraded('notes', 'panel:inbox')).toBe(true)

    tracker.recordSuccess('notes', 'request:panel:render:inbox')
    expect(tracker.isSurfaceDegraded('notes', 'panel:inbox')).toBe(false)
    expect(tracker.get('notes')?.degradedSurfaces).toBeUndefined()
  })

  it('fires the degrade callback once, not on every subsequent failure', () => {
    const degraded: string[] = []
    const tracker = new CorePluginHealthTracker({ onDegradeSurface: (_id, surface) => degraded.push(surface) })
    for (let i = 0; i < 8; i += 1) tracker.recordFailure('notes', 'request:panel:action:inbox', new Error('boom'))
    expect(degraded).toEqual(['panel:inbox'])
  })

  it('treats a registration violation as a code error — threshold 1, no retry budget', () => {
    const tripped: string[] = []
    const tracker = new CorePluginHealthTracker({ onTrip: pluginId => tripped.push(pluginId) })
    // 未声明的面板 id / 抢占保留命名空间不是运行期抖动,重试没有意义。
    tracker.recordFailure('notes', 'registerWorkspacePanel', new Error('undeclared panel'))
    expect(tripped).toEqual(['notes'])
  })

  it('degrades a connector without taking the plugin down with it', () => {
    const tripped: string[] = []
    const degraded: string[] = []
    const tracker = new CorePluginHealthTracker({
      onTrip: id => tripped.push(id),
      onDegradeSurface: (_id, surface) => degraded.push(surface),
    })
    for (let i = 0; i < 3; i += 1) tracker.recordFailure('wechat', 'connector', new Error('socket closed'))
    // 一条渠道坏掉不该放大成插件故障。
    expect(tripped).toEqual([])
    expect(degraded).toEqual(['connector'])
  })

  it('maps panel scopes to a surface a user can recognise', () => {
    expect(describePluginSurface('request:panel:render:logs')).toBe('panel:logs')
    expect(describePluginSurface('request:panel:action:logs')).toBe('panel:logs')
    expect(describePluginSurface('request:search')).toBe('request:search')
  })

  it('classifies panel requests before plain requests — order matters', () => {
    expect(classifyPluginScope('request:panel:render:x')).toBe('ui-request')
    expect(classifyPluginScope('request:search')).toBe('plugin-request')
  })

  it('gives every declared family a rule and a stated rationale', () => {
    for (const family of PLUGIN_SCOPE_FAMILIES) {
      const rule = PLUGIN_SEVERITY_TABLE[family]
      expect(rule, family).toBeTruthy()
      expect(rule.threshold, family).toBeGreaterThan(0)
      // 理由是给下一个人看的:改罚则之前先读懂为什么是这个罚则。
      expect(rule.rationale.length, family).toBeGreaterThan(20)
    }
  })

  it('classifies every scope string the codebase actually reports', () => {
    // **这才是防漂移的那一半。** 表本身的完备性由 Record<联合,规则> 在 typecheck
    // 保证;而"有没有一个真实 scope 谁也不认识"只能反查源码。
    // 新增一种 scope 却忘了归类,这条会红。
    const sources = [
      'packages/core/plugins/api-builder.ts',
      'packages/core/plugins/manager.ts',
      'packages/onething-runtime/src/app/plugins/api.ts',
      'packages/onething-runtime/src/app/plugins/config.ts',
      'packages/onething-runtime/src/app/plugins/lifecycle.ts',
    ]
    const literals = new Set<string>()
    for (const relative of sources) {
      const text = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf-8')
      // reportFailure('x') / reportPluginRuntimeFailure(id, 'x') / scope = `x:${…}`
      for (const match of text.matchAll(/report(?:Plugin)?(?:Runtime)?Failure\([^,)]*,?\s*['"`]([A-Za-z][A-Za-z0-9:._-]*)/g)) {
        literals.add(match[1])
      }
      for (const match of text.matchAll(/(?:const scope|scope:)\s*=?\s*[`'"]([A-Za-z][A-Za-z0-9:._-]*)/g)) {
        literals.add(match[1])
      }
    }
    // 兜住模板形态的 scope(它们在源码里带 ${},正则截到的是前缀)。
    for (const known of ['promptContext', 'beforeContextCompact', 'afterAssistantResponse', 'entry', 'install', 'connector']) {
      literals.add(known)
    }

    expect(literals.size).toBeGreaterThan(5)
    const unclassified = [...literals].filter(scope => classifyPluginScope(scope) === null)
    expect(unclassified, `these scopes are not in any family: ${unclassified.join(', ')}`).toEqual([])
  })

  it('falls back to the safest remedy for a scope nobody registered', () => {
    // 未登记 = 按既有行为整体禁用。宁可过严也不要静默放行一个没人想过的失败面。
    const resolved = resolvePluginScopeSeverity('something-nobody-declared')
    expect(resolved.family).toBeNull()
    expect(resolved.remedy).toBe('disable-plugin')
  })
})

describe('R7 registry teardown table — 每个开放的注册表都要回答"在飞的怎么办"', () => {
  it('declares a teardown policy for every open registry', () => {
    expect([...PLUGIN_OPEN_REGISTRIES]).toEqual(['im-connector'])
    for (const registry of PLUGIN_OPEN_REGISTRIES) {
      const policy = PLUGIN_REGISTRY_POLICY[registry]
      expect(policy, registry).toBeTruthy()
      expect(['reject-disable', 'degrade-to-default', 'fail-open']).toContain(policy.teardown)
      // "停用时正在用它的东西怎么办"必须被真的回答,不能留空。
      expect(policy.inFlight.length, registry).toBeGreaterThan(20)
      // 只在跑插件的宿主生效造成的分叉也要写明(§6 方案 A)。
      expect(policy.hostDivergence.length, registry).toBeGreaterThan(20)
    }
  })

  it('keeps the deferred registries documented with reasons, not just omitted', () => {
    // 纪律:一次只开一个。**不开**的那些要把理由留在代码里,否则下一个人会从零
    // 重新论证一遍,并且很可能论证成"看起来没问题"。
    for (const key of ['ai-provider', 'variable-provider', 'permission-capability']) {
      expect(PLUGIN_DEFERRED_REGISTRIES[key], key).toBeTruthy()
      expect(PLUGIN_DEFERRED_REGISTRIES[key].length, key).toBeGreaterThan(30)
    }
    // 开放与推迟不能同时成立。
    for (const registry of PLUGIN_OPEN_REGISTRIES) {
      expect(PLUGIN_DEFERRED_REGISTRIES[registry]).toBeUndefined()
    }
  })
})
