/**
 * B 期验收(L2):`contributes.theme` 主题 token 覆盖。
 *
 * 钉住的东西:
 *  1. **安全面** —— 覆盖值只放行颜色字面量;`url(` / `var(` / `;` / `}` /
 *     `expression(` / 空串 / 超长串逐条反例,以及非字符串值。
 *  2. **降级不拒载** —— 键不在主题 token 表、值不过白名单,只丢该条目并在
 *     清单投影里标记(与未知锚点同规);形状错(不是对象/条目超上限)才是
 *     加载期错误。
 *  3. **冲突顺序确定性** —— 多插件覆盖同一 token 按全局规范顺序后者胜,
 *     输入顺序不影响结果。
 *  4. **拆除双面** —— 停用/卸载后覆盖从合成表里消失,`:root` 回到主题原值。
 *  5. **主题切换保留覆盖** —— 覆盖叠在"当前主题产出"之上,换一张产出照样叠。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  PLUGIN_THEME_COLOR_MAX_LENGTH,
  PLUGIN_THEME_OVERRIDE_MAX_ENTRIES,
  comparePluginCanonicalOrder,
  isPluginThemeColorValue,
  sortByPluginCanonicalOrder,
  validatePluginContributes,
} from '@onething/core/plugins'
import {
  composeThemeVariablesWithPluginOverrides,
  isPluginThemeOverrideToken,
  resolvePluginThemeOverrides,
} from '../../../plugins/theme-overrides.js'
import { projectOnethingPluginsForRenderer } from '../../../plugins/plugin-list.js'
import { CSS_VAR_MAP } from '../../../themes/css-mapper.js'

/**
 * 装配层只从插件管理器的**内存清单**读声明,所以这里把管理器换成一个假的
 * 就能验完整条宿主链路(收集 → 裁决 → 叠在主题产出上)。
 */
const managedPlugins: Array<{ definition: { id: string; enabled: boolean; manifest: unknown } }> = []
vi.mock('../manager.js', () => ({
  getPluginManager: () => (managedPlugins.length ? { getPlugins: () => managedPlugins } : null),
}))
const { applyPluginThemeOverrides } = await import('../theme-overrides.js')

// ── 1. 颜色字面量白名单(安全面) ─────────────────

describe('plugin theme override color whitelist', () => {
  it('放行颜色字面量的全部合法写法', () => {
    for (const value of [
      '#fff', '#FFFF', '#0a0a0a', '#0A0A0AFF',
      'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'rgb(1 2 3 / 50%)',
      'hsl(210, 40%, 50%)', 'hsla(210 40% 50% / 0.4)',
      'oklch(0.7 0.1 250)', 'oklab(0.7 -0.1 0.05)',
      'rebeccapurple', 'Transparent', 'red',
    ]) {
      expect(isPluginThemeColorValue(value), value).toBe(true)
    }
  })

  it('逐条反例:url( / var( / ; / } / expression( / 空串 / 超长 / 非字符串', () => {
    const rejected: unknown[] = [
      'url(https://tracker.example/pixel.png)',
      'rgb(1,2,3) url(https://tracker.example/p.png)',
      'var(--bg-app)',
      'rgb(var(--x))',
      '#fff; background: url(https://x)',
      '#fff}',
      'expression(alert(1))',
      'calc(1px)',
      '',
      '   ',
      '\n',
      'notacolorname',
      'javascript:alert(1)',
      '#ff',
      '#fffff',
      '"#fff"',
      'a'.repeat(PLUGIN_THEME_COLOR_MAX_LENGTH + 1),
      `rgb(${'1'.repeat(PLUGIN_THEME_COLOR_MAX_LENGTH)})`,
      null,
      undefined,
      42,
      { toString: () => '#fff' },
      ['#fff'],
    ]
    for (const value of rejected) {
      expect(isPluginThemeColorValue(value), String(value)).toBe(false)
    }
  })

  it('括号内不许再出现括号 —— 这一条就挡住了所有函数注入,不靠黑名单', () => {
    expect(isPluginThemeColorValue('rgb(1,2,3)')).toBe(true)
    expect(isPluginThemeColorValue('rgb(calc(1),2,3)')).toBe(false)
  })
})

