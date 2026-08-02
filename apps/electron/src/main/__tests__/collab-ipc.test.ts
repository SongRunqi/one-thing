/**
 * COLLAB_ROOM_UPDATE handler wiring (W6). The handler owns exactly one job:
 * carry the patch across untouched, forwarding only the fields the caller
 * actually sent (an `undefined` that reached the app layer would read as
 * "clear the PM" for pmAgentId), and turn a thrown error into a wire failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc.js'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, request: unknown) => unknown>(),
  setCollabRoomConfig: vi.fn(() => ({ success: true })),
  ensureUserDmRoom: vi.fn((_agentId: string): string | null => 'agent-dm-fe'),
  reactToCollabMessage: vi.fn(() => ({ success: true, reactions: [] })),
  applyUserCollabBoardAction: vi.fn(async () => ({ success: true, board: { version: 1, tasks: [] } })),
  clearCollabRoomHistory: vi.fn(async () => ({ success: true, clearedMessageCount: 3 })),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, request: unknown) => unknown) => {
      mocks.handlers.set(channel, handler)
    },
  },
}))

vi.mock('@onething/app/collab/board-store.js', () => ({ loadCollabBoard: () => ({ version: 1, tasks: [] }) }))

vi.mock('@onething/app/collab/index.js', () => ({
  setCollabRoomBudgets: () => true,
  setCollabRoomFrozen: () => true,
  setCollabRoomConfig: (...args: unknown[]) => mocks.setCollabRoomConfig(...(args as [])),
  ensureUserDmRoom: (...args: unknown[]) => mocks.ensureUserDmRoom(...(args as [string])),
  reactToCollabMessage: (...args: unknown[]) => mocks.reactToCollabMessage(...(args as [])),
  applyUserCollabBoardAction: (...args: unknown[]) => mocks.applyUserCollabBoardAction(...(args as [])),
  clearCollabRoomHistory: (...args: unknown[]) => mocks.clearCollabRoomHistory(...(args as [])),
}))

const { registerCollabHandlers } = await import('../ipc/collab.js')

function invoke(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_ROOM_UPDATE)?.({}, request)
}

function invokeReact(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_MESSAGE_REACT)?.({}, request)
}

function invokeAct(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_BOARD_ACT)?.({}, request)
}

function invokeEnsureDm(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_DM_ROOM_ENSURE)?.({}, request)
}

function invokeClearHistory(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_ROOM_CLEAR_HISTORY)?.({}, request)
}

const EMPTY_BOARD = { version: 1, tasks: [] }

beforeEach(() => {
  mocks.handlers.clear()
  mocks.setCollabRoomConfig.mockClear()
  mocks.setCollabRoomConfig.mockReturnValue({ success: true })
  mocks.ensureUserDmRoom.mockClear()
  mocks.ensureUserDmRoom.mockReturnValue('agent-dm-fe')
  mocks.reactToCollabMessage.mockClear()
  mocks.reactToCollabMessage.mockReturnValue({ success: true, reactions: [] })
  mocks.applyUserCollabBoardAction.mockClear()
  mocks.applyUserCollabBoardAction.mockResolvedValue({ success: true, board: EMPTY_BOARD })
  mocks.clearCollabRoomHistory.mockClear()
  mocks.clearCollabRoomHistory.mockResolvedValue({ success: true, clearedMessageCount: 3 })
  registerCollabHandlers()
})

describe('COLLAB_ROOM_UPDATE', () => {
  it('forwards only the fields present in the request', () => {
    expect(invoke({ roomSessionId: 'room-1', memberAgentIds: ['pm'] })).toEqual({ success: true })
    expect(mocks.setCollabRoomConfig).toHaveBeenCalledWith('room-1', { memberAgentIds: ['pm'] })
  })

  it('keeps an explicit null PM (clear) distinct from an absent one', () => {
    invoke({ roomSessionId: 'room-1', pmAgentId: null })
    expect(mocks.setCollabRoomConfig).toHaveBeenCalledWith('room-1', { pmAgentId: null })
  })

  it('passes the app layer error through instead of a bare boolean', () => {
    mocks.setCollabRoomConfig.mockReturnValue({ success: false, error: 'PM must be a room member' } as never)
    expect(invoke({ roomSessionId: 'room-1', pmAgentId: 'ghost' }))
      .toEqual({ success: false, error: 'PM must be a room member' })
  })

  it('turns a thrown error into a failed response', () => {
    mocks.setCollabRoomConfig.mockImplementation(() => { throw new Error('store exploded') })
    expect(invoke({ roomSessionId: 'room-1', name: 'x' }))
      .toEqual({ success: false, error: 'store exploded' })
  })
})

describe('COLLAB_BOARD_ACT (W16)', () => {
  it('carries the action across verbatim — the reducer owns what is legal', async () => {
    const action = { action: 'move', taskId: 't1', status: 'done', expectedRev: 4 }
    await expect(invokeAct({ roomSessionId: 'room-1', action })).resolves
      .toEqual({ success: true, board: EMPTY_BOARD })
    expect(mocks.applyUserCollabBoardAction).toHaveBeenCalledWith('room-1', action)
  })

  it('never lets the renderer choose the actor (user is pinned app-side)', async () => {
    await invokeAct({
      roomSessionId: 'room-1',
      action: { action: 'complete', taskId: 't1', summary: 's' },
      actor: { type: 'agent', agentId: 'fe' },
    })
    expect(mocks.applyUserCollabBoardAction).toHaveBeenCalledWith('room-1', {
      action: 'complete',
      taskId: 't1',
      summary: 's',
    })
  })

  it('returns the rev conflict WITH the fresh board so the panel can repaint', async () => {
    mocks.applyUserCollabBoardAction.mockResolvedValue({
      success: false,
      error: 'Task t1 changed (rev 7) — re-read the board (action:"list") and retry with the current rev',
      board: EMPTY_BOARD,
    } as never)
    await expect(invokeAct({
      roomSessionId: 'room-1',
      action: { action: 'move', taskId: 't1', status: 'done', expectedRev: 4 },
    })).resolves.toEqual({
      success: false,
      error: 'Task t1 changed (rev 7) — re-read the board (action:"list") and retry with the current rev',
      board: EMPTY_BOARD,
    })
  })

  it('passes the room validation refusal through', async () => {
    mocks.applyUserCollabBoardAction.mockResolvedValue({ success: false, error: 'Not a room session' } as never)
    await expect(invokeAct({ roomSessionId: 'chat-1', action: { action: 'list' } }))
      .resolves.toEqual({ success: false, error: 'Not a room session' })
  })

  it('refuses an action-less request instead of calling the app layer', async () => {
    await expect(invokeAct({ roomSessionId: 'room-1' }))
      .resolves.toEqual({ success: false, error: 'Missing board action' })
    expect(mocks.applyUserCollabBoardAction).not.toHaveBeenCalled()
  })

  it('turns a thrown error into a failed response', async () => {
    mocks.applyUserCollabBoardAction.mockRejectedValue(new Error('store exploded'))
    await expect(invokeAct({ roomSessionId: 'room-1', action: { action: 'list' } }))
      .resolves.toEqual({ success: false, error: 'store exploded' })
  })
})

describe('COLLAB_MESSAGE_REACT (W8)', () => {
  it('carries the four fields across in order', () => {
    const actor = { type: 'user' as const }
    expect(invokeReact({ roomSessionId: 'room-1', messageId: 'm1', emoji: '\u{1F44D}', actor }))
      .toEqual({ success: true, reactions: [] })
    expect(mocks.reactToCollabMessage).toHaveBeenCalledWith('room-1', 'm1', '\u{1F44D}', actor)
  })

  it('passes the app layer refusal through (palette / room validation lives there)', () => {
    mocks.reactToCollabMessage.mockReturnValue({ success: false, error: 'Unsupported reaction emoji' } as never)
    expect(invokeReact({ roomSessionId: 'room-1', messageId: 'm1', emoji: '\u{1F680}', actor: { type: 'user' } }))
      .toEqual({ success: false, error: 'Unsupported reaction emoji' })
  })

  it('turns a thrown error into a failed response', () => {
    mocks.reactToCollabMessage.mockImplementation(() => { throw new Error('store exploded') })
    expect(invokeReact({ roomSessionId: 'room-1', messageId: 'm1', emoji: '\u{1F44D}', actor: { type: 'user' } }))
      .toEqual({ success: false, error: 'store exploded' })
  })

  /**
   * P2-20: the actor is pinned here, exactly like COLLAB_BOARD_ACT pins it. A
   * reaction is attribution — §3.5 B makes a silent member's emoji its ANSWER —
   * so a renderer able to name the actor could put words in a member's mouth.
   */
  it('pins the actor to the user, whatever the renderer claims', () => {
    invokeReact({
      roomSessionId: 'room-1',
      messageId: 'm1',
      emoji: '\u{1F44D}',
      actor: { type: 'agent', agentId: 'pm' },
    })
    expect(mocks.reactToCollabMessage).toHaveBeenCalledWith('room-1', 'm1', '\u{1F44D}', { type: 'user' })
  })

  it('works with no actor field at all — the wire no longer needs to send one', () => {
    invokeReact({ roomSessionId: 'room-1', messageId: 'm1', emoji: '\u{1F44D}' })
    expect(mocks.reactToCollabMessage).toHaveBeenCalledWith('room-1', 'm1', '\u{1F44D}', { type: 'user' })
  })
})

