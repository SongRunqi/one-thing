import { describe, expect, it } from 'vitest'
import { applyMarkdownCommand, normalizeMarkdownFeatures } from '../markdown-document'

describe('markdown document commands', () => {
  it('formats inline selections and keeps the selected text active', () => {
    const result = applyMarkdownCommand('hello world', { from: 6, to: 11 }, 'bold')

    expect(result.content).toBe('hello **world**')
    expect(result.selection).toEqual({ from: 8, to: 13 })

    expect(applyMarkdownCommand('hello world', { from: 6, to: 11 }, 'strikethrough').content)
      .toBe('hello ~~world~~')
    expect(applyMarkdownCommand('hello world', { from: 6, to: 11 }, 'underline').content)
      .toBe('hello <u>world</u>')
  })

  it('turns selected lines into headings, lists, tasks, and quotes', () => {
    expect(applyMarkdownCommand('Title', { from: 0, to: 5 }, 'heading-2').content).toBe('## Title')
    expect(applyMarkdownCommand('one\ntwo', { from: 0, to: 7 }, 'ordered-list').content).toBe('1. one\n2. two')
    expect(applyMarkdownCommand('do it', { from: 0, to: 0 }, 'task-list').content).toBe('- [ ] do it')
    expect(applyMarkdownCommand('note', { from: 0, to: 4 }, 'blockquote').content).toBe('> note')
  })

  it('inserts document blocks as standard markdown text', () => {
    expect(applyMarkdownCommand('', { from: 0, to: 0 }, 'table').content).toContain('| Column A | Column B |')
    expect(applyMarkdownCommand('', { from: 0, to: 0 }, 'code-block').content).toBe('```\ncode\n```')
    expect(applyMarkdownCommand('hello', { from: 5, to: 5 }, 'horizontal-rule').content).toBe('hello\n\n---\n')
  })

  it('normalizes feature flags without mutating defaults', () => {
    expect(normalizeMarkdownFeatures({ images: false })).toMatchObject({
      tasks: true,
      tables: true,
      images: false,
      math: true,
    })
  })
})
