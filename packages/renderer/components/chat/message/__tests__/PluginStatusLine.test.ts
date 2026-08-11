// @vitest-environment happy-dom
/**
 * **后台任务可见性的验收(渲染侧)**,2026-08-11。
 *
 * 真组件挂载,喂状态 part,断言 DOM 上真的出现了那一行字与那个时间 —— 不是断言
 * 我们"打算"渲染什么。三件事各自钉死:
 *
 *  1. 在跑的**看得见**:一行"运行中"载体上屏;
 *  2. **走秒**:时钟推进,DOM 上的数字跟着变(渲染侧用 startedAt 自算,
 *     所以推进时钟就够了,不需要再喂事件);
 *  3. **定格**:结算之后停止走秒,并且不再呼吸(转圈的和做完的必须一眼分得开)。
 */
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PluginStatusLine from '../PluginStatusLine.vue'
import type { ContentPart } from '@/types'

type PluginStatusPart = Extract<ContentPart, { type: 'plugin-status' }>

const NOW = 1_700_000_000_000

function statusPart(overrides: Partial<PluginStatusPart> = {}): PluginStatusPart {
  return {
    type: 'plugin-status',
    pluginId: 'claude-code-agent',
    id: 'background-tasks',
    label: '后台子代理运行中',
    ...overrides,
  } as PluginStatusPart
}

/** 推进假时钟并让 Vue 把新值刷到 DOM 上。 */
async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('流内状态条:在跑的可见', () => {
  it('挂载即上屏,label 原样呈现', () => {
    const wrapper = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW }) },
    })

    expect(wrapper.find('.plugin-status-line').exists()).toBe(true)
    expect(wrapper.find('.plugin-status-label').text()).toBe('后台子代理运行中')
    // role=status:屏幕阅读器要能播报出来,这是"可见"的另一半。
    expect(wrapper.find('.plugin-status-line').attributes('role')).toBe('status')
    wrapper.unmount()
  })

  it('归属跟着状态走 —— 用户看得出是谁在忙', () => {
    const wrapper = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW }) },
    })
    expect(wrapper.find('.plugin-status-owner').text()).toBe('claude-code-agent')
    wrapper.unmount()
  })
})

describe('流内状态条:计时', () => {
  it('起始时间戳一到就显示耗时', () => {
    const wrapper = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW }) },
    })
    expect(wrapper.find('.plugin-status-elapsed').exists()).toBe(true)
    wrapper.unmount()
  })

  it('时钟推进 → DOM 上的数字跟着走(没有再喂任何事件)', async () => {
    const wrapper = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW }) },
    })
    const first = wrapper.find('.plugin-status-elapsed').text()

    await advance(3_000)
    const later = wrapper.find('.plugin-status-elapsed').text()

    expect(later).not.toBe(first)
    expect(later).toBe('3.0s')
    wrapper.unmount()
  })

  it('跨分钟按 m/s 呈现', async () => {
    const wrapper = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW }) },
    })
    await advance(83_400)
    expect(wrapper.find('.plugin-status-elapsed').text()).toBe('1m23.4s')
    wrapper.unmount()
  })

  it('没有 startedAt 的老式状态:不显示一个从 0 开始的假计时', () => {
    const wrapper = mount(PluginStatusLine, {
      props: { part: statusPart({ label: 'Scanning log files…' }) },
    })
    expect(wrapper.find('.plugin-status-elapsed').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('流内状态条:收场', () => {
  it('结算态定格总耗时,不再随时钟走', async () => {
    const wrapper = mount(PluginStatusLine, {
      props: {
        part: statusPart({
          label: '后台子代理已完成',
          startedAt: NOW,
          durationMs: 83_400,
        }),
      },
    })

    expect(wrapper.find('.plugin-status-elapsed').text()).toBe('1m23.4s')
    await advance(10_000)
    // 定格 = 时钟继续走而这个数字不动。
    expect(wrapper.find('.plugin-status-elapsed').text()).toBe('1m23.4s')
    expect(wrapper.find('.plugin-status-label').text()).toBe('后台子代理已完成')
    wrapper.unmount()
  })

  it('结算态带 is-settled —— 转圈的和做完的一眼分得开', () => {
    const running = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW }) },
    })
    const settled = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW, durationMs: 1_000 }) },
    })

    expect(running.find('.plugin-status-line').classes()).not.toContain('is-settled')
    expect(settled.find('.plugin-status-line').classes()).toContain('is-settled')
    running.unmount()
    settled.unmount()
  })

  it('running → settled:同一个组件实例上完成收口', async () => {
    const wrapper = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW }) },
    })
    await advance(5_000)
    expect(wrapper.find('.plugin-status-elapsed').text()).toBe('5.0s')

    await wrapper.setProps({
      part: statusPart({ label: '后台子代理已完成', startedAt: NOW, durationMs: 5_200 }),
    })

    expect(wrapper.find('.plugin-status-line').classes()).toContain('is-settled')
    expect(wrapper.find('.plugin-status-elapsed').text()).toBe('5.2s')
    await advance(10_000)
    expect(wrapper.find('.plugin-status-elapsed').text()).toBe('5.2s')
    wrapper.unmount()
  })
})

describe('时钟的存活期', () => {
  it('卸载后不再有定时器挂着', () => {
    const wrapper = mount(PluginStatusLine, {
      props: { part: statusPart({ startedAt: NOW }) },
    })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    wrapper.unmount()
    // 时钟的存活期与"屏幕上真的有一根状态条"相等 —— 否则聊天窗一开就永远
    // 有一个 100ms 的 interval 在跑。
    expect(vi.getTimerCount()).toBe(0)
  })
})
