/**
 * 协作写路径收进 store action(架构收敛 C4 §4)。
 *
 * 收敛前「写完镜像怎么更新」这条约定散在各个组件里,而且**三种回路**各不相同:
 * 看板靠回复回填快照、房间配置靠 `session:collab-updated` 事件、表情靠
 * `message:updated` 广播。新加一个写入点选错回路或者干脆忘了回填,症状只有
 * "点了没反应",没有任何东西会报错。
 *
 * 这一组钉的是约定现在有了落点:action 自己负责回填,组件只管说话。
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollabBoard } from '@shared/ipc.js'
import { useCollabBoardStore } from '../collabBoard'
import { useSessionsStore } from '../sessions'
import { useChatStore } from '../chat'

const api = vi.hoisted(() => ({
  onSessionEvent: vi.fn(() => () => {}),
  getCollabBoard: vi.fn(),
  getPendingPermissions: vi.fn(),
  actCollabBoard: vi.fn(),
  stopCollabTask: vi.fn(),
  updateCollabRoom: vi.fn(),
  setCollabRoomBudgets: vi.fn(),
  setCollabRoomFrozen: vi.fn(),
  clearCollabRoomHistory: vi.fn(),
  createSession: vi.fn(),
  getSessionsList: vi.fn(),
  reactToCollabMessage: vi.fn(),
}))

vi.mock('@/platform', () => ({ platformApi: api }))

function board(seq: number, title: string): CollabBoard {
  return {
    version: 1,
    seq,
    tasks: [{
      id: 'task-1',
      rev: seq,
      title,
      status: 'todo',
      createdBy: { type: 'user' },
      workSessionIds: [],
      rejections: 0,
      createdAt: 0,
      updatedAt: 0,
    }],
  } as CollabBoard
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  api.getPendingPermissions.mockResolvedValue({ success: true, pending: [] })
  api.getSessionsList.mockResolvedValue({ success: true, sessions: [] })
})

describe('collabBoard 写 action:回填约定 = 回复带的那份快照', () => {
  it('写成功当场落账,不用等 30ms 合并广播', async () => {
    const store = useCollabBoardStore()
    api.actCollabBoard.mockResolvedValue({ success: true, board: board(2, '写登录页(已移动)') })

    const response = await store.actBoard('room-1', {
      action: 'move',
      taskId: 'task-1',
      status: 'done',
      expectedRev: 1,
    } as never)

    expect(api.actCollabBoard).toHaveBeenCalledWith('room-1', expect.objectContaining({ action: 'move' }))
    expect(response.success).toBe(true)
    expect(store.boardFor('room-1')?.tasks[0].title).toBe('写登录页(已移动)')
  })

  it('被拒但带板的回复照样重画 —— 冲突提示的底气', async () => {
    const store = useCollabBoardStore()
    store.applySnapshot('room-1', board(1, '写登录页'))
    api.actCollabBoard.mockResolvedValue({
      success: false,
      error: 'Task task-1 changed (rev 7)',
      board: board(7, '写登录页(已被他人改名)'),
    })

    const response = await store.actBoard('room-1', { action: 'move' } as never)

    expect(response.success).toBe(false)
    expect(store.boardFor('room-1')?.tasks[0].title).toBe('写登录页(已被他人改名)')
  })

  it('不带板的失败不动账本 —— 屏幕上还是刚才那份', async () => {
    const store = useCollabBoardStore()
    store.applySnapshot('room-1', board(3, '写登录页'))
    api.actCollabBoard.mockResolvedValue({ success: false, error: 'Not a room session' })

    await store.actBoard('room-1', { action: 'move' } as never)

    expect(store.boardFor('room-1')?.tasks[0].title).toBe('写登录页')
    expect(store.boardFor('room-1')?.seq).toBe(3)
  })

  it('桥抛错不吞:错抛给调用方,提示语归 UI', async () => {
    const store = useCollabBoardStore()
    api.actCollabBoard.mockRejectedValue(new Error('bridge down'))
    await expect(store.actBoard('room-1', { action: 'move' } as never)).rejects.toThrow('bridge down')
  })

  it('停止执行:卡的收敛跟着广播回来,回复带板也照收', async () => {
    const store = useCollabBoardStore()
    api.stopCollabTask.mockResolvedValue({ success: true, stopped: true })

    const response = await store.stopTask('room-1', 'task-1')

    expect(api.stopCollabTask).toHaveBeenCalledWith('room-1', 'task-1')
    expect(response.stopped).toBe(true)
  })
})

describe('sessions 房间配置 action:回填约定 = session:collab-updated', () => {
  it('写完不重拉会话表 —— 镜像等事件推回来', async () => {
    const sessions = useSessionsStore()
    api.updateCollabRoom.mockResolvedValue({ success: true })
    api.setCollabRoomBudgets.mockResolvedValue({ success: true })
    api.setCollabRoomFrozen.mockResolvedValue({ success: true })

    await sessions.updateCollabRoom('room-1', { pmAgentId: 'fe' })
    await sessions.setCollabRoomBudgets('room-1', { dailyCostUSD: 8 })
    await sessions.setCollabRoomFrozen('room-1', true)

    expect(api.updateCollabRoom).toHaveBeenCalledWith('room-1', { pmAgentId: 'fe' })
    expect(api.setCollabRoomBudgets).toHaveBeenCalledWith('room-1', { dailyCostUSD: 8 })
    expect(api.setCollabRoomFrozen).toHaveBeenCalledWith('room-1', true)
    // 这就是 C4-α 的成果:七处全量重拉换成一条就地增量事件。
    expect(api.getSessionsList).not.toHaveBeenCalled()
  })

  it('失败原样返回,store 不替谁决定怎么说话', async () => {
    const sessions = useSessionsStore()
    api.updateCollabRoom.mockResolvedValue({ success: false, error: '负责人必须是房间成员' })
    await expect(sessions.updateCollabRoom('room-1', { pmAgentId: 'x' }))
      .resolves.toEqual({ success: false, error: '负责人必须是房间成员' })
  })

  it('建房是"加一行":那一次全量重拉在 action 里,调用方不用记得刷', async () => {
    const sessions = useSessionsStore()
    api.createSession.mockResolvedValue({ success: true, session: { id: 'room-9', name: '新群' } })

    const response = await sessions.createCollabRoom('新群', { memberAgentIds: ['fe'] })

    expect(api.createSession).toHaveBeenCalledWith('新群', {
      kind: 'room',
      room: { memberAgentIds: ['fe'] },
    })
    expect(response.session?.id).toBe('room-9')
    expect(api.getSessionsList).toHaveBeenCalled()
  })

  it('建房失败不重拉', async () => {
    const sessions = useSessionsStore()
    api.createSession.mockResolvedValue({ success: false, error: '创建失败' })
    await sessions.createCollabRoom('新群', { memberAgentIds: [] })
    expect(api.getSessionsList).not.toHaveBeenCalled()
  })

  it('清空转录动的不是配置,所以那一次重拉也在 action 里', async () => {
    const sessions = useSessionsStore()
    api.clearCollabRoomHistory.mockResolvedValue({ success: true })

    await sessions.clearCollabRoomHistory('room-1', true)

    expect(api.clearCollabRoomHistory).toHaveBeenCalledWith('room-1', true)
    expect(api.getSessionsList).toHaveBeenCalled()
  })
})

describe('chat 表情 action:回填约定 = message:updated 广播', () => {
  it('过桥的每个参数都是原始值,一个字都不乐观写', async () => {
    const chat = useChatStore()
    api.reactToCollabMessage.mockResolvedValue({ success: true })

    await chat.reactToCollabMessage('room-1', 'msg-1', '👍', { type: 'user' })

    expect(api.reactToCollabMessage).toHaveBeenCalledWith('room-1', 'msg-1', '👍', { type: 'user' })
    // 乐观写会让被拒的那一次留下痕迹;这里没有本地状态可查,正是"不写"的证据。
    expect(chat.sessionMessages.get('room-1')).toBeUndefined()
  })

  it('被拒的回复原样返回,由调用方留下失败痕迹', async () => {
    const chat = useChatStore()
    api.reactToCollabMessage.mockResolvedValue({ success: false, error: '这个表情不在调色板里' })
    await expect(chat.reactToCollabMessage('room-1', 'msg-1', '🦄', { type: 'user' }))
      .resolves.toEqual({ success: false, error: '这个表情不在调色板里' })
  })
})
