/**
 * 悬浮操作条上的表情账(im-message §E)。
 *
 * 这里守的是「读失败 = 回默认,而不是空着」以及「最近使用是一份去重的短表」
 * —— 偏好这种东西坏起来是静悄悄的,只有用例看得见。
 */
import { describe, expect, it } from 'vitest'
import {
  SAY_DEFAULT_RECENT_EMOJIS,
  SAY_QUICK_EMOJI_COUNT,
  SAY_RECENT_EMOJI_MAX,
  SAY_RECENT_EMOJI_STORAGE_KEY,
  pushSayRecentEmoji,
  quickSayEmojis,
  readSayRecentEmojis,
  writeSayRecentEmojis,
} from '../say-emoji'

function fakeStorage(initial?: string) {
  const map = new Map<string, string>()
  if (initial !== undefined) map.set(SAY_RECENT_EMOJI_STORAGE_KEY, initial)
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
  }
}

describe('读最近使用', () => {
  it('没存过 → 默认三枚', () => {
    expect(readSayRecentEmojis(fakeStorage())).toEqual([...SAY_DEFAULT_RECENT_EMOJIS])
  })

  it('存坏了(不是 JSON)→ 默认三枚,不抛', () => {
    expect(readSayRecentEmojis(fakeStorage('{oops'))).toEqual([...SAY_DEFAULT_RECENT_EMOJIS])
  })

  it('存的不是表 / 是空表 → 默认三枚', () => {
    expect(readSayRecentEmojis(fakeStorage('"👍"'))).toEqual([...SAY_DEFAULT_RECENT_EMOJIS])
    expect(readSayRecentEmojis(fakeStorage('[]'))).toEqual([...SAY_DEFAULT_RECENT_EMOJIS])
  })

  it('没有 localStorage(web/测试环境)→ 默认三枚', () => {
    expect(readSayRecentEmojis(null)).toEqual([...SAY_DEFAULT_RECENT_EMOJIS])
  })

  it('存过就用存的,顺带滤掉脏条目', () => {
    expect(readSayRecentEmojis(fakeStorage('["🔥", "", 3, "🔥", "👀"]'))).toEqual(['🔥', '👀'])
  })
})

describe('记一枚', () => {
  it('提到队首', () => {
    expect(pushSayRecentEmoji(['👍', '🎯'], '🔥')).toEqual(['🔥', '👍', '🎯'])
  })

  it('已经在表里 → 提到队首而不是重复一份', () => {
    expect(pushSayRecentEmoji(['👍', '🎯', '🔥'], '🔥')).toEqual(['🔥', '👍', '🎯'])
  })

  it('截断到上限', () => {
    const long = ['1', '2', '3', '4', '5', '6', '7']
    expect(pushSayRecentEmoji(long, '0')).toHaveLength(SAY_RECENT_EMOJI_MAX)
    expect(pushSayRecentEmoji(long, '0')[0]).toBe('0')
  })

  it('空串不记', () => {
    expect(pushSayRecentEmoji(['👍'], '  ')).toEqual(['👍'])
  })
})

describe('快捷位', () => {
  it('永远是三枚:不足的用默认补齐', () => {
    expect(quickSayEmojis(['🔥'])).toEqual(['🔥', '👍', '🎯'])
    expect(quickSayEmojis([])).toHaveLength(SAY_QUICK_EMOJI_COUNT)
  })

  it('取最近的前三枚', () => {
    expect(quickSayEmojis(['🔥', '👀', '🙏', '💯'])).toEqual(['🔥', '👀', '🙏'])
  })
})

describe('写回', () => {
  it('落到 localStorage;没有存储时静默', () => {
    const storage = fakeStorage()
    writeSayRecentEmojis(['🔥', '👍'], storage)
    expect(JSON.parse(storage.map.get(SAY_RECENT_EMOJI_STORAGE_KEY) ?? '[]')).toEqual(['🔥', '👍'])
    expect(() => writeSayRecentEmojis(['🔥'], null)).not.toThrow()
  })
})
