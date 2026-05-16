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

    const reasoning = wrapper.find('.thinking-reasoning-wrapper')
    expect(reasoning.exists()).toBe(true)
    expect(reasoning.classes()).toContain('expanded')
    expect(wrapper.text()).toContain('reasoning summary')

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
