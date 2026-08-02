// @vitest-environment happy-dom
/**
 * W16 panel behaviour: the card menu writes through COLLAB_BOARD_ACT, and the
 * W9b fields the board has carried since W9b (blockReason / haltedCount /
 * report.evidence) are finally on the card face.
 */
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollabBoard, CollabTask } from '@shared/ipc.js'
import CollabBoardPanel from '../CollabBoardPanel.vue'
import { useSessionsStore } from '@/stores/sessions'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'

const mocks = vi.hoisted(() => ({
  platformApi: {
    getCollabBoard: vi.fn(),
    actCollabBoard: vi.fn(),
    setCollabRoomFrozen: vi.fn(),
    setCollabRoomBudgets: vi.fn(),
    listAgents: vi.fn(),
    onSessionEvent: vi.fn(() => () => {}),
    openPath: vi.fn(),
    getPendingPermissions: vi.fn(),
  },
}))

vi.mock('@/platform', () => ({ platformApi: mocks.platformApi }))

const ROSTER = [
  { id: 'pm', name: '阿明', avatar: '📋' },
  { id: 'fe', name: '小李', avatar: '🔧' },
]

function card(patch: Partial<CollabTask> = {}): CollabTask {
  return {
    id: 'task-1',
    rev: 3,
    title: '写登录页',
    status: 'todo',
    createdBy: { type: 'user' },
    workSessionIds: [],
    rejections: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

function board(tasks: CollabTask[]): CollabBoard {
  return { version: 1, tasks }
}

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountPanel(tasks: CollabTask[], options: { workingDirectory?: string } = {}) {
  mocks.platformApi.getCollabBoard.mockResolvedValue({ success: true, board: board(tasks) })
  const sessions = useSessionsStore()
  sessions.sessions = [{
    id: 'room-1',
    name: '产品群',
    kind: 'room',
    room: { memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' },
    ...(options.workingDirectory ? { workingDirectory: options.workingDirectory } : {}),
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  }] as never
  const agents = useAgentsStore()
  agents.agents = ROSTER as never
  const wrapper = mount(CollabBoardPanel, { attachTo: document.body })
  await settle()
  return wrapper
}

/** Open the card's ⋯ menu and click the row whose label reads `label`. */
async function pick(wrapper: Awaited<ReturnType<typeof mountPanel>>, label: string) {
  await wrapper.find('.board-card-more').trigger('click')
  await settle()
  const row = document.querySelectorAll<HTMLButtonElement>('.app-context-item')
  const target = [...row].find(item => item.textContent?.trim() === label)
  expect(target, `menu row 「${label}」`).toBeTruthy()
  target?.click()
  await settle()
}

describe('CollabBoardPanel card actions (W16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    // The panel hydrates the agent roster on setup — an empty reply here would
    // overwrite the seeded names and every menu row would fall back to the id.
    mocks.platformApi.listAgents.mockResolvedValue({ success: true, agents: ROSTER })
    mocks.platformApi.onSessionEvent.mockReturnValue(() => {})
    mocks.platformApi.actCollabBoard.mockResolvedValue({ success: true, board: board([]) })
    mocks.platformApi.getPendingPermissions.mockResolvedValue({ success: true, pending: [] })
    mocks.platformApi.setCollabRoomFrozen.mockResolvedValue({ success: true })
    mocks.platformApi.setCollabRoomBudgets.mockResolvedValue({ success: true })
  })

  it('moves a card through the IPC with the rev the user saw', async () => {
    const wrapper = await mountPanel([card()])
    await pick(wrapper, '移到 完成')
    expect(mocks.platformApi.actCollabBoard).toHaveBeenCalledWith('room-1', {
      action: 'move',
      taskId: 'task-1',
      status: 'done',
      expectedRev: 3,
    })
  })

  it('assigns to a room member picked by name', async () => {
    const wrapper = await mountPanel([card()])
    await pick(wrapper, '指派给 🔧 小李')
    expect(mocks.platformApi.actCollabBoard).toHaveBeenCalledWith('room-1', {
      action: 'assign',
      taskId: 'task-1',
      assigneeAgentId: 'fe',
      expectedRev: 3,
    })
  })

  it('re-queues a blocked card back to todo (the W9b.1 requeue signal)', async () => {
    const wrapper = await mountPanel([card({ status: 'blocked', assigneeAgentId: 'fe', rev: 5 })])
    await pick(wrapper, '重新排队')
    expect(mocks.platformApi.actCollabBoard).toHaveBeenCalledWith('room-1', {
      action: 'move',
      taskId: 'task-1',
      status: 'todo',
      expectedRev: 5,
    })
  })

  it('repaints from the returned board and says so on a rev conflict', async () => {
    const wrapper = await mountPanel([card()])
    mocks.platformApi.actCollabBoard.mockResolvedValue({
      success: false,
      error: 'Task task-1 changed (rev 7) — re-read the board (action:"list") and retry with the current rev',
      board: board([card({ rev: 7, title: '写登录页(已被改名)', status: 'doing' })]),
    })
    await pick(wrapper, '移到 完成')
    expect(wrapper.find('.board-hint').text()).toBe('看板已被他人更新,已刷新')
    expect(wrapper.text()).toContain('写登录页(已被改名)')
  })

  it('shows a non-conflict refusal verbatim instead of the refresh line', async () => {
    const wrapper = await mountPanel([card()])
    mocks.platformApi.actCollabBoard.mockResolvedValue({ success: false, error: 'Not a room session' })
    await pick(wrapper, '移到 完成')
    expect(wrapper.find('.board-hint').text()).toBe('Not a room session')
  })

  /**
   * 写路径经 store action(架构收敛 C4 §4)。
   *
   * 桩掉 action 之后桥应该一次都不被碰到 —— 这就是"回填约定有落点"的可执行
   * 证据:面板不再自己知道写完要 applySnapshot,新加一个写入点也漏不掉。
   */
  it('writes through the board store action, not the bridge', async () => {
    const boardStore = useCollabBoardStore()
    const actBoard = vi.spyOn(boardStore, 'actBoard')
      .mockResolvedValue({ success: true, board: board([]) } as never)
    const wrapper = await mountPanel([card()])

    await pick(wrapper, '移到 完成')

    expect(actBoard).toHaveBeenCalledWith('room-1', {
      action: 'move',
      taskId: 'task-1',
      status: 'done',
      expectedRev: 3,
    })
    expect(mocks.platformApi.actCollabBoard).not.toHaveBeenCalled()
  })

  it('stops a running card through the board store action', async () => {
    const boardStore = useCollabBoardStore()
    const stopTask = vi.spyOn(boardStore, 'stopTask')
      .mockResolvedValue({ success: true, stopped: true } as never)
    const wrapper = await mountPanel([card({ status: 'doing', assigneeAgentId: 'fe', workSessionIds: ['work-1'] })])

    await pick(wrapper, '停止执行')

    expect(stopTask).toHaveBeenCalledWith('room-1', 'task-1')
  })
})

