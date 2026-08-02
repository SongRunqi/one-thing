/**
 * applyUserCollabBoardAction — the USER's door into the board (W16).
 *
 * What is worth asserting here is exactly what the pure reducer cannot see:
 * the session must be a room, and the actor is the human — pinned on this side
 * so a renderer can never write AS an agent (which would also spend W9b's
 * agent-only halt budget on a user's own push).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  room?: { memberAgentIds: string[]; pmAgentId?: string }
  messages: unknown[]
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  applyBoardAction: vi.fn(async (_room: string, _action: unknown, _actor: unknown) => ({
    board: { version: 1, tasks: [] },
    task: { id: 'task-1' },
  })),
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-act-test' }))
vi.mock('../../usage/index.js', () => ({ getUsageLedger: () => ({ readRecordsInRange: async () => [] }) }))
vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => ({ id, name: id }) }))

vi.mock('../../store.js', () => ({
  // drive 现在要渲染用户署名(v3 V1),因此读一次设置里的身份。
  getSettings: () => ({}),
  updateSessionWorkingDirectory: vi.fn(),
  // P2-10: the coordinator registers a room-disposal listener at startup.
  onSessionsDeleted: () => () => {},
  getSession: (id: string) => mocks.sessions.get(id),
  getSessionsList: () => [...mocks.sessions.values()],
  addMessage: () => {},
  updateSessionAgent: vi.fn(),
  updateSessionCollab: vi.fn(() => true),
  updateSessionPermissionMode: vi.fn(() => true),
  renameSession: vi.fn(),
}))

vi.mock('../../events/index.js', () => ({
  getEventBus: () => ({
    emit: async () => {},
    onAny: () => () => {},
    onAnySession: () => () => {},
  }),
}))

vi.mock('../../engine/index.js', () => ({
  getStreamEngineSafe: () => ({
    hasCommandTarget: () => true,
    getController: () => undefined,
    getChannel: () => 'ipc',
    abort: vi.fn(),
  }),
}))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
  applyBoardAction: (...args: unknown[]) => mocks.applyBoardAction(...(args as [string, unknown, unknown])),
}))

vi.mock('../willingness-runner.js', () => ({ judgeWillingness: async () => [] }))

vi.mock('../worker.js', () => ({
  forgetCollabRoomWork: () => {},
  initializeCollabWorkers: () => {},
  shutdownCollabWorkers: () => {},
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const { applyUserCollabBoardAction } = await import('../coordinator.js')

const ROOM = 'room-1'

beforeEach(() => {
  mocks.sessions.clear()
  mocks.applyBoardAction.mockClear()
  mocks.applyBoardAction.mockResolvedValue({ board: { version: 1, tasks: [] }, task: { id: 'task-1' } })
  const session: FakeSession = {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' },
    messages: [],
  }
  mocks.sessions.set(ROOM, session)
})

describe('applyUserCollabBoardAction', () => {
  it('acts as the user, never as an agent', async () => {
    await applyUserCollabBoardAction(ROOM, { action: 'move', taskId: 't1', status: 'done', expectedRev: 2 })
    expect(mocks.applyBoardAction).toHaveBeenCalledWith(
      ROOM,
      { action: 'move', taskId: 't1', status: 'done', expectedRev: 2 },
      { type: 'user' },
    )
  })

  it('hands the post-write board back so the caller repaints without waiting', async () => {
    const board = { version: 1 as const, tasks: [{ id: 't1' }] }
    mocks.applyBoardAction.mockResolvedValue({ board, task: { id: 't1' } } as never)
    await expect(applyUserCollabBoardAction(ROOM, { action: 'list' }))
      .resolves.toEqual({ success: true, board })
  })

  it('passes the reducer refusal through verbatim, board included', async () => {
    const board = { version: 1 as const, tasks: [{ id: 't1' }] }
    const error = 'Task t1 changed (rev 7) — re-read the board (action:"list") and retry with the current rev'
    mocks.applyBoardAction.mockResolvedValue({ board, error } as never)
    await expect(applyUserCollabBoardAction(ROOM, { action: 'move', taskId: 't1', status: 'done', expectedRev: 2 }))
      .resolves.toEqual({ success: false, error, board })
  })

  it('refuses a non-room session before it ever reaches the board', async () => {
    mocks.sessions.set('chat-1', { id: 'chat-1', name: '普通会话', messages: [] })
    await expect(applyUserCollabBoardAction('chat-1', { action: 'list' }))
      .resolves.toEqual({ success: false, error: 'Not a room session' })
    expect(mocks.applyBoardAction).not.toHaveBeenCalled()
  })

  it('refuses a room id that does not exist', async () => {
    await expect(applyUserCollabBoardAction('ghost', { action: 'list' }))
      .resolves.toEqual({ success: false, error: 'Session not found' })
    expect(mocks.applyBoardAction).not.toHaveBeenCalled()
  })
})
