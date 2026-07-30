import { describe, expect, it } from 'vitest'
import {
  EMPTY_ROOM_LAYOUT,
  ROOM_TIME_CAPSULE_GAP_MS,
  buildRoomMessageLayout,
  filterRoomMessages,
  formatRoomTimeCapsule,
  isRoomHiddenMessage,
  isRoomThinkingTrace,
  roomGroupAt,
  type RoomMessageLike,
} from '../room-grouping'

const T0 = new Date('2026-07-28T14:00:00').getTime()
const MINUTE = 60 * 1000

function agentMessage(agentId: string, offsetMs = 0, extra: Partial<RoomMessageLike> = {}): RoomMessageLike {
  return { role: 'assistant', agentId, content: '在的', timestamp: T0 + offsetMs, ...extra }
}

function userMessage(offsetMs = 0): RoomMessageLike {
  return { role: 'user', content: '大家看看这个方案', timestamp: T0 + offsetMs }
}

function driveMessage(offsetMs = 0): RoomMessageLike {
  return { role: 'user', content: '(小李 · 被 @ 激活)', timestamp: T0 + offsetMs, origin: { source: 'collab' } }
}

describe('room message hiding', () => {
  it('hides coordinator drives stamped on origin or source', () => {
    expect(isRoomHiddenMessage(driveMessage())).toBe(true)
    expect(isRoomHiddenMessage({ role: 'user', content: '(x)', source: 'collab' })).toBe(true)
  })

  it('hides a resolved pass turn', () => {
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '[pass]' }))).toBe(true)
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '  [PASS] \n' }))).toBe(true)
  })

  it('keeps a hedged pass — content is never silently dropped', () => {
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '[pass]\n但是要注意预算' }))).toBe(false)
  })

  it('hides a reasoning-only settled turn (no text, no tools) — silence without the sentinel', () => {
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '' }))).toBe(true)
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '  \n' }))).toBe(true)
  })

  it('keeps a tool-only turn — board activity is real content', () => {
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '', toolCalls: [{ name: 'board' }] }))).toBe(false)
  })

  it('never hides an empty user message', () => {
    expect(isRoomHiddenMessage({ role: 'user', content: '' })).toBe(false)
  })

  it('hides an in-flight agent message whatever it has typed so far (W11)', () => {
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '', isStreaming: true }))).toBe(true)
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '[pa', isStreaming: true }))).toBe(true)
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '预算大概', isStreaming: true }))).toBe(true)
  })

  it('shows the same message whole once the stream settles', () => {
    const settled = agentMessage('a1', 0, { content: '预算大概三万', isStreaming: false })
    expect(isRoomHiddenMessage(settled)).toBe(false)
  })

  it('shows a partial message left behind by an abort or error — it is settled', () => {
    expect(isRoomHiddenMessage(agentMessage('a1', 0, { content: '预算大概' }))).toBe(false)
  })

  it('never hides the user side or system rows, streaming flag or not', () => {
    expect(isRoomHiddenMessage(userMessage())).toBe(false)
    expect(isRoomHiddenMessage({ role: 'user', content: '大家看看', isStreaming: true })).toBe(false)
    expect(isRoomHiddenMessage({ role: 'system', content: '预算已用尽' })).toBe(false)
    expect(isRoomHiddenMessage({ role: 'system', content: '小李 已被移出群聊', isStreaming: true })).toBe(false)
  })

  it('leaves an assistant message without an agent id alone: not a room member', () => {
    expect(isRoomHiddenMessage({ role: 'assistant', content: '在的' })).toBe(false)
    expect(isRoomHiddenMessage({ role: 'assistant', content: '在', isStreaming: true })).toBe(false)
  })

  it('keeps ordinary settled agent speech', () => {
    expect(isRoomHiddenMessage(agentMessage('a1'))).toBe(false)
  })

  it('never reads content while a message streams — the projection ignores chunks', () => {
    let contentReads = 0
    const streaming = {
      role: 'assistant',
      agentId: 'a1',
      isStreaming: true,
      get content() {
        contentReads++
        return '预算大概'
      },
    }
    expect(isRoomHiddenMessage(streaming)).toBe(true)
    expect(contentReads).toBe(0)
  })

  it('returns the same array reference when nothing is hidden', () => {
    const messages = [userMessage(), agentMessage('a1', MINUTE)]
    expect(filterRoomMessages(messages)).toBe(messages)
  })

  it('drops hidden messages and keeps the rest in order', () => {
    const visible = filterRoomMessages([
      userMessage(),
      driveMessage(MINUTE),
      agentMessage('a1', 2 * MINUTE),
      agentMessage('a2', 3 * MINUTE, { content: '[pass]' }),
    ])
    expect(visible.map(message => message.role)).toEqual(['user', 'assistant'])
    expect((visible[1] as RoomMessageLike).agentId).toBe('a1')
  })

  it('holds the reply out of the list until the stream settles, then lets it in', () => {
    const inFlight = agentMessage('a1', MINUTE, { content: '预算大概', isStreaming: true })
    const room = [userMessage(), inFlight]
    expect(filterRoomMessages(room)).toHaveLength(1)

    inFlight.isStreaming = false
    inFlight.content = '预算大概三万,月底前能定'
    const settled = filterRoomMessages(room)
    expect(settled).toHaveLength(2)
    expect(settled[1].content).toBe('预算大概三万,月底前能定')
  })
})

