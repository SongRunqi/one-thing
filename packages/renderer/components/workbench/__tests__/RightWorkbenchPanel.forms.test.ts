// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RightWorkbenchPanel from '../RightWorkbenchPanel.vue'

/**
 * 右栏两形态(样板 `docs/design/im-redesign/right-panel.html`):
 *
 *  - `session.kind === 'room'` 且 workbench 外壳 → **房间背台**(分段器);
 *  - 其余(直聊/工程面)与 classic 外壳 → **既有工具页签**,一个字节不变。
 *
 * 这一份钉的是分岔本身,以及那条最容易在下一次改动里被弄丢的性质:
 * 切走再切回来,工具页签的状态不许丢(不是销毁重建)。
 */
const mocks = vi.hoisted(() => ({
  editorWorkspace: {
    setWorkspaceRoot: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(undefined),
  },
  electronAPI: {
    listVariables: vi.fn(),
    listTerminals: vi.fn(),
    createTerminal: vi.fn(),
    killTerminal: vi.fn(),
  },
  sessions: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/composables/useEditorWorkspace', () => ({
  useEditorWorkspace: () => mocks.editorWorkspace,
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    sessions: mocks.sessions,
    roomSessions: mocks.sessions.filter(session => session.kind === 'room'),
    findUserDmRoom: () => undefined,
    isUnreadSession: () => false,
  }),
}))

vi.mock('../ThreadChatDetail.vue', () => ({
  default: {
    name: 'ThreadChatDetail',
    props: ['sessionId'],
    template: '<div class="mock-thread">{{ sessionId }}</div>',
  },
}))

/* 三列卡片的看板面板拖着整棵看板树;这一层只需要认出"开出了看板页签"。 */
vi.mock('../CollabBoardPanel.vue', () => ({
  default: { name: 'CollabBoardPanel', template: '<div class="mock-board-panel" />' },
}))

vi.mock('@/components/editor/EditorWorkbench.vue', () => ({
  default: {
    name: 'EditorWorkbench',
    props: ['workspaceRoot', 'initialFilePath', 'active'],
    template: '<div class="mock-editor-workbench">{{ initialFilePath }}</div>',
  },
}))

vi.mock('@/components/terminal/TerminalView.vue', () => ({
  default: {
    name: 'TerminalView',
    props: ['terminalId'],
    template: '<div class="mock-terminal-view">{{ terminalId }}</div>',
  },
}))

/* 背台自己有一份完整单测;这里只需要认出"画的是背台"。 */
vi.mock('../RoomBackstagePanel.vue', () => ({
  default: {
    name: 'RoomBackstagePanel',
    props: ['roomSessionId', 'isDm', 'dmAgentId', 'landing'],
    emits: ['openSession', 'openFile'],
    template: `
      <div class="mock-backstage">
        {{ roomSessionId }}|{{ isDm ? 'dm' : 'group' }}|{{ dmAgentId }}
        <i class="mock-landing">{{ JSON.stringify(landing) }}</i>
      </div>
    `,
  },
}))

const ROOM = { id: 'room-1', kind: 'room', room: { memberAgentIds: ['lin', 'che'] } }
const DM_ROOM = { id: 'dm-1', kind: 'room', room: { dm: true, memberAgentIds: ['lin'] } }
const CHAT = { id: 'chat-1', kind: 'chat' }

type PanelApi = {
  openFile: (filePath: string) => Promise<void>
  openThread: (sessionId: string, title?: string, roomSessionId?: string) => void
  openMembers: (roomSessionId: string, agentId?: string, title?: string) => void
  openBoard: () => void
  openRoomTabs: (roomSessionId: string, thread?: string, opts?: { dmAgentId?: string }) => void
  openAgentTab: (agentId: string) => void
}

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function landing(wrapper: ReturnType<typeof mount>): Record<string, unknown> {
  return JSON.parse(wrapper.find('.mock-landing').text())
}

function toolsFormVisible(wrapper: ReturnType<typeof mount>): boolean {
  const el = wrapper.find('.workbench-tools-form')
  return el.exists() && (el.element as HTMLElement).style.display !== 'none'
}

