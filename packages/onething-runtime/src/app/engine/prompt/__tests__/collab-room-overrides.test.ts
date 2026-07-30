/**
 * Where a room turn's system prompt takes its material from (W18).
 *
 * Before W18 the answer was trivially "the session being driven" — the turn ran
 * inside the room. Now it runs in the agent's execution session, and the room
 * facts (persona, roster, room name, taskFacts) have to be fetched from the
 * room that session was pointed at. Getting this wrong is silent: the model
 * would still get a persona, just not the room's, and nothing would throw.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const AGENTS: Record<string, { id: string; name: string; systemPrompt?: string; title?: string }> = {
  fe: { id: 'fe', name: '小李', title: '前端', systemPrompt: '你是小李,说话直接。' },
  pm: { id: 'pm', name: '阿明', title: '产品', systemPrompt: '你是阿明。' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  taskFactCalls: [] as Array<{ roomSessionId: string; agentId: string }>,
}))

vi.mock('../../../agents/index.js', () => ({
  findAgent: (id?: string) => (id ? AGENTS[id] ?? null : null),
  defaultAgent: () => ({ id: 'default', name: 'Default Agent', systemPrompt: '' }),
  DEFAULT_AGENT_ID: 'default',
}))

vi.mock('../../../store.js', () => ({
  getSession: (id: string) => mocks.sessions.get(id),
}))

vi.mock('../../../collab/board-store.js', () => ({
  getCollabSelfTaskFacts: (roomSessionId: string, agentId: string) => {
    mocks.taskFactCalls.push({ roomSessionId, agentId })
    return roomSessionId === 'room-1'
      ? [{ id: 'task-1', title: '登录页', status: 'doing' }]
      : []
  },
}))

const { buildSystemPrompt } = await import('../system-prompt.js')

const ROOM = 'room-1'
const AGENT_SESSION = 'agent-exec-fe'

function context(sessionId: string) {
  return {
    sessionId,
    hasTools: true,
    skills: [],
    activeProject: { hasActive: false },
    knownProjects: { hasAny: false, entries: [] },
    toolNames: ['say', 'board'],
    mcpToolNames: [],
  } as unknown as Parameters<typeof buildSystemPrompt>[0]
}

beforeEach(() => {
  mocks.sessions.clear()
  mocks.taskFactCalls.length = 0
  mocks.sessions.set(ROOM, {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' },
    messages: [],
  })
  mocks.sessions.set(AGENT_SESSION, {
    id: AGENT_SESSION,
    name: '[执行] 小李',
    kind: 'agent',
    agentId: 'fe',
    collab: { roomSessionId: ROOM },
    messages: [],
  })
})

describe('collab room overrides — 取材链 (W18)', () => {
  it('builds an execution session’s prompt from the room it was pointed at', async () => {
    const { system } = await buildSystemPrompt(context(AGENT_SESSION))

    // The persona is the prompt (D3「模拟房间」), the roster and the room name
    // come from the TARGET room, not from the session being driven.
    expect(system).toContain('你是小李,说话直接。')
    expect(system).toContain('官网改版组')
    expect(system).toContain('阿明')
    // …and so do the task facts (W9.3) — a board lookup keyed by the room.
    expect(mocks.taskFactCalls).toEqual([{ roomSessionId: ROOM, agentId: 'fe' }])
    expect(system).toContain('登录页')
    // The product prompt's own identity/tool sections stay disabled.
    expect(system).not.toContain('[执行] 小李')
  })

  it('follows the pointer to another room', async () => {
    mocks.sessions.set('room-2', {
      id: 'room-2',
      name: '内部工具组',
      kind: 'room',
      room: { memberAgentIds: ['fe'] },
      messages: [],
    })
    ;(mocks.sessions.get(AGENT_SESSION) as { collab: { roomSessionId: string } })
      .collab.roomSessionId = 'room-2'

    const { system } = await buildSystemPrompt(context(AGENT_SESSION))
    expect(system).toContain('内部工具组')
    expect(system).not.toContain('官网改版组')
    expect(mocks.taskFactCalls).toEqual([{ roomSessionId: 'room-2', agentId: 'fe' }])
  })

  it('leaves an unpointed execution session on the ordinary product prompt', async () => {
    ;(mocks.sessions.get(AGENT_SESSION) as { collab?: unknown }).collab = undefined
    const { system } = await buildSystemPrompt(context(AGENT_SESSION))
    expect(system).not.toContain('官网改版组')
  })

  it('still builds a pre-W18 in-room turn from the room session itself', async () => {
    ;(mocks.sessions.get(ROOM) as { agentId?: string }).agentId = 'fe'
    const { system } = await buildSystemPrompt(context(ROOM))
    expect(system).toContain('你是小李,说话直接。')
    expect(system).toContain('官网改版组')
    expect(mocks.taskFactCalls).toEqual([{ roomSessionId: ROOM, agentId: 'fe' }])
  })
})
