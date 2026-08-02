/**
 * W14a — the agent half of 身份 id 化: an agent writes `@名字` in prose, and the
 * coordinator turns those names into ids once the reply is settled.
 *
 * What a pure test cannot reach: the room guard, the store write, and the fact
 * that the broadcast is `message:updated` — the one event the coordinator
 * deliberately does not listen to, so stamping an id can never open a new
 * willingness round (same discipline as W8 reactions / W13.2 quotes).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeMessage {
  id: string
  role: string
  content: string
  agentId?: string
  mentions?: Array<{ agentId: string; label: string }>
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, { id: string; kind?: string; messages: FakeMessage[] }>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  updateMessageMentions: vi.fn(),
}))

vi.mock('../../store.js', () => ({
  // drive 现在要渲染用户署名(v3 V1),因此读一次设置里的身份。
  getSettings: () => ({}),
  updateSessionWorkingDirectory: vi.fn(),
  getSession: (id: string) => mocks.sessions.get(id),
  updateMessageMentions: (
    sessionId: string,
    messageId: string,
    mentions: FakeMessage['mentions'],
  ) => {
    mocks.updateMessageMentions(sessionId, messageId, mentions)
    const message = mocks.sessions.get(sessionId)?.messages.find(item => item.id === messageId)
    if (!message) return false
    message.mentions = mentions
    return true
  },
}))

vi.mock('../../events/index.js', () => ({
  getEventBus: () => ({
    emit: async (sessionId: string, event: Record<string, unknown>) => {
      mocks.emitted.push({ sessionId, event })
    },
  }),
}))

const { attachCollabMentions } = await import('../mentions.js')

const ROOM = 'room-1'
const MEMBERS = [
  { id: 'pm', name: '阿明' },
  { id: 'fe', name: '小李' },
]

function seed(messages: FakeMessage[], kind = 'room'): void {
  mocks.sessions.set(ROOM, { id: ROOM, kind, messages })
}

beforeEach(() => {
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.updateMessageMentions.mockClear()
})

describe('attachCollabMentions', () => {
  it('resolves the names an agent wrote and broadcasts message:updated', () => {
    seed([{ id: 'a1', role: 'assistant', agentId: 'pm', content: '@小李 你接一下' }])

    const mentions = attachCollabMentions(ROOM, 'a1', MEMBERS)

    expect(mentions).toEqual([{ agentId: 'fe', label: '小李' }])
    expect(mocks.updateMessageMentions).toHaveBeenCalledWith(ROOM, 'a1', mentions)
    expect(mocks.emitted).toEqual([{
      sessionId: ROOM,
      event: { type: 'message:updated', messageId: 'a1', updates: { mentions } },
    }])
  })

  it('writes nothing when the reply mentions nobody', () => {
    seed([{ id: 'a1', role: 'assistant', agentId: 'pm', content: '我看没问题' }])

    expect(attachCollabMentions(ROOM, 'a1', MEMBERS)).toEqual([])
    expect(mocks.updateMessageMentions).not.toHaveBeenCalled()
    expect(mocks.emitted).toEqual([])
  })

  it('never re-stamps an already-identified message (first roster wins)', () => {
    seed([{
      id: 'a1',
      role: 'assistant',
      agentId: 'pm',
      content: '@小李 你接一下',
      mentions: [{ agentId: 'fe-old', label: '小李' }],
    }])

    expect(attachCollabMentions(ROOM, 'a1', MEMBERS)).toEqual([{ agentId: 'fe-old', label: '小李' }])
    expect(mocks.updateMessageMentions).not.toHaveBeenCalled()
    expect(mocks.emitted).toEqual([])
  })

  it('writes nothing off a room, for a missing message, or an unknown session', () => {
    seed([{ id: 'a1', role: 'assistant', agentId: 'pm', content: '@小李 你接一下' }])
    expect(attachCollabMentions(ROOM, 'ghost', MEMBERS)).toEqual([])
    expect(attachCollabMentions('nope', 'a1', MEMBERS)).toEqual([])

    mocks.sessions.get(ROOM)!.kind = 'chat'
    expect(attachCollabMentions(ROOM, 'a1', MEMBERS)).toEqual([])
    expect(mocks.updateMessageMentions).not.toHaveBeenCalled()
  })

  it('claims both members when two share the name an agent typed', () => {
    seed([{ id: 'a1', role: 'assistant', agentId: 'pm', content: '@小李 谁有空' }])

    expect(attachCollabMentions(ROOM, 'a1', [
      { id: 'fe-1', name: '小李' },
      { id: 'fe-2', name: '小李' },
    ])).toEqual([
      { agentId: 'fe-1', label: '小李' },
      { agentId: 'fe-2', label: '小李' },
    ])
  })
})
