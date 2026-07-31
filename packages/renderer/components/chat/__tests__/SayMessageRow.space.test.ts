// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SayMessageRow from '../say/SayMessageRow.vue'
import { OPEN_MEMBERS_EVENT } from '@/components/workbench/room-members'

/**
 * R2 入口之三:中栏 say 的**署名头像/名字** → 右栏空间页
 * (样板「中栏署名头像点击也到这里」)。下钻不占 tab 位,所以派的是带
 * agentId 的 open-members,而不是再开一个页签。
 */
const mocks = vi.hoisted(() => ({
  openAgentSpace: vi.fn(),
}))

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => ({
    agents: [],
    displayAgent: (agentId?: string | null) => ({
      id: agentId || '',
      name: '小林',
      title: '架构',
      avatar: '🙂',
      kind: 'colleague',
      status: 'active',
    }),
    openAgentSpace: mocks.openAgentSpace,
  }),
}))

vi.mock('@/platform', () => ({
  platformApi: { openImagePreview: vi.fn() },
}))

vi.mock('../message/MessageMarkdown.vue', () => ({
  default: { name: 'MessageMarkdown', props: ['content'], template: '<div class="mock-md" />' },
}))

function mountRow(props: Record<string, unknown> = {}) {
  return mount(SayMessageRow, {
    props: {
      message: { id: 'm1', role: 'assistant', agentId: 'a1', content: '跑完了', timestamp: 0 },
      index: 0,
      head: true,
      tail: true,
      addressed: false,
      ...props,
    },
  })
}

function captureMembersEvent(): { seen: unknown[]; stop: () => void } {
  const seen: unknown[] = []
  const listener = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener(OPEN_MEMBERS_EVENT, listener)
  return { seen, stop: () => window.removeEventListener(OPEN_MEMBERS_EVENT, listener) }
}

describe('SayMessageRow — 署名头像下钻空间页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('头像与名字都派 open-members(带 agentId = 直接落在空间页)', async () => {
    const wrapper = mountRow({ roomSessionId: 'room-1' })
    const capture = captureMembersEvent()

    await wrapper.find('.say-avatar-btn').trigger('click')
    await wrapper.find('.say-sig-name').trigger('click')
    capture.stop()

    expect(capture.seen).toEqual([
      { sessionId: 'room-1', agentId: 'a1' },
      { sessionId: 'room-1', agentId: 'a1' },
    ])
    expect(mocks.openAgentSpace).not.toHaveBeenCalled()
  })

  it('拿不到房 id 时退回既有的全屏空间页 —— 不吞掉这次点击', async () => {
    const wrapper = mountRow()
    const capture = captureMembersEvent()

    await wrapper.find('.say-avatar-btn').trigger('click')
    capture.stop()

    expect(capture.seen).toHaveLength(0)
    expect(mocks.openAgentSpace).toHaveBeenCalledWith('a1')
  })

  it('私聊房里署名不是入口(一对一房不需要"去认识 TA")', async () => {
    const wrapper = mountRow({ roomSessionId: 'dm-1', dmMode: true })
    expect(wrapper.find('.say-avatar-btn').exists()).toBe(false)
  })
})
