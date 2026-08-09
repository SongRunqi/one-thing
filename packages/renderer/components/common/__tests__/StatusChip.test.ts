// @vitest-environment happy-dom
/**
 * StatusChip 验收 —— S 状态带的壳(docs/design/composer-bands-2026-08.md §3.1)。
 *
 * 钉三件事:静态 chip 不是控件;入口是 <button> 而浮层是它的**兄弟**(嵌进
 * button 会被解析器炸开,demo 实测判例);受控/自持两种开合都能走。
 */
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import StatusChip from '../StatusChip.vue'

const mounted: VueWrapper[] = []

function mountChip(options: Parameters<typeof mount>[1] = {}) {
  const wrapper = mount(StatusChip, { attachTo: document.body, ...(options as any) })
  mounted.push(wrapper)
  return wrapper
}

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  document.body.innerHTML = ''
})

describe('StatusChip', () => {
  it('没有 flyout 插槽就是静态 chip:一个 span,不是按钮', () => {
    const wrapper = mountChip({ slots: { default: '⚡ 5.2 tok/s' } })

    const chip = wrapper.find('.status-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.element.tagName).toBe('SPAN')
    expect(chip.classes()).toContain('is-static')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('有 flyout 插槽:入口是 button,浮层是它的兄弟而不是子孙', async () => {
    const wrapper = mountChip({
      slots: { default: '⚙ 2 jobs', flyout: '<button class="stop-btn">停止</button>' },
    })

    const trigger = wrapper.find('button.status-chip')
    expect(trigger.exists()).toBe(true)
    expect(trigger.element.querySelector('.stop-btn')).toBeNull()

    await trigger.trigger('click')
    await flushPromises()

    const flyout = document.body.querySelector('.status-chip-flyout-body')
    expect(flyout).not.toBeNull()
    expect(flyout?.querySelector('.stop-btn')).not.toBeNull()
    // 浮层 teleport 到 body,不留在带内(S 带是 overflow 容器,留下会被剪没)。
    expect(trigger.element.contains(flyout)).toBe(false)
  })

  it('自持开合:再点一次收起,并把 aria-expanded 一起翻过来', async () => {
    const wrapper = mountChip({
      slots: { default: 'chip', flyout: '<span class="fly">面板</span>' },
    })
    const trigger = wrapper.find('button.status-chip')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')
    await flushPromises()
    expect(wrapper.find('button.status-chip').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('button.status-chip').classes()).toContain('is-open')

    await wrapper.find('button.status-chip').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.fly')).toBeNull()
  })

  it('受控开合:open 由外面说了算,点击只上报意图', async () => {
    const wrapper = mountChip({
      props: { open: true },
      slots: { default: 'chip', flyout: '<span class="fly">面板</span>' },
    })
    await flushPromises()
    expect(document.body.querySelector('.fly')).not.toBeNull()

    await wrapper.find('button.status-chip').trigger('click')
    await flushPromises()
    // 外面没改 prop,浮层就还开着 —— 壳不私自改受控真值。
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    expect(document.body.querySelector('.fly')).not.toBeNull()
  })

  it('原生监听器落在 chip 按钮上(悬停展开这类语义归成员自己)', async () => {
    let entered = 0
    const wrapper = mountChip({
      attrs: { onMouseenter: () => { entered += 1 } },
      slots: { default: 'chip', flyout: '<span />' },
    })

    await wrapper.find('button.status-chip').trigger('mouseenter')
    expect(entered).toBe(1)
  })
})