describe('CollabBoardPanel card face (W9b fields)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    // The panel hydrates the agent roster on setup — an empty reply here would
    // overwrite the seeded names and every menu row would fall back to the id.
    mocks.platformApi.listAgents.mockResolvedValue({ success: true, agents: ROSTER })
    mocks.platformApi.onSessionEvent.mockReturnValue(() => {})
  })

  it('puts the block reason and the halt count on a blocked card', async () => {
    const wrapper = await mountPanel([card({
      status: 'blocked',
      blockReason: 'write/bash/edit 均返回 Tool not available',
      haltedCount: 2,
    })])
    const note = wrapper.find('.board-card-note')
    expect(note.text()).toBe('write/bash/edit 均返回 Tool not available')
    // Full text stays reachable when the two-line clamp bites.
    expect(note.attributes('title')).toBe('write/bash/edit 均返回 Tool not available')
    expect(wrapper.text()).toContain('受阻×2')
  })

  it('stamps the execution receipt on a done card', async () => {
    const wrapper = await mountPanel([card({
      status: 'done',
      report: { summary: '搞定了', evidence: { toolCounts: { write: 1, read: 2 } } },
    })])
    expect(wrapper.find('.board-card-note').text()).toBe('执行记录: read×2, write×1')
  })

  it('calls out a done card no tool call ever backed', async () => {
    const wrapper = await mountPanel([card({ status: 'done', report: { summary: '已验证文件存在' } })])
    expect(wrapper.find('.board-card-note').text()).toBe('无执行记录')
  })

  it('leaves an in-flight card face untouched', async () => {
    const wrapper = await mountPanel([card({ status: 'doing' })])
    expect(wrapper.find('.board-card-note').exists()).toBe(false)
  })
})

