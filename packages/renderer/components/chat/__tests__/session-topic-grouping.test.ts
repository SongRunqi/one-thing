import { describe, expect, it } from 'vitest'
import { groupMarkersBySegment } from '../session-topic-grouping'
import type { SessionSegment, UserMessageMarker } from '@/types'

function segment(overrides: Partial<SessionSegment> & Pick<SessionSegment, 'id' | 'startedAt'>): SessionSegment {
  return {
    origin: 'inferred',
    kind: 'task',
    title: overrides.id,
    detail: '',
    files: [],
    turnCount: 1,
    revision: 0,
    ...overrides,
  } as SessionSegment
}

function marker(id: string, seq: number, timestamp: number): UserMessageMarker {
  return { id, seq, timestamp, preview: id }
}

describe('groupMarkersBySegment', () => {
  it('assigns each marker to the earliest segment ending at or after it', () => {
    // Segments anchor on assistant-turn ends: the user message that opened a
    // segment precedes its startedAt but not its endedAt.
    const segments = [
      segment({ id: 'a', startedAt: 100, endedAt: 200 }),
      segment({ id: 'b', startedAt: 300, endedAt: 400 }),
    ]
    const markers = [
      marker('u1', 1, 90), // opened segment a (before its startedAt)
      marker('u2', 2, 150), // follow-up inside a
      marker('u3', 3, 250), // opened segment b
    ]

    const groups = groupMarkersBySegment(segments, markers)
    expect(groups.map(group => [group.segment.id, group.markers.map(m => m.id)])).toEqual([
      ['a', ['u1', 'u2']],
      ['b', ['u3']],
    ])
  })

  it('keeps markers newer than every closed segment with the last segment', () => {
    const segments = [segment({ id: 'a', startedAt: 100, endedAt: 200 })]
    const markers = [marker('late', 1, 999)]

    const groups = groupMarkersBySegment(segments, markers)
    expect(groups[0]!.markers.map(m => m.id)).toEqual(['late'])
  })

  it('treats a segment without endedAt as still open', () => {
    const segments = [
      segment({ id: 'a', startedAt: 100, endedAt: 200 }),
      segment({ id: 'open', startedAt: 300 }),
    ]
    const markers = [marker('u1', 1, 150), marker('u2', 2, 5_000)]

    const groups = groupMarkersBySegment(segments, markers)
    expect(groups[1]!.markers.map(m => m.id)).toEqual(['u2'])
  })

  it('returns no groups without segments', () => {
    expect(groupMarkersBySegment([], [marker('u1', 1, 10)])).toEqual([])
  })

  it('orders markers by seq inside a group', () => {
    const segments = [segment({ id: 'a', startedAt: 100 })]
    const markers = [marker('u2', 2, 60), marker('u1', 1, 50)]

    const groups = groupMarkersBySegment(segments, markers)
    expect(groups[0]!.markers.map(m => m.id)).toEqual(['u1', 'u2'])
  })
})