// ── 2. manifest 形状校验:什么才算拒载 ───────────

describe('contributes.theme manifest shape', () => {
  it('合法声明通过;键/值的内容问题不在这里判(降级归投影层)', () => {
    expect(validatePluginContributes({ theme: { overrides: { primary: '#ff0000' } } })).toBeNull()
    // 未知 token / 非法颜色都**不是**加载期错误。
    expect(validatePluginContributes({ theme: { overrides: { nope: '#ff0000' } } })).toBeNull()
    expect(validatePluginContributes({ theme: { overrides: { primary: 'url(https://x)' } } })).toBeNull()
  })

  it('形状错才拒载:不是对象 / overrides 缺失 / 值不是字符串 / 条目超上限', () => {
    expect(validatePluginContributes({ theme: 'red' })).toContain('theme must be an object')
    expect(validatePluginContributes({ theme: {} })).toContain('theme.overrides must be an object')
    expect(validatePluginContributes({ theme: { overrides: [] } })).toContain('theme.overrides must be an object')
    expect(validatePluginContributes({ theme: { overrides: { primary: 1 } } }))
      .toContain('theme.overrides.primary must be a string')
    const tooMany = Object.fromEntries(
      Array.from({ length: PLUGIN_THEME_OVERRIDE_MAX_ENTRIES + 1 }, (_, i) => [`t${i}`, '#fff']),
    )
    expect(validatePluginContributes({ theme: { overrides: tooMany } }))
      .toContain(`must not exceed ${PLUGIN_THEME_OVERRIDE_MAX_ENTRIES} entries`)
    // 恰好卡在上限上是合法的。
    const exactly = Object.fromEntries(
      Array.from({ length: PLUGIN_THEME_OVERRIDE_MAX_ENTRIES }, (_, i) => [`t${i}`, '#fff']),
    )
    expect(validatePluginContributes({ theme: { overrides: exactly } })).toBeNull()
  })
})

// ── 3. 键白名单 = CSS_VAR_MAP,不另抄一份 ────────

describe('token whitelist', () => {
  it('白名单就是主题 token 表本身', () => {
    expect(isPluginThemeOverrideToken('primary')).toBe(true)
    expect(isPluginThemeOverrideToken('bg.app')).toBe(true)
    expect(isPluginThemeOverrideToken('definitely.not.a.token')).toBe(false)
    // 原型链上的东西不算 token(`toString` 之类)。
    expect(isPluginThemeOverrideToken('toString')).toBe(false)
    // 表里每一个键都必须被放行 —— 抄第二份表就会在这里崩。
    for (const token of Object.keys(CSS_VAR_MAP)) {
      expect(isPluginThemeOverrideToken(token), token).toBe(true)
    }
  })

  it('token 展开成 CSS 变量名用的是同一张表(别名要一起覆盖)', () => {
    const { cssVariables } = resolvePluginThemeOverrides([
      { pluginId: 'a', enabled: true, overrides: { primary: '#123456' } },
    ])
    for (const cssVar of CSS_VAR_MAP.primary) {
      expect(cssVariables[cssVar]).toBe('#123456')
    }
  })
})

// ── 4. 冲突裁决与顺序确定性 ──────────────────────

