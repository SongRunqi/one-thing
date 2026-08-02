// @vitest-environment happy-dom
/**
 * W14a §4.5 — what a mention READS AS in the room after the roster moved.
 *
 * The bubble must show the name the mentioned member goes by NOW (the id on
 * the message is the truth, the text is only a rendering), and must fall back
 * to the label snapshot once that member is gone — the words have to stay
 * readable even when there is nobody left to resolve.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageItem from '../MessageItem.vue'

const mocks = vi.hoisted(() => ({
  chatStore: {
    pendingSteeringByMessageId: new Map<string, unknown>(),
    retractSteerMessage: vi.fn(),
  },
  // 署名走 displayAgent(域模型 M4):找不到 → 墓碑,不露原始 id。
  agentsStore: (() => {
    let agents: Array<{ id: string; name: string; title?: string; avatar?: string; status?: string }> = []
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

function mountItem(message: Record<string, unknown>, roomMode = true) {
  return mount(MessageItem, {
    props: {
      roomMode,
      groupHead: true,
      groupTail: true,
      message: {
        id: 'm1',
        sessionId: 'room-1',
        role: 'user',
        content: '@小李 登录页什么时候能好',
        timestamp: Date.now(),
        ...message,
      },
    } as never,
    global: {
      stubs: {
        MessageBubble: { props: ['content'], template: '<div class="bubble">{{ content }}</div>' },
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
  mocks.agentsStore.agents = [
    { id: 'fe', name: '李工', title: '前端工程师', avatar: '🔧' },
  ]
})

/**
 * im-message §A 之后,正文交给渲染链的是**带标记的**文本:每一处已解析身份的
 * `@名字` 变成一枚 pill 标记(见 collabInlineTags 的两拍机制)。这些用例问的
 * 一直是"最后显示成谁",所以把标记读回可见文本再比对 —— 断言的语义没变。
 * 标记体三段以 U+E001 分隔(裸 | 会把表格切碎,见 collabInlineTags)。
 */
function readable(text: string): string {
  return text.replace(/@[^]*[^]*([^]*)/g, (_whole, name: string) =>
    `@${decodeURIComponent(name)}`)
}

function bubbleText(wrapper: { find: (selector: string) => { text: () => string } }): string {
  return readable(wrapper.find('.bubble').text())
}

describe('MessageItem — mention display (W14a)', () => {
  it('renders the mentioned member by its CURRENT name after a rename', () => {
    const wrapper = mountItem({ mentions: [{ agentId: 'fe', label: '小李' }] })
    expect(bubbleText(wrapper)).toBe('@李工 登录页什么时候能好')
  })

  it('falls back to the label snapshot when the member is gone', () => {
    mocks.agentsStore.agents = []
    const wrapper = mountItem({ mentions: [{ agentId: 'fe', label: '小李' }] })
    expect(bubbleText(wrapper)).toBe('@小李 登录页什么时候能好')
  })

  it('leaves a pre-W14a message (no mentions field) exactly as written', () => {
    const wrapper = mountItem({})
    // 老转录没有 mentions 字段 —— 一枚 pill 都长不出来,原文一字不动。
    expect(wrapper.find('.bubble').text()).toBe('@小李 登录页什么时候能好')
  })

  it('renders an agent message the same way (both voices, one rule)', () => {
    const wrapper = mountItem({
      role: 'assistant',
      agentId: 'pm',
      content: '@小李 你接一下',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    expect(bubbleText(wrapper)).toBe('@李工 你接一下')
  })
})
