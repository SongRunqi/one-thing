/**
 * LRC parsing for the composer's placeholder lyrics.
 *
 * `ncm-cli song lyric --songId <加密ID>` answers (field-verified 2026-07-16):
 *
 *     { "data": { "lyric": "[00:03.320]光落在你脸上\n…", "noLyric": false,
 *                 "transLyric": null, "txtLyric": "…" } }
 *
 * `lyric` is standard LRC — `[mm:ss.mmm]text`, possibly several timestamps
 * sharing one text line. Credit lines (作词/作曲) ride the same format at the
 * head; they are kept — the bar simply shows whatever the clock points at.
 */

export interface OnethingMusicLyricLine {
  /** Seconds from song start. */
  at: number
  text: string
}

const TIME_TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

export function parseLrcLyric(lrc: string): OnethingMusicLyricLine[] {
  const lines: OnethingMusicLyricLine[] = []
  for (const raw of lrc.split('\n')) {
    TIME_TAG.lastIndex = 0
    const stamps: number[] = []
    let match: RegExpExecArray | null
    let textStart = 0
    while ((match = TIME_TAG.exec(raw)) !== null) {
      if (match.index !== textStart) break // tags must be a leading run
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0
      stamps.push(minutes * 60 + seconds + fraction)
      textStart = TIME_TAG.lastIndex
    }
    const text = raw.slice(textStart).trim()
    if (stamps.length === 0 || !text) continue
    for (const at of stamps) lines.push({ at, text })
  }
  return lines.sort((a, b) => a.at - b.at)
}

/** The line the clock points at: last line at or before `position`. */
export function lyricLineAt(
  lines: OnethingMusicLyricLine[],
  position: number,
): string | undefined {
  let current: string | undefined
  for (const line of lines) {
    if (line.at > position) break
    current = line.text
  }
  return current
}

/** LRC head-matter: credits ride the same timed format as sung lines. */
const CREDIT_LINE = /(作词|作曲|编曲|混音|制作|监制|录音|母带|吉他|贝斯|键盘|鼓|和声|OP|SP)\s*[:：·/]/

/**
 * When the singing starts — the end of the instrumental intro. This is what
 * lets the DJ talk over the intro like a real host and shut up before the
 * vocal comes in. Credit lines (作词/作曲…, usually stamped in the first
 * seconds) are skipped; undefined means "no usable lyric timeline" and the
 * caller should not gamble.
 */
export function firstVocalStartAt(lines: OnethingMusicLyricLine[]): number | undefined {
  for (const line of lines) {
    if (CREDIT_LINE.test(line.text)) continue
    return line.at
  }
  return undefined
}

/**
 * Rough Mandarin TTS duration: ~4.2 characters/second, floored at 3s so even
 * a one-liner is not assumed instant. Used only to decide "does this patter
 * fit the intro" — a wrong guess degrades to talking a moment over the vocal
 * or finishing early, never to broken playback.
 */
export function estimateSpeechSeconds(text: string): number {
  return Math.max(3, text.length / 4.2)
}
