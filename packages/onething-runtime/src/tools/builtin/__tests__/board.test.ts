import { describe, expect, it, vi } from 'vitest'
import { createBoardTool, type BoardToolAdapters, type BoardToolContext } from '../board.js'
import {
  applyCollabBoardAction,
  emptyCollabBoard,
  type CollabBoard,
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
