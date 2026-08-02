// @vitest-environment happy-dom
/**
 * 悬浮操作条与回复引用条(im-message 设计稿 §B / §E)。
 *
 * 守三件事:
 *  1. 操作条 hover 才在,而且**不占行高** —— 它是 absolute 的浮层,不是一行;
 *  2. 点表情 = 派既有的 react 事件(toggle 落后端),点引用 = 派既有的 reply
 *     快照事件,一条新链路都不起;
 *  3. 原文已删的引用条只在**上游确认没了**时才降级,而且降级后点不动。
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SayMessageRow from '../SayMessageRow.vue'
import { resetSayRecentEmojis } from '../say-emoji'

const mocks = vi.hoisted(() => ({
  agentsStore: {
    agents: [{ id: 'fe', name: '李工', color: '#66800b' }],
    displayAgent: (agentId?: string | null) => ({
      id: agentId ?? '',
      name: '李工',
      color: '#66800b',
      status: 'active',
    }),
    openAgentSpace: vi.fn(),
  },
  platformApi: { openImagePreview: vi.fn() },
}))

vi.mock('@/stores/agents', () => ({ useAgentsStore: () => mocks.agentsStore }))
vi.mock('@/platform', () => ({ platformApi: mocks.platformApi }))

function mountRow(props: Record<string, unknown> = {}, message: Record<string, unknown> = {}) {
  return mount(SayMessageRow, {
    props: {
      index: 0,
      head: true,
      tail: true,
      addressed: false,
      message: {
        id: 'm1',
        sessionId: 'room-1',
        role: 'user',
        content: '核完了',
        timestamp: Date.now(),
        ...message,
      },
      ...props,
    } as never,
    global: {
      stubs: {
        AgentAvatar: true,
        AttachmentThumb: true,
        FileChip: true,
        MessageMarkdown: true,
        ContextMenu: true,
        Teleport: true,
      },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetSayRecentEmojis()
})

describe('悬浮操作条', () => {
  it('静止时不在 DOM 里 —— 一屏几百行不交这份税', () => {
    const wrapper = mountRow()
    expect(wrapper.find('.say-hoverbar').exists()).toBe(false)
  })

  it('hover 该行才出现,带三枚快捷表情 + 更多表情 + 引用 + ⋯', async () => {
    const wrapper = mountRow()
    await wrapper.trigger('mouseenter')
    const bar = wrapper.find('.say-hoverbar')
    expect(bar.exists()).toBe(true)
    expect(bar.findAll('.say-hoverbar-btn')).toHaveLength(6)
    expect(bar.findAll('.say-hoverbar-btn')[0].text()).toBe('👍')
  })

  it('移开就收', async () => {
    const wrapper = mountRow()
    await wrapper.trigger('mouseenter')
    await wrapper.trigger('mouseleave')
    expect(wrapper.find('.say-hoverbar').exists()).toBe(false)
  })

  it('点快捷表情 = 对这条消息派 react(既有投影链路)', async () => {
    const wrapper = mountRow()
    await wrapper.trigger('mouseenter')
    await wrapper.findAll('.say-hoverbar-btn')[1].trigger('click')
    expect(wrapper.emitted('react')).toEqual([['m1', '🎯']])
  })

  it('点过的表情提到快捷位队首(最近使用)', async () => {
    const wrapper = mountRow()
    await wrapper.trigger('mouseenter')
    await wrapper.findAll('.say-hoverbar-btn')[2].trigger('click')
    await wrapper.trigger('mouseenter')
    expect(wrapper.findAll('.say-hoverbar-btn')[0].text()).toBe('😂')
  })

  it('点引用 = 派既有的 replyTo 快照(装进 ComposerReplyBar 那条链)', async () => {
    const wrapper = mountRow()
    await wrapper.trigger('mouseenter')
    await wrapper.findAll('.say-hoverbar-btn')[4].trigger('click')
    const emitted = wrapper.emitted('reply')
    expect(emitted).toHaveLength(1)
    expect((emitted?.[0][0] as { messageId: string; excerpt: string }).messageId).toBe('m1')
    expect((emitted?.[0][0] as { excerpt: string }).excerpt).toBe('核完了')
  })

  it('点「更多表情」开面板,面板开着的时候操作条不许消失', async () => {
    const wrapper = mountRow()
    await wrapper.trigger('mouseenter')
    await wrapper.findAll('.say-hoverbar-btn')[3].trigger('click')
    await wrapper.trigger('mouseleave')
    expect(wrapper.find('.say-hoverbar').exists()).toBe(true)
    expect(wrapper.find('.say-emoji-panel').exists()).toBe(true)
  })

  it('面板里点一枚 = 同一条 react 链路,并关面板', async () => {
    const wrapper = mountRow()
    await wrapper.trigger('mouseenter')
    await wrapper.findAll('.say-hoverbar-btn')[3].trigger('click')
    await wrapper.findAll('.say-emoji-grid button')[0].trigger('click')
    expect(wrapper.emitted('react')).toHaveLength(1)
    expect(wrapper.find('.say-emoji-panel').exists()).toBe(false)
  })

  it('Esc 关面板', async () => {
    const wrapper = mountRow()
    await wrapper.trigger('mouseenter')
    await wrapper.findAll('.say-hoverbar-btn')[3].trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.say-emoji-panel').exists()).toBe(false)
  })
})

describe('回复引用条', () => {
  const replyTo = { messageId: 'm0', authorLabel: '李工', excerpt: '三个假设两个被证伪' }

  it('常态:可点、带被引者身份色', () => {
    const wrapper = mountRow({}, { replyTo })
    const quote = wrapper.find('.say-quote')
    expect(quote.exists()).toBe(true)
    expect(quote.attributes('disabled')).toBeUndefined()
    expect(quote.attributes('style')).toContain('#66800b')
    expect(wrapper.find('.say-quote-excerpt').text()).toBe('三个假设两个被证伪')
  })

  it('点它 = 跳回原文', async () => {
    const wrapper = mountRow({}, { replyTo })
    await wrapper.find('.say-quote').trigger('click')
    expect(wrapper.emitted('jumpToMessage')).toEqual([['m0']])
  })

  it('原文已删:摘录还在,但整条灰化且点不动', async () => {
    const wrapper = mountRow({ quoteMissing: true }, { replyTo })
    const quote = wrapper.find('.say-quote')
    expect(quote.classes()).toContain('is-gone')
    expect(quote.attributes('disabled')).toBeDefined()
    expect(quote.text()).toContain('原消息已删除 · 快照:')
    await quote.trigger('click')
    expect(wrapper.emitted('jumpToMessage')).toBeUndefined()
  })

  it('被引者是重名(花名册上不止一个)→ 不挑人,退回中性色', () => {
    mocks.agentsStore.agents = [
      { id: 'a', name: '李工', color: '#111111' },
      { id: 'b', name: '李工', color: '#222222' },
    ]
    const wrapper = mountRow({}, { replyTo })
    expect(wrapper.find('.say-quote').attributes('style')).toBeUndefined()
    mocks.agentsStore.agents = [{ id: 'fe', name: '李工', color: '#66800b' }]
  })
})