describe('room grouping', () => {
  it('marks a lone message as both head and tail', () => {
    const layout = buildRoomMessageLayout([agentMessage('a1')])
    expect([...layout.groupHeads]).toEqual([0])
    expect([...layout.groupTails]).toEqual([0])
  })

  it('collapses a same-agent run into one group', () => {
    const layout = buildRoomMessageLayout([
      agentMessage('a1'),
      agentMessage('a1', MINUTE),
      agentMessage('a1', 2 * MINUTE),
    ])
    expect([...layout.groupHeads]).toEqual([0])
    expect([...layout.groupTails]).toEqual([2])
    expect(layout.capsules.size).toBe(0)
  })

  it('breaks the group when another agent speaks', () => {
    const layout = buildRoomMessageLayout([
      agentMessage('a1'),
      agentMessage('a2', MINUTE),
      agentMessage('a1', 2 * MINUTE),
    ])
    expect([...layout.groupHeads]).toEqual([0, 1, 2])
    expect([...layout.groupTails]).toEqual([0, 1, 2])
  })

  it('breaks the group on a user message and never groups the user side', () => {
    const layout = buildRoomMessageLayout([
      agentMessage('a1'),
      userMessage(MINUTE),
      userMessage(2 * MINUTE),
      agentMessage('a1', 3 * MINUTE),
    ])
    expect([...layout.groupHeads]).toEqual([0, 1, 2, 3])
    expect([...layout.groupTails]).toEqual([0, 1, 2, 3])
  })

  it('merges a run that only a filtered-out drive had split', () => {
    const raw = [agentMessage('a1'), driveMessage(MINUTE), agentMessage('a1', 2 * MINUTE)]
    const layout = buildRoomMessageLayout(filterRoomMessages(raw))
    expect([...layout.groupHeads]).toEqual([0])
    expect([...layout.groupTails]).toEqual([1])
  })

  it('does not let another member\'s in-flight reply split a run', () => {
    const raw = [
      agentMessage('a1'),
      agentMessage('a2', MINUTE, { content: '我看', isStreaming: true }),
      agentMessage('a1', 2 * MINUTE),
    ]
    const layout = buildRoomMessageLayout(filterRoomMessages(raw))
    expect([...layout.groupHeads]).toEqual([0])
    expect([...layout.groupTails]).toEqual([1])
  })

  it('never groups an assistant message without an agent id', () => {
    const layout = buildRoomMessageLayout([
      { role: 'assistant', content: 'a', timestamp: T0 },
      { role: 'assistant', content: 'b', timestamp: T0 + MINUTE },
    ])
    expect([...layout.groupHeads]).toEqual([0, 1])
  })

  it('returns an empty layout for an empty list', () => {
    const layout = buildRoomMessageLayout([])
    expect(layout.capsules.size).toBe(0)
    expect(layout.groupHeads.size).toBe(0)
    expect(layout.groupTails.size).toBe(0)
    expect(EMPTY_ROOM_LAYOUT.groupHeads.size).toBe(0)
    expect(layout.groups).toEqual([])
    expect(EMPTY_ROOM_LAYOUT.groups).toEqual([])
    expect(roomGroupAt(EMPTY_ROOM_LAYOUT, 0)).toBeNull()
  })
})