describe('RightWorkbenchPanel — 右栏两形态', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.sessions = [{ ...ROOM }, { ...DM_ROOM }, { ...CHAT }]
    mocks.electronAPI.listVariables.mockResolvedValue({ success: true, variables: [] })
    mocks.electronAPI.listTerminals.mockResolvedValue({ success: true, terminals: [] })
    Object.defineProperty(window, 'electronAPI', { value: mocks.electronAPI, configurable: true })
  })

  it('房 → 背台;直聊 → 工具页签', () => {
    const room = mount(RightWorkbenchPanel, { props: { sessionId: 'room-1' } })
    expect(room.find('.mock-backstage').text()).toContain('room-1|group')
    expect(toolsFormVisible(room)).toBe(false)

    const chat = mount(RightWorkbenchPanel, { props: { sessionId: 'chat-1' } })
    expect(chat.find('.mock-backstage').exists()).toBe(false)
    expect(toolsFormVisible(chat)).toBe(true)
  })

  it('私聊房带出那一个人(分段器换成「线程 / 空间」)', () => {
    const wrapper = mount(RightWorkbenchPanel, { props: { sessionId: 'dm-1' } })
    expect(wrapper.find('.mock-backstage').text()).toContain('dm-1|dm|lin')
  })

  it('classic 外壳逐像素回滚:房里照旧是工具页签', () => {
    const wrapper = mount(RightWorkbenchPanel, {
      props: { sessionId: 'room-1', shellMode: 'classic' },
    })
    expect(wrapper.find('.mock-backstage').exists()).toBe(false)
    expect(toolsFormVisible(wrapper)).toBe(true)
  })

  /**
   * 切走再切回来,工具页签的状态不许丢。判据有两条:
   *  1. 房面下工具页签那一棵树**仍在 DOM 里**(display:none,不是 v-if 卸载);
   *  2. 切回直聊时,原来那个文件页签还在,而且还是同一个 DOM 节点。
   */
  it('切到房面再切回来:工具页签整棵树留在原地', async () => {
    const wrapper = mount(RightWorkbenchPanel, { props: { sessionId: 'chat-1' } })
    await (wrapper.vm as unknown as PanelApi).openFile('/repo/src/a.ts')
    await settle()
    expect(wrapper.text()).toContain('a.ts')
    const before = wrapper.find('.mock-editor-workbench').element

    await wrapper.setProps({ sessionId: 'room-1' })
    await settle()
    // 背台在画,但页签树没被卸载 —— 只是藏起来了
    expect(wrapper.find('.mock-backstage').exists()).toBe(true)
    expect(toolsFormVisible(wrapper)).toBe(false)
    expect(wrapper.find('.mock-editor-workbench').exists()).toBe(true)

    await wrapper.setProps({ sessionId: 'chat-1' })
    await settle()
    expect(toolsFormVisible(wrapper)).toBe(true)
    expect(wrapper.text()).toContain('a.ts')
    // 同一个 DOM 节点 = 没有重建
    expect(wrapper.find('.mock-editor-workbench').element).toBe(before)
  })

  it('房面下四个外部入口各归各位,且不再开出任何页签', async () => {
    const wrapper = mount(RightWorkbenchPanel, { props: { sessionId: 'room-1' } })
    const api = wrapper.vm as unknown as PanelApi

    api.openThread('work-1', '换核验证')
    await nextTick()
    expect(landing(wrapper)).toMatchObject({ segment: 'threads', threadSessionId: 'work-1' })

    api.openMembers('room-1', 'lin')
    await nextTick()
    expect(landing(wrapper)).toMatchObject({ segment: 'members', agentId: 'lin' })

    api.openBoard()
    await nextTick()
    expect(landing(wrapper)).toMatchObject({ segment: 'board' })

    api.openRoomTabs('room-1')
    await nextTick()
    expect(landing(wrapper)).toMatchObject({ segment: 'threads', threadSessionId: '' })

    // 房外的人也走「成员/空间」格的下钻层,不另开页签
    api.openAgentTab('outsider')
    await nextTick()
    expect(landing(wrapper)).toMatchObject({ segment: 'members', agentId: 'outsider' })

    expect(wrapper.find('.app-tabs-tab').exists()).toBe(false)
  })

  it('直聊下这四个入口行为不变(仍然是页签)', async () => {
    const wrapper = mount(RightWorkbenchPanel, { props: { sessionId: 'chat-1' } })
    const api = wrapper.vm as unknown as PanelApi

    api.openBoard()
    await settle()
    expect(wrapper.text()).toContain('看板')

    api.openThread('work-1', '换核验证', 'room-1')
    await settle()
    expect(wrapper.text()).toContain('线程')
    expect(wrapper.find('.mock-backstage').exists()).toBe(false)
  })
})
