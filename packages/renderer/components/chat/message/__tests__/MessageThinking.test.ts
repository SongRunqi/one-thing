// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MessageThinking from '../MessageThinking.vue'

vi.mock('@/composables/useMarkdownRenderer', () => ({
  renderMarkdown: (content: string) => `<p>${content}</p>`,
  cleanReasoningContent: (content: string) => content.trim(),
}))

describe('MessageThinking', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(performance.now())
      return 1
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('auto-expands reasoning content when it first arrives', async () => {
    const wrapper = mount(MessageThinking, {
      props: {
        isStreaming: true,
        hasContent: false,
        reasoning: '',
      },
    })

    expect(wrapper.find('.thinking-reasoning-wrapper').exists()).toBe(false)

    await wrapper.setProps({ reasoning: 'reasoning summary' })
    await nextTick()

    expect(wrapper.find('.thinking-panel').classes()).toContain('collapse-panel')
    expect(wrapper.find('.thinking-panel').classes()).toContain('variant-plain')
    expect(wrapper.find('.thinking-panel').classes()).toContain('icon-inline-end')
    const reasoning = wrapper.find('.thinking-reasoning-wrapper')
    expect(reasoning.exists()).toBe(true)
    expect(reasoning.classes()).toContain('expanded')
    expect(wrapper.text()).toContain('reasoning summary')

    wrapper.unmount()
  })

  it('shows memory retrieval status before content starts', () => {
    const wrapper = mount(MessageThinking, {
      props: {
        isStreaming: true,
        hasContent: false,
        reasoning: '',
        loadingMemory: true,
      },
    })

    expect(wrapper.text()).toContain('Extracting memory')
    expect(wrapper.text()).not.toContain('Waiting')
    expect(wrapper.find('.thinking-panel').classes()).toContain('collapse-panel')
    expect(wrapper.find('.collapse-panel-content').exists()).toBe(false)

    wrapper.unmount()
  })

  it('does not persist waiting time as thinking time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    const wrapper = mount(MessageThinking, {
      props: {
        isStreaming: true,
        hasContent: false,
        reasoning: '',
      },
    })

    vi.advanceTimersByTime(1200)
    await wrapper.setProps({ isStreaming: false })
    await nextTick()

    expect(wrapper.emitted('updateThinkingTime')).toBeUndefined()

    wrapper.unmount()
  })

  it('starts thinking time when reasoning appears after waiting', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    const wrapper = mount(MessageThinking, {
      props: {
        isStreaming: true,
        hasContent: false,
        reasoning: '',
      },
    })

    vi.advanceTimersByTime(1500)
    await wrapper.setProps({
      reasoning: 'reasoning summary',
      thinkingStartTime: Date.now(),
    })
    await nextTick()

    vi.advanceTimersByTime(2000)
    await wrapper.setProps({ hasContent: true })
    await nextTick()

    const emitted = wrapper.emitted('updateThinkingTime')
    expect(emitted).toBeTruthy()
    expect(emitted?.[0]?.[0]).toBeCloseTo(2, 1)

    wrapper.unmount()
  })

  it('auto-collapses reasoning when streaming ends', async () => {
    const wrapper = mount(MessageThinking, {
      props: {
        isStreaming: true,
        hasContent: false,
        reasoning: 'reasoning summary',
      },
    })

    expect(wrapper.find('.thinking-reasoning-wrapper').classes()).toContain('expanded')

    await wrapper.setProps({ isStreaming: false })
    await nextTick()

    expect(wrapper.find('.thinking-reasoning-wrapper').classes()).not.toContain('expanded')

    wrapper.unmount()
  })

  it('does not override user-controlled expansion when streaming ends', async () => {
    const wrapper = mount(MessageThinking, {
      props: {
        isStreaming: true,
        hasContent: false,
        reasoning: 'reasoning summary',
      },
    })

    await wrapper.find('.thinking-status-row.clickable').trigger('click')
    await nextTick()
    expect(wrapper.find('.thinking-reasoning-wrapper').classes()).not.toContain('expanded')

    await wrapper.find('.thinking-status-row.clickable').trigger('click')
    await nextTick()
    expect(wrapper.find('.thinking-reasoning-wrapper').classes()).toContain('expanded')

    await wrapper.setProps({ isStreaming: false })
    await nextTick()

    expect(wrapper.find('.thinking-reasoning-wrapper').classes()).toContain('expanded')

    wrapper.unmount()
  })
})
