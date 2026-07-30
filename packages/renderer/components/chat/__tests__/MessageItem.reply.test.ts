// @vitest-environment happy-dom
/**
 * Quote reply on a message row (W7, docs/design/multi-agent-collab-im.md
 * §3.5 A): the entry is room-only, the block is a snapshot, and the jump is
 * best-effort. Ordinary sessions must not grow either affordance.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageItem from '../MessageItem.vue'
import MessageActions from '../message/MessageActions.vue'

const mocks = vi.hoisted(() => ({
  chatStore: {
    pendingSteeringByMessageId: new Map<string, unknown>(),
    retractSteerMessage: vi.fn(),
  },
  // 署名走 displayAgent(域模型 M4):找不到 → 墓碑,不露原始 id。
  agentsStore: (() => {
    let agents: Array<{ id: string; name: string; title?: string; avatar?: string; status?: string }> = [
      { id: 'a1', name: '小李', title: '工程师', avatar: '🔧' },
    ]
    return {
      get agents() { return agents },
      set agents(next: typeof agents) { agents = next },
      loadAgents: vi.fn().mockResolvedValue(undefined),
      displayAgent: (agentId?: string | null) =>
        agents.find(agent => agent.id === agentId)
        ?? { id: agentId ?? '', name: '已注销', status: 'retired' },
    }
  })(),
  sessionsStore: {
    sessions: [{ id: 'room-1', name: 'Team', kind: 'room' }],
  },
  platformApi: {
    openImageGallery: vi.fn(),
    openImagePreview: vi.fn(),
  },
}))

vi.mock('@/stores/chat', () => ({ useChatStore: () => mocks.chatStore }))
vi.mock('@/stores/agents', () => ({ useAgentsStore: () => mocks.agentsStore }))
vi.mock('@/stores/sessions', () => ({ useSessionsStore: () => mocks.sessionsStore }))
vi.mock('@/platform', () => ({ platformApi: mocks.platformApi }))

function mountItem(props: Record<string, unknown>) {
  return mount(MessageItem, {
    props: {
      roomMode: true,
      groupHead: true,
      groupTail: true,
      message: {
        id: 'm1',
        sessionId: 'room-1',
        role: 'assistant',
        agentId: 'a1',
        content: '  先做接口\n再做页面  ',
        timestamp: Date.now(),
      },
      ...props,
    } as never,
    global: {
      stubs: {
        MessageBubble: true,
        MessageThinking: true,
        StepsPanel: true,
        ErrorNote: true,
        AttachmentThumb: true,
        FileChip: true,
        Tooltip: { template: '<div><slot /></div>' },
      },
    },
  })
}

// MessageActions is mounted for real here (the 回复 button lives in it); it
// reaches for the evals workbench store, so the row needs a pinia.
beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MessageItem quote reply', () => {
  it('offers 回复 on room messages and snapshots author + condensed excerpt', async () => {
    const wrapper = mountItem({})
    const actions = wrapper.findComponent(MessageActions)
    expect(actions.props('canReply')).toBe(true)

    await wrapper.find('.reply-btn').trigger('click')
    expect(wrapper.emitted('reply')?.[0]).toEqual([{
      messageId: 'm1',
      authorLabel: '小李',
      excerpt: '先做接口 再做页面',
    }])
    wrapper.unmount()
  })

  it('signs a quoted user message with the same label the projection uses', async () => {
    const wrapper = mountItem({
      message: {
        id: 'm2',
        sessionId: 'room-1',
        role: 'user',
        content: '谁来做登录页?',
        timestamp: Date.now(),
      },
    })
    await wrapper.find('.reply-btn').trigger('click')
    expect(wrapper.emitted('reply')?.[0]).toEqual([{
      messageId: 'm2',
      authorLabel: '用户',
      excerpt: '谁来做登录页?',
    }])
    wrapper.unmount()
  })

  it('keeps the entry out of ordinary sessions entirely', () => {
    const wrapper = mountItem({ roomMode: false })
    expect(wrapper.findComponent(MessageActions).props('canReply')).toBe(false)
    expect(wrapper.find('.reply-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the quote block above the speech and asks the list to jump', async () => {
    const wrapper = mountItem({
      message: {
        id: 'm3',
        sessionId: 'room-1',
        role: 'user',
        content: '就按这个来',
        timestamp: Date.now(),
        replyTo: { messageId: 'm1', authorLabel: '小李', excerpt: '先做接口再做页面' },
      },
    })
    expect(wrapper.find('.reply-quote-author').text()).toBe('小李')
    expect(wrapper.find('.reply-quote-excerpt').text()).toBe('先做接口再做页面')

    await wrapper.find('.reply-quote').trigger('click')
    expect(wrapper.emitted('jumpToMessage')?.[0]).toEqual(['m1'])
    wrapper.unmount()
  })

  // W13.2: the coordinator now hangs quotes on AGENT replies after the fact,
  // so the block must render on a room agent row too — not just on the user's
  // own right-hand column, which is all W7 ever exercised.
  it('renders the quote block on a room agent message (W13.2 补挂)', async () => {
    const wrapper = mountItem({
      message: {
        id: 'm4',
        sessionId: 'room-1',
        role: 'assistant',
        agentId: 'a1',
        content: '明天下班前',
        timestamp: Date.now(),
        replyTo: { messageId: 'm0', authorLabel: '用户', excerpt: '登录页什么时候能好?' },
      },
    })
    expect(wrapper.find('.message').classes()).toContain('is-room-agent')
    expect(wrapper.find('.reply-quote-author').text()).toBe('用户')
    expect(wrapper.find('.reply-quote-excerpt').text()).toBe('登录页什么时候能好?')

    await wrapper.find('.reply-quote').trigger('click')
    expect(wrapper.emitted('jumpToMessage')?.[0]).toEqual(['m0'])
    wrapper.unmount()
  })

  it('draws no block when the message answers nothing', () => {
    const wrapper = mountItem({})
    expect(wrapper.find('.reply-quote').exists()).toBe(false)
    wrapper.unmount()
  })
})
