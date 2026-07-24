/**
 * Groups user-message markers under TOC segments for the merged
 * Contents/Outline panel: a topic row is a segment, and expanding it shows
 * the user messages that drove that stretch of work.
 *
 * Segments anchor on assistant messages: `startedAt`/`endedAt` are the *end*
 * times of the first/last turn folded into the segment, so the user message
 * that opened a segment precedes its `startedAt`. The invariant that does
 * hold is that every user message of a turn precedes that turn's end — so a
 * marker belongs to the earliest segment whose `endedAt` is at or after the
 * marker's timestamp. Markers newer than every closed segment (turns the
 * segmenter has not caught up with yet — it runs after a 45s quiet period)
 * stay with the last segment rather than vanishing.
 */
import type { SessionSegment, UserMessageMarker } from '@/types'

export interface SegmentTopicGroup {
  segment: SessionSegment
  markers: UserMessageMarker[]
}

function endOf(segment: SessionSegment): number {
  return segment.endedAt ?? Number.POSITIVE_INFINITY
}

export function groupMarkersBySegment(
  segments: readonly SessionSegment[],
  markers: readonly UserMessageMarker[],
): SegmentTopicGroup[] {
  if (segments.length === 0) return []

  // Windows are disjoint (overlapping inferred segments are dropped when goal
  // segments are merged in), so ordering by end time is ordering by time.
  const ordered = [...segments].sort((a, b) =>
    endOf(a) - endOf(b) || a.startedAt - b.startedAt,
  )
  const groups = ordered.map(segment => ({ segment, markers: [] as UserMessageMarker[] }))

  const sortedMarkers = [...markers].sort((a, b) => a.seq - b.seq)
  let index = 0
  for (const marker of sortedMarkers) {
    while (index < groups.length - 1 && marker.timestamp > endOf(groups[index]!.segment)) {
      index++
    }
    groups[index]!.markers.push(marker)
  }
  return groups
}