/**
 * Group identity (P1-2, todo #6): the head/tail boundaries above say WHERE a
 * burst starts; a fold toggle needs the burst itself — one key, one row set.
 */
describe('room group identity', () => {
  function withId(id: string, agentId: string, offsetMs = 0, extra: Partial<RoomMessageLike> = {}) {
    return { id, ...agentMessage(agentId, offsetMs, extra) }
  }

  it('keys every group by its head message id', () => {
    const layout = buildRoomMessageLayout([
      withId('m1', 'a1'),
      withId('m2', 'a1', MINUTE),
      withId('m3', 'a2', 2 * MINUTE),
    ])
    expect(layout.groups.map(group => group.key)).toEqual(['m1', 'm3'])
    expect(layout.groupKeyByIndex.get(0)).toBe('m1')
    expect(layout.groupKeyByIndex.get(1)).toBe('m1')
    expect(layout.groupKeyByIndex.get(2)).toBe('m3')
    expect(roomGroupAt(layout, 1)?.key).toBe('m1')
    expect(roomGroupAt(layout, 9)).toBeNull()
  })

  it('spans the burst: head, tail, members, count', () => {
    const layout = buildRoomMessageLayout([
      withId('u1', 'a1'), // group 1 (single)
      withId('m1', 'a2', MINUTE),
      withId('m2', 'a2', 2 * MINUTE),
      withId('m3', 'a2', 3 * MINUTE),
    ])
    const burst = roomGroupAt(layout, 2)!
    expect(burst.key).toBe('m1')
    expect(burst.head).toBe(1)
    expect(burst.tail).toBe(3)
    expect(burst.members).toEqual([1, 2, 3])
    expect(burst.messageCount).toBe(3)
    expect(burst.collapsible).toBe(true)
  })

  it('never offers to fold a single-row block or the user side', () => {
    const layout = buildRoomMessageLayout([
      { id: 'u1', ...userMessage() },
      { id: 'u2', ...userMessage(MINUTE) },
      withId('m1', 'a1', 2 * MINUTE),
    ])
    expect(layout.groups.map(group => group.collapsible)).toEqual([false, false, false])
  })

  it('falls back to a positional key when a message has no id', () => {
    const layout = buildRoomMessageLayout([agentMessage('a1'), agentMessage('a1', MINUTE)])
    expect(layout.groups[0].key).toBe('row-0')
  })

  it('keeps a run merged across a filtered-out drive — one group, one key', () => {
    const raw = [withId('m1', 'a1'), driveMessage(MINUTE), withId('m2', 'a1', 2 * MINUTE)]
    const layout = buildRoomMessageLayout(filterRoomMessages(raw))
    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]).toMatchObject({ key: 'm1', head: 0, tail: 1, messageCount: 2 })
  })

  it('cuts a group at a time capsule, so each side folds on its own', () => {
    const layout = buildRoomMessageLayout(
      [withId('m1', 'a1'), withId('m2', 'a1', ROOM_TIME_CAPSULE_GAP_MS + 1000)],
      T0,
    )
    expect(layout.groups.map(group => group.key)).toEqual(['m1', 'm2'])
  })

  it('gives a thinking trace to the turn it opens, not to the burst in front', () => {
    // Row order: a1 speaks, a2 thinks, a2 speaks. The trace belongs to a2.
    const layout = buildRoomMessageLayout([
      { id: 'm1', role: 'assistant', agentId: 'a1', content: '一', source: 'collab-say', timestamp: T0 },
      { id: 't1', role: 'assistant', agentId: 'a2', content: '想想', source: 'collab-turn', timestamp: T0 + MINUTE },
      { id: 'm2', role: 'assistant', agentId: 'a2', content: '二', source: 'collab-say', timestamp: T0 + 2 * MINUTE },
    ])
    expect(layout.groupKeyByIndex.get(1)).toBe('m2')
    const group = roomGroupAt(layout, 1)!
    expect(group.members).toEqual([1, 2])
    // A trace is a row, never a message: it does not inflate the summary count,
    // and it cannot make a one-utterance block look foldable on its own.
    expect(group.messageCount).toBe(1)
    expect(group.collapsible).toBe(false)
  })

  it('hands a trailing trace to the last group — nothing behind it to open', () => {
    const layout = buildRoomMessageLayout([
      { id: 'm1', role: 'assistant', agentId: 'a1', content: '一', source: 'collab-say', timestamp: T0 },
      { id: 'm2', role: 'assistant', agentId: 'a1', content: '二', source: 'collab-say', timestamp: T0 + MINUTE },
      { id: 't1', role: 'assistant', agentId: 'a1', content: '再想想', source: 'collab-turn', timestamp: T0 + 2 * MINUTE },
    ])
    const group = roomGroupAt(layout, 2)!
    expect(group.key).toBe('m1')
    expect(group.members).toEqual([0, 1, 2])
    expect(group.messageCount).toBe(2)
    expect(group.collapsible).toBe(true)
  })

  it('assigns every row exactly one group', () => {
    const messages = [
      { id: 'u1', ...userMessage() },
      withId('m1', 'a1', MINUTE),
      withId('m2', 'a1', 2 * MINUTE),
      withId('m3', 'a2', 3 * MINUTE),
    ]
    const layout = buildRoomMessageLayout(messages)
    expect(layout.groupKeyByIndex.size).toBe(messages.length)
    const owned = layout.groups.flatMap(group => group.members).sort((a, b) => a - b)
    expect(owned).toEqual([0, 1, 2, 3])
  })
})

