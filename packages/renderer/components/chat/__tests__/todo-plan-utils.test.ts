import { describe, expect, it } from 'vitest'
import {
  applyMarkdownFormat,
  findMarkdownMatches,
  parseTasks,
  titleFromMarkdown,
  toggleTaskLine,
} from '../todo-plan-utils'

describe('todo-plan-utils', () => {
  it('parses markdown tasks outside fenced code blocks', () => {
    const tasks = parseTasks([
      '# Today',
      '## Now',
      '- [ ] Write Chinese note',
      '```',
      '- [ ] not a task',
      '```',
      '## Later',
      '- [x] Ship polish',
    ].join('\n'))

    expect(tasks).toEqual([
      { lineIndex: 2, done: false, text: 'Write Chinese note', section: 'Now' },
      { lineIndex: 7, done: true, text: 'Ship polish', section: 'Later' },
    ])
  })

  it('toggles a task line without changing surrounding markdown', () => {
    const content = '# Note\n\n- [ ] First\n- [x] Second\n'

    expect(toggleTaskLine(content, 2)).toBe('# Note\n\n- [x] First\n- [x] Second\n')
    expect(toggleTaskLine(content, 3)).toBe('# Note\n\n- [ ] First\n- [ ] Second\n')
  })

  it('finds Chinese text matches in markdown content', () => {
    const matches = findMarkdownMatches('# 计划\n\n今天修复中文输入，然后验证中文搜索。', '中文')

    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({ lineIndex: 2 })
  })

  it('uses the first markdown heading as the note title', () => {
    expect(titleFromMarkdown('\n# Meeting Notes\n\nBody', 'Fallback')).toBe('Meeting Notes')
    expect(titleFromMarkdown('\nPlain first line\n\nBody', 'Fallback')).toBe('Plain first line')
    expect(titleFromMarkdown('\n\n', 'Fallback')).toBe('Fallback')
  })

  it('applies keyboard markdown formats around the active selection', () => {
    const bold = applyMarkdownFormat('hello world', { from: 6, to: 11 }, 'bold')
    expect(bold.content).toBe('hello **world**')
    expect(bold.selection).toEqual({ from: 8, to: 13 })

    const task = applyMarkdownFormat('hello\nworld', { from: 7, to: 7 }, 'task')
    expect(task.content).toBe('hello\n- [ ] world')
  })
})
