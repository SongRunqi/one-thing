// @vitest-environment happy-dom
/**
 * 重新生成的防误触：第一次点只把按钮「上膛」，第二次点才真的重来。
 * 指针移开这一行就撤销，避免按钮一直停在待确认态。
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MessageActions from '../MessageActions.vue'

vi.mock('@/composables/useTTS', () => ({
  useTTS: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    isSpeaking: { value: false },
    speakingMessageId: { value: null },
    supported: { value: false },
  }),
}))
vi.mock('@/platform', () => ({ platformApi: {} }))
vi.mock('@/stores/evalsWorkbench', () => ({ useEvalsWorkbenchStore: () => ({ open: vi.fn() }) }))

function mountActions(role: 'user' | 'assistant') {
  return mount(MessageActions, {
    props: { role, content: 'hi', visible: true, messageId: 'm1' },
    global: { stubs: { Tooltip: { template: '<div><slot /></div>' } } },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe.each(['assistant', 'user'] as const)('%s 消息的重新生成按钮', (role) => {
  it('第一次点击不触发重新生成，第二次才触发', async () => {
    const wrapper = mountActions(role)
    const button = wrapper.find('.regenerate-btn')
    expect(button.exists()).toBe(true)

    await button.trigger('click')
    expect(wrapper.emitted('regenerate')).toBeUndefined()
    expect(wrapper.find('.regenerate-btn').classes()).toContain('armed')

    await button.trigger('click')
    expect(wrapper.emitted('regenerate')).toHaveLength(1)
    expect(wrapper.find('.regenerate-btn').classes()).not.toContain('armed')
  })

  it('指针移开这一行就撤销待确认状态', async () => {
    const wrapper = mountActions(role)
    await wrapper.find('.regenerate-btn').trigger('click')
    expect(wrapper.find('.regenerate-btn').classes()).toContain('armed')

    await wrapper.find('.actions').trigger('mouseleave')
    expect(wrapper.find('.regenerate-btn').classes()).not.toContain('armed')

    // 撤销之后再点一次仍然只是重新上膛，不会直接重来。
    await wrapper.find('.regenerate-btn').trigger('click')
    expect(wrapper.emitted('regenerate')).toBeUndefined()
  })

  it('待确认状态会自动超时撤销', async () => {
    const wrapper = mountActions(role)
    await wrapper.find('.regenerate-btn').trigger('click')
    expect(wrapper.find('.regenerate-btn').classes()).toContain('armed')

    vi.advanceTimersByTime(4000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.regenerate-btn').classes()).not.toContain('armed')
    expect(wrapper.emitted('regenerate')).toBeUndefined()
  })
})