/**
 * 托管私聊房的 get-or-create(agent-im-dm.md D1)。同一条纪律:校验(同事/在职/
 * 查得到)全在 app 层,handler 只负责把 null 翻译成一句用户读得懂的失败。
 */
describe('COLLAB_DM_ROOM_ENSURE', () => {
  it('returns the derived room id the app layer resolved', () => {
    expect(invokeEnsureDm({ agentId: 'fe' })).toEqual({ success: true, roomSessionId: 'agent-dm-fe' })
    expect(mocks.ensureUserDmRoom).toHaveBeenCalledWith('fe')
  })

  it('turns "no room for this agent" into an explicit refusal, not an empty success', () => {
    mocks.ensureUserDmRoom.mockReturnValue(null)
    expect(invokeEnsureDm({ agentId: 'gone' })).toEqual({
      success: false,
      error: '这个 agent 不能开私聊(已退休、不是同事,或者查无此人)',
    })
  })

  it('turns a thrown error into a failed response', () => {
    mocks.ensureUserDmRoom.mockImplementation(() => { throw new Error('store exploded') })
    expect(invokeEnsureDm({ agentId: 'fe' })).toEqual({ success: false, error: 'store exploded' })
  })
})

/**
 * 清空聊天记录。次序(先停后删再播)与"到底清哪几处"全在 app 层 —— handler
 * 只负责把房间 id 带过去,以及把抛出来的错翻译成一次线上失败。
 */
describe('COLLAB_ROOM_CLEAR_HISTORY', () => {
  it('carries the room id across and returns the app layer answer verbatim', async () => {
    expect(await invokeClearHistory({ roomSessionId: 'room-1' }))
      .toEqual({ success: true, clearedMessageCount: 3 })
    // includeMemberDms 缺席时显式落 false —— handler 归一化,不让 undefined 过河。
    expect(mocks.clearCollabRoomHistory).toHaveBeenCalledWith('room-1', { includeMemberDms: false })
  })

  it('includeMemberDms 只在显式为 true 时透传为 true', async () => {
    await invokeClearHistory({ roomSessionId: 'room-1', includeMemberDms: true })
    expect(mocks.clearCollabRoomHistory).toHaveBeenCalledWith('room-1', { includeMemberDms: true })
  })

  it('turns a thrown error into a failed response', async () => {
    mocks.clearCollabRoomHistory.mockImplementation(() => { throw new Error('store exploded') })
    expect(await invokeClearHistory({ roomSessionId: 'room-1' }))
      .toEqual({ success: false, error: 'store exploded' })
  })
})
