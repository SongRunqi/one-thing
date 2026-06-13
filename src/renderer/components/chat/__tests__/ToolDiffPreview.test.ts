// @vitest-environment happy-dom
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToolDiffPreview from '../ToolDiffPreview.vue'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const componentSource = fs.readFileSync(path.resolve(dirname, '../ToolDiffPreview.vue'), 'utf8')

describe('ToolDiffPreview', () => {
  it('renders ordinary diff lines with read-style plain text while preserving change highlighting', () => {
    const wrapper = mount(ToolDiffPreview, {
      props: {
        status: 'completed',
        wrap: true,
        diff: {
          diff: '',
          additions: 1,
          deletions: 0,
          filePath: 'src/app.ts',
        },
        lines: [
          {
            class: '',
            prefix: ' ',
            content: 'const value = 1',
            oldNum: 1,
            newNum: 1,
          },
          {
            class: 'diff-add',
            prefix: '+',
            content: 'const next = 2',
            newNum: 2,
          },
        ],
      },
    })

    const rows = wrapper.findAll('[data-diff-line]')

    expect(rows[0].find('.syntax-keyword').exists()).toBe(false)
    expect(rows[0].text()).toContain('const value = 1')
    expect(rows[1].find('.syntax-keyword').exists()).toBe(true)
  })

  it('keeps ordinary diff rows on a single neutral background layer', () => {
    expect(componentSource).toContain('--diff-normal-bg: color-mix')
    expect(componentSource).toContain('.diff-line {\n  --row-bg: transparent;')
    expect(componentSource).toContain('.diff-content:not(.wrap) .line-gutter')
  })
})
