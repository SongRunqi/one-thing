// @vitest-environment happy-dom
/**
 * Emoji reactions on a message row (W8, docs/design/multi-agent-collab-im.md
 * §3.5 B / §3.6): the entry and the chips are BOTH room-only, the chip is a
 * toggle, and "I reacted" is said by a class on the line — never by a fill.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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
      { id: 'a2', name: '阿明', title: '负责人', avatar: '📋' },
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
        content: '接口写完了',
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

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MessageItem reactions', () => {
  it('offers the palette on room messages and emits the picked emoji', async () => {
    const wrapper = mountItem({})
    expect(wrapper.findComponent(MessageActions).props('canReact')).toBe(true)

    await wrapper.find('.react-btn').trigger('click')
    const buttons = document.querySelectorAll('.react-picker-item')
    expect(buttons).toHaveLength(6)

    await wrapper.find('.react-btn').trigger('click') // close
    // Picking goes through the same emit the chip uses.
    wrapper.findComponent(MessageActions).vm.$emit('react', '👍')
    expect(wrapper.emitted('react')?.[0]).toEqual(['m1', '👍'])
    wrapper.unmount()
  })

  it('keeps the entry and the chips out of ordinary sessions entirely', () => {
    const wrapper = mountItem({
      roomMode: false,
      message: {
        id: 'm2',
        sessionId: 'chat-1',
        role: 'assistant',
        content: '你好',
        timestamp: Date.now(),
        // Even a historical message carrying the field renders as it always did.
        reactions: [{ emoji: '👍', by: [{ type: 'user' }] }],
      },
    })
    expect(wrapper.findComponent(MessageActions).props('canReact')).toBe(false)
    expect(wrapper.find('.react-btn').exists()).toBe(false)
    expect(wrapper.find('.reaction-row').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders one chip per emoji with its count and the reactor roster', () => {
    const wrapper = mountItem({
      message: {
        id: 'm3',
        sessionId: 'room-1',
        role: 'assistant',
        agentId: 'a1',
        content: '接口写完了',
        timestamp: Date.now(),
        reactions: [
          { emoji: '👍', by: [{ type: 'user' }, { type: 'agent', agentId: 'a2' }] },
          { emoji: '🎉', by: [{ type: 'agent', agentId: 'a2' }] },
        ],
      },
    })

    const chips = wrapper.findAll('.reaction-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].find('.reaction-chip-emoji').text()).toBe('👍')
    expect(chips[0].find('.reaction-chip-count').text()).toBe('2')
    // W8b: the roster moved into the popover; a native title on top of it
    // would be the same answer twice.
    expect(chips[0].attributes('title')).toBeUndefined()
    expect(chips[1].attributes('title')).toBeUndefined()
    wrapper.unmount()
  })

  it('marks the chip I am in — a class on the line, never a fill', () => {
    const wrapper = mountItem({
      message: {
        id: 'm4',
        sessionId: 'room-1',
        role: 'assistant',
        agentId: 'a1',
        content: '接口写完了',
        timestamp: Date.now(),
        reactions: [
          { emoji: '👍', by: [{ type: 'user' }] },
          { emoji: '🎉', by: [{ type: 'agent', agentId: 'a2' }] },
        ],
      },
    })
    const chips = wrapper.findAll('.reaction-chip')
    expect(chips[0].classes()).toContain('mine')
    expect(chips[1].classes()).not.toContain('mine')
    wrapper.unmount()
  })

  it('toggles from the chip with the same event the palette uses', async () => {
    const wrapper = mountItem({
      message: {
        id: 'm5',
        sessionId: 'room-1',
        role: 'user',
        content: '上线了',
        timestamp: Date.now(),
        reactions: [{ emoji: '🎉', by: [{ type: 'agent', agentId: 'a1' }] }],
      },
    })
    await wrapper.find('.reaction-chip').trigger('click')
    expect(wrapper.emitted('react')?.[0]).toEqual(['m5', '🎉'])
    wrapper.unmount()
  })

  it('draws no chip row when nobody reacted', () => {
    const wrapper = mountItem({})
    expect(wrapper.find('.reaction-row').exists()).toBe(false)
    wrapper.unmount()
  })
})

/**
 * W8b: "who reacted" is a hover question. The popover rests 300ms before it
 * opens, closes the moment the pointer leaves, and writes nothing — the chip's
 * click stays the toggle it has always been.
 */
describe('MessageItem reaction attribution popover', () => {
  const REACTED_MESSAGE = {
    id: 'm6',
    sessionId: 'room-1',
    role: 'assistant',
    agentId: 'a1',
    content: '接口写完了',
    timestamp: Date.now(),
    reactions: [
      {
        emoji: '👍',
        by: [{ type: 'user' }, { type: 'agent', agentId: 'a2' }, { type: 'agent', agentId: 'ghost' }],
      },
      { emoji: '🎉', by: [{ type: 'agent', agentId: 'a2' }] },
    ],
  }

  function popoverRows(): string[] {
    return Array.from(document.querySelectorAll('.reaction-attribution-row')).map(row =>
      [
        row.querySelector('.reaction-attribution-avatar')?.textContent,
        row.querySelector('.reaction-attribution-name')?.textContent,
      ].join(' '),
    )
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens after the hover delay with one row per reactor', async () => {
    const wrapper = mountItem({ message: REACTED_MESSAGE })
    const chip = wrapper.findAll('.reaction-chip')[0]

    await chip.trigger('mouseenter')
    expect(document.querySelector('.reaction-attribution')).toBeNull()

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(popoverRows()).toEqual(['🧑 你', '📋 阿明', '🤖 ghost'])
    wrapper.unmount()
  })

  it('closes the instant the pointer leaves', async () => {
    const wrapper = mountItem({ message: REACTED_MESSAGE })
    const chip = wrapper.findAll('.reaction-chip')[0]

    await chip.trigger('mouseenter')
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(document.querySelector('.reaction-attribution')).not.toBeNull()

    await chip.trigger('mouseleave')
    await nextTick()
    expect(document.querySelector('.reaction-attribution')).toBeNull()
    wrapper.unmount()
  })

  it('never opens for a pointer that only crosses the chip', async () => {
    const wrapper = mountItem({ message: REACTED_MESSAGE })
    const chip = wrapper.findAll('.reaction-chip')[0]

    await chip.trigger('mouseenter')
    vi.advanceTimersByTime(200)
    await chip.trigger('mouseleave')
    vi.advanceTimersByTime(1000)
    await nextTick()

    expect(document.querySelector('.reaction-attribution')).toBeNull()
    wrapper.unmount()
  })

  it('describes the emoji actually hovered, one popover at a time', async () => {
    const wrapper = mountItem({ message: REACTED_MESSAGE })
    const chips = wrapper.findAll('.reaction-chip')

    await chips[1].trigger('mouseenter')
    vi.advanceTimersByTime(300)
    await nextTick()

    expect(document.querySelectorAll('.reaction-attribution')).toHaveLength(1)
    expect(popoverRows()).toEqual(['📋 阿明'])
    wrapper.unmount()
  })

  it('leaves the toggle alone — hovering emits nothing', async () => {
    const wrapper = mountItem({ message: REACTED_MESSAGE })
    const chip = wrapper.findAll('.reaction-chip')[0]

    await chip.trigger('mouseenter')
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(wrapper.emitted('react')).toBeUndefined()

    await chip.trigger('click')
    expect(wrapper.emitted('react')?.[0]).toEqual(['m6', '👍'])
    wrapper.unmount()
  })
})
