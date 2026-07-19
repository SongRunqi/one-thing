import { describe, expect, it } from 'vitest'
import { estimateSpeechSeconds, firstVocalStartAt, lyricLineAt, parseLrcLyric } from '../lyrics.js'

/** Head of a real `ncm-cli song lyric` reply (光 - 陈粒, captured 2026-07-16). */
const REAL = '[00:00.000] 作词 : 陈粒\n[00:03.320]光落在你脸上\n[00:05.660]可爱一如往常\n'

describe('parseLrcLyric', () => {
  it('parses real ncm-cli LRC', () => {
    expect(parseLrcLyric(REAL)).toEqual([
      { at: 0, text: '作词 : 陈粒' },
      { at: 3.32, text: '光落在你脸上' },
      { at: 5.66, text: '可爱一如往常' },
    ])
  })

  it('expands multiple timestamps sharing one line, sorted', () => {
    expect(parseLrcLyric('[00:30.00][00:10.00]副歌')).toEqual([
      { at: 10, text: '副歌' },
      { at: 30, text: '副歌' },
    ])
  })

  it('drops untagged and empty lines', () => {
    expect(parseLrcLyric('纯文本行\n[00:05.00]\n[00:07.00]有词')).toEqual([
      { at: 7, text: '有词' },
    ])
  })
})

describe('firstVocalStartAt (talk-over-the-intro timing)', () => {
  it('skips credit head-matter and returns the first sung line', () => {
    const lines = parseLrcLyric(
      '[00:00.000] 作词 : 陈粒\n[00:01.000] 作曲 : 陈粒\n[00:02.320]编曲/混音：陈粒\n[00:15.500]光落在你脸上',
    )
    expect(firstVocalStartAt(lines)).toBe(15.5)
  })

  it('returns undefined for instrumentals / empty timelines', () => {
    expect(firstVocalStartAt([])).toBeUndefined()
    expect(
      firstVocalStartAt(parseLrcLyric('[00:00.00]作曲 : 坂本龍一\n[00:01.00]编曲：坂本龍一')),
    ).toBeUndefined()
  })

  it('a song that sings from the first second reports a tiny intro', () => {
    expect(firstVocalStartAt(parseLrcLyric('[00:00.80]第一句就开唱'))).toBe(0.8)
  })
})

describe('estimateSpeechSeconds', () => {
  it('scales with text length and never assumes instant', () => {
    expect(estimateSpeechSeconds('短')).toBe(3)
    const long = '这'.repeat(84)
    expect(estimateSpeechSeconds(long)).toBeCloseTo(20, 0)
  })
})

describe('lyricLineAt', () => {
  const lines = parseLrcLyric(REAL)

  it('points at the last line at or before the clock', () => {
    expect(lyricLineAt(lines, 4)).toBe('光落在你脸上')
    expect(lyricLineAt(lines, 5.66)).toBe('可爱一如往常')
    expect(lyricLineAt(lines, 999)).toBe('可爱一如往常')
  })

  it('is silent before the first line', () => {
    expect(lyricLineAt([{ at: 3, text: 'x' }], 1)).toBeUndefined()
  })
})