describe('room time capsules', () => {
  it('stays silent inside the 10 minute window, boundary included', () => {
    const layout = buildRoomMessageLayout([
      agentMessage('a1'),
      agentMessage('a1', ROOM_TIME_CAPSULE_GAP_MS),
    ])
    expect(layout.capsules.size).toBe(0)
    expect([...layout.groupHeads]).toEqual([0])
  })

  it('cuts the group when the silence passes 10 minutes', () => {
    const layout = buildRoomMessageLayout(
      [agentMessage('a1'), agentMessage('a1', ROOM_TIME_CAPSULE_GAP_MS + 1000)],
      T0,
    )
    expect(layout.capsules.get(1)).toBe('今天 14:10')
    expect([...layout.groupHeads]).toEqual([0, 1])
    expect([...layout.groupTails]).toEqual([0, 1])
  })

  it('cuts across midnight even when the gap is small', () => {
    const lateNight = new Date('2026-07-27T23:58:00').getTime()
    const layout = buildRoomMessageLayout(
      [
        { role: 'assistant', agentId: 'a1', content: 'a', timestamp: lateNight },
        { role: 'assistant', agentId: 'a1', content: 'b', timestamp: lateNight + 3 * MINUTE },
      ],
      T0,
    )
    expect(layout.capsules.get(1)).toBe('今天 00:01')
    expect([...layout.groupHeads]).toEqual([0, 1])
  })

  it('never opens the list with a capsule', () => {
    const layout = buildRoomMessageLayout([agentMessage('a1', -5 * 24 * 60 * MINUTE)], T0)
    expect(layout.capsules.size).toBe(0)
  })

  it('writes today / yesterday / date / cross-year labels', () => {
    expect(formatRoomTimeCapsule(T0, T0)).toBe('今天 14:00')
    expect(formatRoomTimeCapsule(new Date('2026-07-27T09:05:00').getTime(), T0)).toBe('昨天 09:05')
    expect(formatRoomTimeCapsule(new Date('2026-07-26T18:30:00').getTime(), T0)).toBe('7月26日 18:30')
    expect(formatRoomTimeCapsule(new Date('2025-12-31T23:07:00').getTime(), T0)).toBe('2025年12月31日 23:07')
  })
})

