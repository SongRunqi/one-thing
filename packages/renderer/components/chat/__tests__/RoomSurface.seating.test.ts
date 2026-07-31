// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoomSurface from '../room/RoomSurface.vue'
import { OPEN_MEMBERS_EVENT } from '@/components/workbench/room-members'

/**
 * R2 入口之三:**私聊态右栏默认落在空间页**(样板 三 · 私聊)。
 * 群聊照旧落在线程 —— 这一档 R1 已经定,R2 不许改。
 *
 * 两档共用 R1 那条纪律:**只在右栏已经开着时**才落座,窄窗上不许由房面强行把
 * 右栏顶开(那会把 W-Q2 的窗宽策略架空)。
 */
const mocks = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  board: undefined as unknown,
  inspectorOpen: true,
}))

vi.mock('@/platform', () => ({
  platformApi: { emitCommand: vi.fn(), reactToCollabMessage: vi.fn() },
}))

// 房面只在 workbench 下挂载;这里给排版退让闸(shouldUseSayTypography)喂一份
// 出厂默认的设置——用户没有显式排版选择,聊天面档因此生效。真 store 在模块
// 作用域读 localStorage,测试里不能直接引。
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    settings: { ui: { shellMode: 'workbench' }, general: {}, chat: {} },
  }),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({ currentSessionId: 'room-1', sessions: [mocks.session] }),
}))

vi.mock('@/stores/chat', () => ({
  useChatStore: () => ({
    get inspectorOpen() { return mocks.inspectorOpen },
    getSessionPageState: () => undefined,
    getScrollVersion: () => 0,
    getSnapshot: () => null,
    saveSnapshot: vi.fn(),
    loadInitialMessagePage: vi.fn(),
    loadOlderMessages: vi.fn().mockResolvedValue(false),
    loadNewerMessages: vi.fn().mockResolvedValue(false),
  }),
}))

vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({ ensureSubscribed: vi.fn(), boardFor: () => mocks.board }),
}))

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => ({
    displayAgent: (agentId?: string | null) => ({ id: agentId || '', name: '小林' }),
    openAgentSpace: vi.fn(),
  }),
}))

vi.mock('@/composables/useChatSession', () => ({
  useChatSession: () => ({
    messages: ref([]),
    isLoading: ref(false),
    isGenerating: ref(false),
    sendMessage: vi.fn(),
    steerMessage: vi.fn(),
    queueFollowUpMessage: vi.fn(),
    stopGeneration: vi.fn(),
  }),
}))

vi.mock('../say/SayChatFlow.vue', () => ({
  default: { name: 'SayChatFlow', template: '<div class="mock-say-flow" />' },
}))
vi.mock('../InputBox.vue', () => ({
  default: {
    name: 'InputBox',
    setup(_props: unknown, { expose }: { expose: (api: Record<string, unknown>) => void }) {
      expose({
        focus: vi.fn(),
        insertPromptReference: vi.fn(),
        clearInput: vi.fn(),
        restoreSnapshot: vi.fn(),
        getMessageInput: () => '',
        getQuotedText: () => '',
        getAttachments: () => [],
      })
      return {}
    },
    template: '<div class="mock-input-box" />',
  },
}))
vi.mock('../CollabTypingLine.vue', () => ({
  default: { name: 'CollabTypingLine', template: '<div class="mock-typing" />' },
}))
vi.mock('../BackgroundJobsStatusBar.vue', () => ({
  default: { name: 'BackgroundJobsStatusBar', template: '<div class="mock-jobs" />' },
}))
vi.mock('../ComposerReplyBar.vue', () => ({
  default: { name: 'ComposerReplyBar', template: '<div class="mock-reply" />' },
}))

function capture() {
  const members: unknown[] = []
  const threads: unknown[] = []
  const onMembers = (event: Event) => members.push((event as CustomEvent).detail)
  const onThread = (event: Event) => threads.push((event as CustomEvent).detail)
  window.addEventListener(OPEN_MEMBERS_EVENT, onMembers)
  window.addEventListener('onething:open-thread', onThread)
  return {
    members,
    threads,
    stop() {
      window.removeEventListener(OPEN_MEMBERS_EVENT, onMembers)
      window.removeEventListener('onething:open-thread', onThread)
    },
  }
}

describe('RoomSurface — 右栏默认落座', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.inspectorOpen = true
    mocks.board = undefined
  })

  it('私聊:落在空间页,页签叫「空间」(那间房没有"成员"这回事)', () => {
    mocks.session = { id: 'room-1', name: '小林', kind: 'room', room: { memberAgentIds: ['a1'], dm: true } }
    const seen = capture()
    const wrapper = mount(RoomSurface, { props: { sessionId: 'room-1' } })
    seen.stop()

    expect(seen.members).toEqual([{ sessionId: 'room-1', agentId: 'a1', title: '空间' }])
    expect(seen.threads).toHaveLength(0)
    wrapper.unmount()
  })

  it('群聊:照旧落在线程,不碰成员 tab', () => {
    mocks.session = { id: 'room-1', name: '浏览器重构', kind: 'room', room: { memberAgentIds: ['a1', 'a2'] } }
    mocks.board = {
      tasks: [{ id: 'task-abcdefgh', title: '换核验证', status: 'doing', workSessionIds: ['w1'], updatedAt: 1 }],
    }
    const seen = capture()
    const wrapper = mount(RoomSurface, { props: { sessionId: 'room-1' } })
    seen.stop()

    expect(seen.members).toHaveLength(0)
    expect(seen.threads).toEqual([{ workSessionId: 'w1', title: '换核验证', taskId: 'task-abcdefgh' }])
    wrapper.unmount()
  })

  it('右栏收着的时候两档都不落座 —— 房面不许把右栏顶开', () => {
    mocks.inspectorOpen = false
    mocks.session = { id: 'room-1', name: '小林', kind: 'room', room: { memberAgentIds: ['a1'], dm: true } }
    const seen = capture()
    const wrapper = mount(RoomSurface, { props: { sessionId: 'room-1' } })
    seen.stop()

    expect(seen.members).toHaveLength(0)
    expect(seen.threads).toHaveLength(0)
    wrapper.unmount()
  })
})