describe('override resolution', () => {
  it('多插件覆盖同一 token:全局规范顺序后者胜,被压的标 shadowed', () => {
    const resolution = resolvePluginThemeOverrides([
      { pluginId: 'zed', enabled: true, overrides: { primary: '#222222' } },
      { pluginId: 'alpha', enabled: true, overrides: { primary: '#111111' } },
    ])
    expect(resolution.cssVariables['--color-primary']).toBe('#222222')
    expect(resolution.byPlugin.get('alpha')).toEqual([
      { token: 'primary', value: '#111111', status: 'shadowed', shadowedBy: 'zed' },
    ])
    expect(resolution.byPlugin.get('zed')).toEqual([
      { token: 'primary', value: '#222222', status: 'active' },
    ])
  })

  it('顺序确定性:输入顺序不影响结果(目录发现序不得泄漏到语义里)', () => {
    const inputs = [
      { pluginId: 'b', enabled: true, overrides: { primary: '#bbbbbb' } },
      { pluginId: 'a', enabled: true, overrides: { primary: '#aaaaaa' } },
      { pluginId: 'c', enabled: true, overrides: { primary: '#cccccc' } },
    ]
    const forward = resolvePluginThemeOverrides(inputs).cssVariables
    const reversed = resolvePluginThemeOverrides([...inputs].reverse()).cssVariables
    expect(forward).toEqual(reversed)
    expect(forward['--color-primary']).toBe('#cccccc')
  })

  it('规范顺序的出处只有一个:pluginId 字典序,稳定排序保留声明顺序', () => {
    expect(comparePluginCanonicalOrder('a', 'b')).toBeLessThan(0)
    expect(comparePluginCanonicalOrder('b', 'a')).toBeGreaterThan(0)
    expect(comparePluginCanonicalOrder('a', 'a')).toBe(0)
    const sorted = sortByPluginCanonicalOrder(
      [{ id: 'b', n: 1 }, { id: 'a', n: 1 }, { id: 'a', n: 2 }],
      item => item.id,
    )
    expect(sorted.map(item => `${item.id}${item.n}`)).toEqual(['a1', 'a2', 'b1'])
  })

  it('非法条目丢弃并标记原因,合法的同插件条目照常生效', () => {
    const resolution = resolvePluginThemeOverrides([{
      pluginId: 'a',
      enabled: true,
      overrides: { primary: '#111111', 'not.a.token': '#222222', accent: 'url(https://x)' },
    }])
    expect(resolution.byPlugin.get('a')).toEqual([
      { token: 'primary', value: '#111111', status: 'active' },
      { token: 'not.a.token', value: '#222222', status: 'invalid', reason: 'unknown-token' },
      { token: 'accent', value: 'url(https://x)', status: 'invalid', reason: 'invalid-color' },
    ])
    expect(resolution.cssVariables['--color-primary']).toBe('#111111')
    expect(resolution.cssVariables['--accent']).toBeUndefined()
  })

  it('值前后空白被归一;声明照样可见', () => {
    const resolution = resolvePluginThemeOverrides([
      { pluginId: 'a', enabled: true, overrides: { primary: '  #abcdef  ' } },
    ])
    expect(resolution.cssVariables['--color-primary']).toBe('#abcdef')
  })
})

// ── 5. 拆除双面:停用即撤除 ──────────────────────

describe('teardown', () => {
  it('停用的插件不参与合成(声明仍可见,标 inactive)', () => {
    const resolution = resolvePluginThemeOverrides([
      { pluginId: 'a', enabled: false, overrides: { primary: '#111111' } },
    ])
    expect(resolution.cssVariables).toEqual({})
    expect(resolution.byPlugin.get('a')).toEqual([
      { token: 'primary', value: '#111111', status: 'inactive' },
    ])
  })

  it('停用不会改变别人的裁决:唯一覆盖者被关掉后,另一个插件从 shadowed 回到 active', () => {
    const enabled = resolvePluginThemeOverrides([
      { pluginId: 'a', enabled: true, overrides: { primary: '#aaaaaa' } },
      { pluginId: 'z', enabled: true, overrides: { primary: '#ffffff' } },
    ])
    expect(enabled.byPlugin.get('a')?.[0].status).toBe('shadowed')

    const zDisabled = resolvePluginThemeOverrides([
      { pluginId: 'a', enabled: true, overrides: { primary: '#aaaaaa' } },
      { pluginId: 'z', enabled: false, overrides: { primary: '#ffffff' } },
    ])
    expect(zDisabled.byPlugin.get('a')?.[0].status).toBe('active')
    expect(zDisabled.cssVariables['--color-primary']).toBe('#aaaaaa')
  })

  it('拆除快照:卸载(清单里没有了)后合成表回到主题原值', () => {
    const themeOutput = { '--color-primary': '#000000', '--bg-app': '#101010' }
    const withPlugin = composeThemeVariablesWithPluginOverrides(
      themeOutput,
      resolvePluginThemeOverrides([
        { pluginId: 'brand', enabled: true, overrides: { primary: '#ff0000' } },
      ]).cssVariables,
    )
    expect(withPlugin['--color-primary']).toBe('#ff0000')

    const afterUninstall = composeThemeVariablesWithPluginOverrides(
      themeOutput,
      resolvePluginThemeOverrides([]).cssVariables,
    )
    expect(afterUninstall).toEqual(themeOutput)
    // 合成不改主题产出本身(它会被复用)。
    expect(themeOutput['--color-primary']).toBe('#000000')
  })
})