describe('CollabBoardPanel 交付物 (W17)', () => {
  function delivered(patch: Partial<CollabTask>, files: string[]): CollabTask {
    return card({
      status: 'done',
      ...patch,
      report: { summary: '交付', evidence: { toolCounts: { write: files.length }, files } },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    mocks.platformApi.listAgents.mockResolvedValue({ success: true, agents: ROSTER })
    mocks.platformApi.onSessionEvent.mockReturnValue(() => {})
    mocks.platformApi.openPath.mockResolvedValue('')
  })

  it('lists the card’s files by name, full path on hover', async () => {
    const wrapper = await mountPanel(
      [delivered({}, ['src/app/main.ts'])],
      { workingDirectory: '/repo' },
    )
    const file = wrapper.find('.board-card-files .deliverable-file')
    expect(file.text()).toBe('main.ts')
    expect(file.attributes('title')).toBe('/repo/src/app/main.ts')
  })

  it('caps the card face at three files and counts the rest', async () => {
    const wrapper = await mountPanel(
      [delivered({}, ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'])],
      { workingDirectory: '/repo' },
    )
    expect(wrapper.findAll('.board-card-files .deliverable-file')).toHaveLength(3)
    expect(wrapper.find('.board-card-files-more').text()).toBe('+2')
  })

  it('renders no file row for a pre-W17 card', async () => {
    const wrapper = await mountPanel([card({
      status: 'done',
      report: { summary: '搞定了', evidence: { toolCounts: { write: 1 } } },
    })])
    expect(wrapper.find('.board-card-files').exists()).toBe(false)
    // The W9b receipt is untouched by W17.
    expect(wrapper.find('.board-card-note').text()).toBe('执行记录: write×1')
  })

  it('opens the resolved absolute path from the card without opening the session', async () => {
    const wrapper = await mountPanel(
      [delivered({ workSessionIds: ['work-1'] }, ['src/a.ts'])],
      { workingDirectory: '/repo' },
    )
    await wrapper.find('.board-card-files .deliverable-file').trigger('click')
    await settle()
    expect(mocks.platformApi.openPath).toHaveBeenCalledWith('/repo/src/a.ts')
  })

  it('says so instead of guessing when the room has no working directory', async () => {
    const wrapper = await mountPanel([delivered({}, ['src/a.ts'])])
    await wrapper.find('.board-card-files .deliverable-file').trigger('click')
    await settle()
    expect(mocks.platformApi.openPath).not.toHaveBeenCalled()
    expect(wrapper.find('.board-hint').text()).toContain('工作目录')
  })

  it('switches to a per-task deliverables view and back', async () => {
    const wrapper = await mountPanel([
      delivered({ id: 'task-1', title: '写登录页', updatedAt: 2 }, ['src/login.ts']),
      delivered({ id: 'task-2', title: '补文档', updatedAt: 1 }, ['docs/readme.md']),
      card({ id: 'task-3', title: '没产出' }),
    ], { workingDirectory: '/repo' })

    const toggle = wrapper.find('.board-view-toggle')
    expect(toggle.text()).toContain('2')  // distinct files across the board
    await toggle.trigger('click')
    await settle()

    expect(wrapper.find('.board-columns').exists()).toBe(false)
    const groups = wrapper.findAll('.deliverable-group')
    expect(groups).toHaveLength(2)
    expect(groups[0].find('.deliverable-task').text()).toBe('写登录页')
    expect(groups[0].find('.deliverable-name').text()).toBe('login.ts')
    expect(groups[0].find('.deliverable-dir').text()).toBe('src')
    expect(wrapper.text()).not.toContain('没产出')

    await wrapper.find('.board-view-toggle').trigger('click')
    await settle()
    expect(wrapper.find('.board-columns').exists()).toBe(true)
  })

  it('opens a file from the aggregate view too', async () => {
    const wrapper = await mountPanel(
      [delivered({}, ['docs/readme.md'])],
      { workingDirectory: '/repo' },
    )
    await wrapper.find('.board-view-toggle').trigger('click')
    await settle()
    await wrapper.find('.board-deliverables .deliverable-file').trigger('click')
    await settle()
    expect(mocks.platformApi.openPath).toHaveBeenCalledWith('/repo/docs/readme.md')
  })

  it('shows a one-line empty state when nothing has been produced yet', async () => {
    const wrapper = await mountPanel([card()], { workingDirectory: '/repo' })
    await wrapper.find('.board-view-toggle').trigger('click')
    await settle()
    expect(wrapper.find('.board-deliverables').text()).toContain('还没有交付物')
  })
})

/**
 * R6 / P1-4 — the two room-wide switches used to `.catch(() => {})` and reload
 * regardless, so a refused write repainted the control back to where it was
 * with nothing said. A brake that silently springs back is worse than one that
 * refuses out loud.
 */
describe('CollabBoardPanel 刹车反馈 (P1-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    mocks.platformApi.listAgents.mockResolvedValue({ success: true, agents: ROSTER })
    mocks.platformApi.onSessionEvent.mockReturnValue(() => {})
    mocks.platformApi.getPendingPermissions.mockResolvedValue({ success: true, pending: [] })
  })

  it('says so when the freeze is refused, and does not reload as if it worked', async () => {
    mocks.platformApi.setCollabRoomFrozen.mockResolvedValue({
      success: false,
      error: 'Not a room session',
    })
    const wrapper = await mountPanel([card()])
    const sessions = useSessionsStore()
    const loadSessions = vi.spyOn(sessions, 'loadSessions').mockResolvedValue(undefined as never)

    await wrapper.find('.board-freeze').trigger('click')
    await settle()

    expect(wrapper.find('.board-hint').text()).toContain('Not a room session')
    expect(loadSessions).not.toHaveBeenCalled()
  })

  it('surfaces a thrown bridge error rather than swallowing it', async () => {
    mocks.platformApi.setCollabRoomFrozen.mockRejectedValue(new Error('bridge down'))
    const wrapper = await mountPanel([card()])

    await wrapper.find('.board-freeze').trigger('click')
    await settle()

    expect(wrapper.find('.board-hint').text()).toContain('bridge down')
  })

  /**
   * 架构收敛 C4 §3:成功之后**不再**全量重拉会话表 —— 冻结开关的新位置由主进程
   * 的 `session:collab-updated` 推回来,会话列表就地合并那一行。
   *
   * 这一条因此从"成功要 reload"翻成"成功也不该 reload":为一个布尔字段重拉整张
   * 会话表是这次收敛拆掉的七处之一,而这里正是其中之一。
   */
  it('leaves no hint and does NOT reload the session list when the freeze lands', async () => {
    mocks.platformApi.setCollabRoomFrozen.mockResolvedValue({ success: true })
    const wrapper = await mountPanel([card()])
    const sessions = useSessionsStore()
    const loadSessions = vi.spyOn(sessions, 'loadSessions').mockResolvedValue(undefined as never)

    await wrapper.find('.board-freeze').trigger('click')
    await settle()

    expect(wrapper.find('.board-hint').exists()).toBe(false)
    expect(loadSessions).not.toHaveBeenCalled()
  })

  it('reports a refused budget write on the same line', async () => {
    mocks.platformApi.setCollabRoomBudgets.mockResolvedValue({
      success: false,
      error: 'Not a room session',
    })
    const wrapper = await mountPanel([card()])

    await wrapper.find('.board-budget').trigger('click')
    await settle()
    const input = wrapper.find('.board-budget-input')
    await input.setValue(12)
    await input.trigger('blur')
    await settle()

    expect(mocks.platformApi.setCollabRoomBudgets).toHaveBeenCalledWith('room-1', { dailyCostUSD: 12 })
    expect(wrapper.find('.board-hint').text()).toContain('Not a room session')
  })
})
