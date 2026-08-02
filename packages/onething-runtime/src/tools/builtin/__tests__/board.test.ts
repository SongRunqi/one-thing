import { describe, expect, it, vi } from 'vitest'
import { createBoardTool, type BoardToolAdapters, type BoardToolContext } from '../board.js'
import {
  COLLAB_BOARD_START_RECEIPT_NOTE,
  applyCollabBoardAction,
  emptyCollabBoard,
  type CollabBoard,
  type CollabTask,
} from '../../../collab/index.js'

const NAMES: Record<string, string> = { fe: '小李', research: '小研', pm: '阿明' }

/** 小李 owns 重构首页, 小研 owns 竞品调研 — the mixed board of the W10 事故. */
function seededBoard(): CollabBoard {
  const input = { now: 1000, createId: (() => { let n = 0; return () => `task-${++n}` })() }
  const pm = { type: 'agent' as const, agentId: 'pm' }
  const first = applyCollabBoardAction(
    emptyCollabBoard(),
    { action: 'create', title: '重构首页', assigneeAgentId: 'fe' },
    pm,
    input,
  )
  return applyCollabBoardAction(
    first.board,
    { action: 'create', title: '竞品调研', assigneeAgentId: 'research' },
    pm,
    input,
  ).board
}

function toolFor(context: BoardToolContext | null) {
  const board = seededBoard()
  const adapters: BoardToolAdapters = {
    resolveContext: () => context,
    resolveMember: (_room, nameOrId) =>
      Object.keys(NAMES).find(id => id === nameOrId || NAMES[id] === nameOrId) ?? null,
    agentName: id => NAMES[id] ?? id,
    applyAction: async () => ({ board }),
  }
  return createBoardTool(adapters)
}

function ctx() {
  return { sessionId: 'session-1', messageId: 'message-1', metadata: vi.fn() } as never
}

describe('board tool perspective (W10)', () => {
  it('renders the calling agent own cards as 你(名字)', async () => {
    const tool = toolFor({ roomSessionId: 'room-1', actorAgentId: 'research' })
    const result = await tool.execute({ action: 'list' }, ctx())
    expect(result.output).toContain('「竞品调研」 @你(小研)')
    expect(result.output).not.toContain('「竞品调研」 @小研')
    // 别人的卡不变 —— 只有自称视角是错的,他称是对的。
    expect(result.output).toContain('「重构首页」 @小李')
  })

  it('leaves the board third-person for the user side (no actorAgentId)', async () => {
    const tool = toolFor({ roomSessionId: 'room-1' })
    const result = await tool.execute({ action: 'list' }, ctx())
    expect(result.output).toContain('@小研')
    expect(result.output).not.toContain('你(')
  })

  it('follows the work-session actor too — the assignee reads its own card', async () => {
    const tool = toolFor({ roomSessionId: 'room-1', actorAgentId: 'fe' })
    const result = await tool.execute({ action: 'list' }, ctx())
    expect(result.output).toContain('「重构首页」 @你(小李)')
    expect(result.output).toContain('「竞品调研」 @小研')
  })

  it('still says nothing about a room-less session', async () => {
    const tool = toolFor(null)
    const result = await tool.execute({ action: 'list' }, ctx())
    expect(result.output).toContain('no room board')
  })
})

/**
 * `start` 的回执必须说出「工作会话已在后台开启」(架构收敛 C3-5,审计 §7 第 4 项)。
 *
 * 此前它与 assign/move 共用同一行 `start ok: #… [doing] rev2` —— 一次派生了一整条
 * 工作会话的动作,回执里对此只字不提。模型据此推断"我只是把卡挪了个列",于是接着
 * 在这一轮里自己动手干那件重活,而后台那条工作会话正在同一张卡上跑。
 */
describe('board start 回执 (C3-5)', () => {
  function toolWithResult(result: { board: CollabBoard; task?: CollabTask }) {
    const adapters: BoardToolAdapters = {
      resolveContext: () => ({ roomSessionId: 'room-1', actorAgentId: 'fe' }),
      resolveMember: (_room, nameOrId) => nameOrId,
      agentName: id => NAMES[id] ?? id,
      applyAction: async () => result,
    }
    return createBoardTool(adapters)
  }

  const doingCard = {
    id: 'task-abcdef01', title: '重构首页', status: 'doing', rev: 2,
    assigneeAgentId: 'fe', createdAt: 1000, updatedAt: 1000, rejections: 0,
    workSessionIds: [], history: [],
  } as unknown as CollabTask

  it('开成了就说 —— 卡进 doing 时回执带那一句', async () => {
    const tool = toolWithResult({ board: seededBoard(), task: doingCard })
    const result = await tool.execute({ action: 'start', taskId: doingCard.id }, ctx())
    expect(result.output).toContain(COLLAB_BOARD_START_RECEIPT_NOTE)
    // 原来的 headline 一字不动 —— 这是**追加**,不是改写。
    expect(result.output).toContain('start ok: #task-abc')
  })

  it('别的动作不带这一句(它只对 start 为真)', async () => {
    const tool = toolWithResult({ board: seededBoard(), task: doingCard })
    const result = await tool.execute({ action: 'move', taskId: doingCard.id, status: 'doing' }, ctx())
    expect(result.output).not.toContain(COLLAB_BOARD_START_RECEIPT_NOTE)
  })

  it('没真的进 doing(被拒/无卡)就不承诺开了会话', async () => {
    const tool = toolWithResult({ board: seededBoard() })
    const result = await tool.execute({ action: 'start', taskId: 'nope' }, ctx())
    expect(result.output).not.toContain(COLLAB_BOARD_START_RECEIPT_NOTE)
  })
})