// ── 6. 主题切换保留覆盖 ──────────────────────────

describe('theme switching', () => {
  it('覆盖叠在"当前主题产出"之上 —— 换主题照样叠,不需要记住任何状态', () => {
    const { cssVariables } = resolvePluginThemeOverrides([
      { pluginId: 'brand', enabled: true, overrides: { primary: '#ff0000' } },
    ])
    const dark = composeThemeVariablesWithPluginOverrides(
      { '--color-primary': '#111111', '--bg-app': '#000000' }, cssVariables)
    const light = composeThemeVariablesWithPluginOverrides(
      { '--color-primary': '#eeeeee', '--bg-app': '#ffffff' }, cssVariables)
    expect(dark['--color-primary']).toBe('#ff0000')
    expect(light['--color-primary']).toBe('#ff0000')
    // 没被覆盖的 token 仍跟随主题。
    expect(dark['--bg-app']).toBe('#000000')
    expect(light['--bg-app']).toBe('#ffffff')
  })
})

// ── 7. 清单投影:非法条目可见 ────────────────────

describe('renderer projection', () => {
  it('投影带逐条裁决,非法条目标记可见(与 uiSlots unsupported 同规)', () => {
    const projected = projectOnethingPluginsForRenderer([
      makeListItem('alpha', true, { primary: '#111111', bogus: '#222222' }),
      makeListItem('zed', true, { primary: '#333333', accent: 'var(--x)' }),
    ])
    expect(projected.find(p => p.id === 'alpha')?.contributes.theme).toEqual([
      { token: 'primary', value: '#111111', status: 'shadowed', shadowedBy: 'zed' },
      { token: 'bogus', value: '#222222', status: 'invalid', reason: 'unknown-token' },
    ])
    expect(projected.find(p => p.id === 'zed')?.contributes.theme).toEqual([
      { token: 'primary', value: '#333333', status: 'active' },
      { token: 'accent', value: 'var(--x)', status: 'invalid', reason: 'invalid-color' },
    ])
  })

  it('没有声明 theme 的插件投影出空数组(不是 undefined —— 消费端不必判两种空)', () => {
    const [plugin] = projectOnethingPluginsForRenderer([makeListItem('plain', true, undefined)])
    expect(plugin.contributes.theme).toEqual([])
  })
})

// ── 8. 装配层:宿主合成链路 ──────────────────────

describe('host composition', () => {
  it('插件系统没起来 = 主题变量原样流出(不抛,也不复制一份)', () => {
    managedPlugins.length = 0
    const themeOutput = { '--color-primary': '#000000' }
    expect(applyPluginThemeOverrides(themeOutput)).toBe(themeOutput)
  })

  it('启用的插件覆盖叠上;停用后下一次下发就回到主题原值(拆除快照)', () => {
    const themeOutput = { '--color-primary': '#000000', '--bg-app': '#101010' }

    managedPlugins.length = 0
    managedPlugins.push(makeListItem('brand', true, { primary: '#ff0000' }))
    const applied = applyPluginThemeOverrides(themeOutput)
    expect(applied['--color-primary']).toBe('#ff0000')
    expect(applied['--bg-app']).toBe('#101010')

    managedPlugins[0].definition.enabled = false
    expect(applyPluginThemeOverrides(themeOutput)).toEqual(themeOutput)
  })
})

function makeListItem(id: string, enabled: boolean, overrides: Record<string, string> | undefined) {
  return {
    definition: {
      id,
      source: 'user',
      enabled,
      dirPath: `/plugins/${id}`,
      manifest: {
        name: id,
        version: '1.0.0',
        contributes: overrides ? { theme: { overrides } } : {},
      },
    },
    loaded: true,
    commands: [],
  }
}