/**
 * W14b 说话即行动: the turn's own message is a thinking RECORD, not speech. It
 * still shows — as a collapsed hairline — but it must be transparent to
 * everything the IM layout is about (avatar, signature, grouping, capsules).
 */
describe('room thinking traces (W14b)', () => {
  function thinking(agentId: string, offsetMs = 0, extra: Partial<RoomMessageLike> = {}): RoomMessageLike {
    return {
      role: 'assistant',
      agentId,
      content: '先看看排期',
      source: 'collab-turn',
      timestamp: T0 + offsetMs,
      ...extra,
    }
  }

  function say(agentId: string, offsetMs = 0, content = '明天下班前'): RoomMessageLike {
    return {
      role: 'assistant',
      agentId,
      content,
      source: 'collab-say',
      timestamp: T0 + offsetMs,
    }
  }

  it('recognises a settled thinking record, and only that', () => {
    expect(isRoomThinkingTrace(thinking('a1'))).toBe(true)
    expect(isRoomThinkingTrace(say('a1'))).toBe(false)
    expect(isRoomThinkingTrace(agentMessage('a1'))).toBe(false) // pre-W14b speech
    expect(isRoomThinkingTrace(userMessage())).toBe(false)
  })

  it('keeps streaming ones out (W11 still owns the in-flight window)', () => {
    expect(isRoomThinkingTrace(thinking('a1', 0, { isStreaming: true }))).toBe(false)
  })

  it('hides every thinking record from the chat — speech only (2026-07-28 用户定向)', () => {
    // The record persists untouched for the future agent execution page; the
    // ROOM shows what the agent said, never how it got there.
    expect(isRoomHiddenMessage(thinking('a1', 0, { content: '' }))).toBe(true)
    expect(isRoomHiddenMessage(thinking('a1', 0, { content: '琢磨一下措辞' }))).toBe(true)
    expect(isRoomHiddenMessage(thinking('a1', 0, { content: '', toolCalls: [{}] }))).toBe(true)
  })

  it('filters thinking records out of the stream entirely', () => {
    const messages = [userMessage(), thinking('a1', MINUTE), say('a1', 2 * MINUTE)]
    const visible = filterRoomMessages(messages)
    expect(visible).toHaveLength(2)
    expect(visible.map(m => m.role)).toEqual(['user', 'assistant'])
  })

  it('never claims the avatar or the signature', () => {
    const layout = buildRoomMessageLayout([userMessage(), thinking('a1', MINUTE), say('a1', 2 * MINUTE)])
    expect(layout.groupHeads.has(1)).toBe(false)
    expect(layout.groupTails.has(1)).toBe(false)
    // The say behind it opens the agent's group and carries the signature.
    expect(layout.groupHeads.has(2)).toBe(true)
  })

  it('does not split one agent burst in two when a trace sits inside it', () => {
    const layout = buildRoomMessageLayout([
      say('a1', 0, '一'),
      thinking('a1', MINUTE),
      say('a1', 2 * MINUTE, '二'),
    ])
    // Head only on the first utterance: the trace is transparent, so the
    // second line stays stacked under the same signature.
    expect([...layout.groupHeads]).toEqual([0])
    expect([...layout.groupTails]).toEqual([2])
  })

  it('does not let a trace earn a time capsule of its own', () => {
    const layout = buildRoomMessageLayout(
      [say('a1'), thinking('a1', ROOM_TIME_CAPSULE_GAP_MS + 1000), say('a1', ROOM_TIME_CAPSULE_GAP_MS + 2000)],
      T0,
    )
    expect(layout.capsules.has(1)).toBe(false)
    // The break is measured between the rows the room actually reads.
    expect(layout.capsules.has(2)).toBe(true)
  })
})
