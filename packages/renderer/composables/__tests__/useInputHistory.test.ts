import { describe, expect, it } from 'vitest'
import {
  historyTextFromMessage,
  isSelectionOnFirstLine,
  isSelectionOnLastLine,
  resolveCursorLineEdges,
} from '../useInputHistory'
import { createSkillToken } from '@shared/prompt-references'

describe('上下键翻历史的首/末行判据', () => {
  // 软换行的输入框里，一段没有 `\n` 的长文本会折成好几个视觉行。按逻辑行判的话
  // 光标停在折行中段也算「第一行」，按上就用历史记录盖掉了正在写的草稿。
  const wrapped = 'a very long single paragraph with no newline characters at all'

  it('编辑器能测视觉行时以视觉行为准，不再被软换行骗过去', () => {
    const middleOfWrappedLine = 30

    expect(isSelectionOnFirstLine(wrapped, middleOfWrappedLine)).toBe(true) // 逻辑行的错判
    expect(
      resolveCursorLineEdges(wrapped, middleOfWrappedLine, { atFirstLine: false, atLastLine: false }),
    ).toEqual({ atFirstLine: false, atLastLine: false })
  })

  it('视觉行确认在首行时照常放行给历史记录', () => {
    expect(resolveCursorLineEdges(wrapped, 3, { atFirstLine: true, atLastLine: false })).toEqual({
      atFirstLine: true,
      atLastLine: false,
    })
  })

  it('编辑器测不出视觉行时退回逻辑行判断', () => {
    const value = 'one\ntwo\nthree'

    expect(resolveCursorLineEdges(value, 1, undefined)).toEqual({ atFirstLine: true, atLastLine: false })
    expect(resolveCursorLineEdges(value, 5, undefined)).toEqual({ atFirstLine: false, atLastLine: false })
    expect(resolveCursorLineEdges(value, value.length, undefined)).toEqual({ atFirstLine: false, atLastLine: true })
  })
})

describe('input history cursor helpers', () => {
  it('treats empty input as both first and last line', () => {
    expect(isSelectionOnFirstLine('', 0)).toBe(true)
    expect(isSelectionOnLastLine('', 0)).toBe(true)
  })

  it('detects selections on the first line', () => {
    const value = 'one\ntwo\nthree'

    expect(isSelectionOnFirstLine(value, 2)).toBe(true)
    expect(isSelectionOnFirstLine(value, 3)).toBe(true)
    expect(isSelectionOnFirstLine(value, 5)).toBe(false)
  })

  it('detects selections on the last line', () => {
    const value = 'one\ntwo\nthree'

    expect(isSelectionOnLastLine(value, 5)).toBe(false)
    expect(isSelectionOnLastLine(value, 8)).toBe(true)
    expect(isSelectionOnLastLine(value, value.length)).toBe(true)
  })

  it('treats a selection anchor on the middle line as neither first nor last', () => {
    const value = 'one\ntwo\nthree'
    const selectionAnchor = value.indexOf('two') + 1

    expect(isSelectionOnFirstLine(value, selectionAnchor)).toBe(false)
    expect(isSelectionOnLastLine(value, selectionAnchor)).toBe(false)
  })

  it('handles multiline boundaries around newline characters', () => {
    const value = 'one\ntwo'

    expect(isSelectionOnFirstLine(value, value.indexOf('\n'))).toBe(true)
    expect(isSelectionOnLastLine(value, value.indexOf('\n'))).toBe(false)
    expect(isSelectionOnFirstLine(value, value.indexOf('\n') + 1)).toBe(false)
    expect(isSelectionOnLastLine(value, value.indexOf('\n') + 1)).toBe(true)
  })

  it('restores skill references as composer tokens for history navigation', () => {
    expect(historyTextFromMessage({
      content: '<selected_skill name="IVA">expanded instructions</selected_skill>',
      contentParts: [
        { type: 'text', content: 'Use ' },
        {
          type: 'skill-ref',
          skillId: 'user:iva',
          name: 'IVA',
          description: '',
          source: 'user',
          content: 'expanded instructions',
          bodyHash: 'hash',
        },
        { type: 'text', content: ' now' },
      ],
    })).toBe(`Use ${createSkillToken('user:iva')} now`)
  })
})
