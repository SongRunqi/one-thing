/**
 * Which room a `board` call acts on (W18).
 *
 * The room turn moved into the agent's execution session, so the board tool has
 * to find the room the same way the say executor does — through the pointer the
 * drive wrote. Without this the whole work pipeline goes dark from a room turn
 * ("this session has no room board"), which no pure test of the tool would show.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  kind?: string
  agentId?: string
  collab?: { roomSessionId?: string; taskId?: string }
  room?: { memberAgentIds: string[] }
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  applied: [] as Array<{ roomSessionId: string; actor: { type: string; agentId?: string } }>,
}))

vi.mock('../../store.js', () => ({
  // drive 现在要渲染用户署名(v3 V1),因此读一次设置里的身份。
  getSettings: () => ({}),
  updateSessionWorkingDirectory: vi.fn(),
  getSession: (id: string) => mocks.sessions.get(id),
}))

vi.mock('../../agents/index.js', () => ({
  findAgent: (id: string) => ({ id, name: id === 'fe' ? '小李' : id }),
}))

vi.mock('../board-store.js', () => ({
  applyBoardAction: async (
    roomSessionId: string,
    _action: unknown,
    actor: { type: string; agentId?: string },
  ) => {
    mocks.applied.push({ roomSessionId, actor })
    return { board: { version: 1, tasks: [] } }
  },
}))

const { BoardTool } = await import('../board-tool.js')

function ctx(sessionId: string) {
  return { sessionId, messageId: 'm-1', metadata: vi.fn() } as never
}

beforeEach(() => {
  mocks.sessions.clear()
  mocks.applied.length = 0
  mocks.sessions.set('room-1', {
    id: 'room-1',
    kind: 'room',
    agentId: 'fe',
    room: { memberAgentIds: ['fe'] },
  } satisfies FakeSession)
  mocks.sessions.set('agent-exec-fe', {
    id: 'agent-exec-fe',
    kind: 'agent',
    agentId: 'fe',
    collab: { roomSessionId: 'room-1' },
  } satisfies FakeSession)
})

describe('board context from an execution session (W18)', () => {
  it('acts on the room the drive pointed the session at, as that agent', async () => {
    await BoardTool.execute({ action: 'list' }, ctx('agent-exec-fe'))
    expect(mocks.applied).toEqual([
      { roomSessionId: 'room-1', actor: { type: 'agent', agentId: 'fe' } },
    ])
  })

  it('has no board before a drive pointed it anywhere', async () => {
    ;(mocks.sessions.get('agent-exec-fe') as FakeSession).collab = undefined
    const result = await BoardTool.execute({ action: 'list' }, ctx('agent-exec-fe'))
    expect(result.output).toContain('no room board')
    expect(mocks.applied).toEqual([])
  })

  it('still resolves a pre-W18 in-room turn', async () => {
    await BoardTool.execute({ action: 'list' }, ctx('room-1'))
    expect(mocks.applied).toEqual([
      { roomSessionId: 'room-1', actor: { type: 'agent', agentId: 'fe' } },
    ])
  })
})
