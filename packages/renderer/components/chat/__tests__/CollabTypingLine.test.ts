// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CollabTypingLine from '../CollabTypingLine.vue'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(envelope: { sessionId: string; event: unknown }) => void>,
}))

vi.mock('@/platform', () => ({
  platformApi: {
    onSessionEvent: (handler: (envelope: { sessionId: string; event: unknown }) => void) => {
      mocks.handlers.push(handler)
      return () => {}
    },
    getCollabBoard: vi.fn().mockResolvedValue({ success: false }),
    listAgents: vi.fn().mockResolvedValue({ success: true, agents: [] }),
  },
}))

function emitTyping(sessionId: string, agentId: string, typing: boolean): void {
  for (const handler of mocks.handlers) {
    handler({ sessionId, event: { type: 'collab:typing', agentId, typing } })
  }
}

beforeEach(() => {
  mocks.handlers.length = 0
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-28T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CollabTypingLine', () => {
  it('renders nothing while the room is quiet — silence reserves no row', () => {
    const wrapper = mount(CollabTypingLine, { props: { sessionId: 'room-1' } })
    expect(wrapper.find('.collab-typing').exists()).toBe(false)
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('names the typing members with their avatars and three dots', async () => {
    const agentsStore = useAgentsStore()
    agentsStore.agents = [
      { id: 'agent-li', name: '小李', avatar: '🔧', systemPrompt: '', createdAt: 0, updatedAt: 0 },
      { id: 'agent-yan', name: '小研', avatar: '🔎', systemPrompt: '', createdAt: 0, updatedAt: 0 },
    ]
    agentsStore.hasLoaded = true

    const wrapper = mount(CollabTypingLine, { props: { sessionId: 'room-1' } })
    useCollabBoardStore().ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)
    emitTyping('room-1', 'agent-yan', true)
    await nextTick()

    expect(wrapper.text()).toContain('🔧小李、🔎小研')
    expect(wrapper.text()).toContain('正在输入')
    expect(wrapper.findAll('.typing-dot')).toHaveLength(3)
  })

  it('shows the tombstone, not a raw id, when the roster has no such member', async () => {
    // 域模型 M4:署名一律走 displayAgent —— 一串 uuid 出现在"正在输入"那一行,
    // 对用户等于一句乱码。
    const wrapper = mount(CollabTypingLine, { props: { sessionId: 'room-1' } })
    useCollabBoardStore().ensureSubscribed()

    emitTyping('room-1', 'agent-ghost', true)
    await nextTick()

    expect(wrapper.text()).toContain('已注销')
    expect(wrapper.text()).not.toContain('agent-ghost')
  })

  it('disappears on typing:false, and on a stale true that never got one', async () => {
    const wrapper = mount(CollabTypingLine, { props: { sessionId: 'room-1' } })
    useCollabBoardStore().ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)
    emitTyping('room-1', 'agent-yan', true)
    await nextTick()
    expect(wrapper.find('.collab-typing').exists()).toBe(true)

    emitTyping('room-1', 'agent-li', false)
    await nextTick()
    expect(wrapper.text()).not.toContain('agent-li')
    expect(wrapper.find('.collab-typing').exists()).toBe(true)

    // agent-yan's false never arrives: the 1s pulse re-reads the store and the
    // expiry retires the line on its own.
    vi.advanceTimersByTime(61_000)
    await nextTick()
    expect(wrapper.find('.collab-typing').exists()).toBe(false)
  })

  it('runs no timer while quiet and stops it once the room settles', async () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval')
    const clearInterval = vi.spyOn(globalThis, 'clearInterval')

    const wrapper = mount(CollabTypingLine, { props: { sessionId: 'room-1' } })
    useCollabBoardStore().ensureSubscribed()
    expect(setInterval).not.toHaveBeenCalled()

    emitTyping('room-1', 'agent-li', true)
    await nextTick()
    expect(setInterval).toHaveBeenCalledTimes(1)

    emitTyping('room-1', 'agent-li', false)
    await nextTick()
    expect(clearInterval).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})
