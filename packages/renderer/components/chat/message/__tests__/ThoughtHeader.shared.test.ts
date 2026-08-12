// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import MessageThinking from '../MessageThinking.vue'
import MessageBubble from '../MessageBubble.vue'
import ThoughtHeader from '../ThoughtHeader.vue'

vi.mock('@/composables/useMarkdownRenderer', () => ({
  renderMarkdown: (content: string) => `<p>${content}</p>`,
  cleanReasoningContent: (content: string) => content.trim(),
}))

const markdownStubs = {
  MessageMarkdown: { props: ['content'], template: '<div class="md-stub">{{ content }}</div>' },
  StreamingMarkdown: { props: ['content'], template: '<div class="md-stub">{{ content }}</div>' },
}

/**
 * The top-of-message thought (MessageThinking, driven by `message.reasoning`)
 * and the in-rail thought (MessageBubble's reasoning contentPart) are two
 * components on two data paths. They must not be two LOOKS: both render the
 * same ThoughtHeader and both wear the same `.thought-body` skin, so the user
 * cannot tell that there are two implementations.
 */
describe('the one Thought presentation', () => {
  it('renders the same header structure from both mount points', async () => {
    const top = mount(MessageThinking, {
      props: { isStreaming: false, hasContent: true, reasoning: 'weighing the options', thinkingTime: 3.2 },
    })
    await nextTick()

    const bubble = mount(MessageBubble, {
      props: {
        role: 'assistant',
        content: '',
        contentParts: [{ type: 'reasoning', content: 'Weighing the options. Then answer.', turnIndex: 1 }],
        isStreaming: false,
      },
      global: { stubs: markdownStubs },
    })
    // A lone thought is a "solo" process group (no rail summary line); the
    // panel itself still starts collapsed, so open it to reach the body.
    await bubble.find('.thought-header').trigger('click')

    const topHeader = top.find('.thought-header')
    const inlineHeader = bubble.find('.thought-header')
    expect(topHeader.exists()).toBe(true)
    expect(inlineHeader.exists()).toBe(true)

    // Same component, same DOM shape: label + middot + detail.
    for (const header of [topHeader, inlineHeader]) {
      expect(header.find('.thought-label').text()).toBe('Thought')
      expect(header.find('.thought-detail-separator').text()).toBe('·')
      expect(header.find('.thought-detail-text').exists()).toBe(true)
    }
    expect(topHeader.find('.thought-detail-text').text()).toBe('3.2s')
    expect(inlineHeader.find('.thought-detail-text').text()).toBe('Weighing the options.')

    // Both bodies wear the shared skin class.
    expect(top.find('.thinking-content').classes()).toContain('thought-body')
    expect(bubble.find('.inline-reasoning-content').classes()).toContain('thought-body')

    top.unmount()
    bubble.unmount()
  })

  it('only draws the live dot while a phase has no other liveness cue', () => {
    const settled = mount(ThoughtHeader, { props: { label: 'Thought', detail: '3.2s' } })
    const live = mount(ThoughtHeader, { props: { label: 'Thinking', detail: '1.1s', live: true } })

    expect(settled.find('.thought-dot').exists()).toBe(false)
    expect(settled.find('.thought-label').classes()).not.toContain('flowing')
    expect(live.find('.thought-dot').exists()).toBe(true)
    expect(live.find('.thought-label').classes()).toContain('flowing')

    settled.unmount()
    live.unmount()
  })

  it('drops the detail half entirely when there is nothing to say', () => {
    const wrapper = mount(ThoughtHeader, { props: { label: 'Thought' } })

    expect(wrapper.find('.thought-detail').exists()).toBe(false)
    expect(wrapper.text()).toBe('Thought')

    wrapper.unmount()
  })
})
