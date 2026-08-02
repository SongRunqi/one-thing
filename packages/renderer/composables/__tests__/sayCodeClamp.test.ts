// @vitest-environment happy-dom
/**
 * 群聊 say 里的代码块折叠(im-message 设计稿 §F)。
 *
 * 守两条:**只在 say 作用域折**(主会话是读代码的地方,一行都不许折),以及
 * **折叠必须写明折了多少行** —— 不写行数的折叠是隐藏,不是收纳。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { SAY_CODE_CLAMP_LINES, applySayCodeClamp, renderMarkdown } from '../useMarkdownRenderer'

afterEach(() => { document.body.innerHTML = '' })

function mount(markdown: string, sayScope: boolean): HTMLElement {
  const host = document.createElement('div')
  if (sayScope) host.className = 'md-say-scope'
  host.innerHTML = renderMarkdown(markdown, false, { surface: 'document' })
  document.body.append(host)
  return host
}

function fence(lines: number): string {
  return ['```js', ...Array.from({ length: lines }, (_, i) => `const a${i} = ${i}`), '```'].join('\n')
}

describe('say 作用域的代码块折叠', () => {
  it('超过阈值 → 折叠,并把行数写在展开条上', () => {
    const host = mount(fence(SAY_CODE_CLAMP_LINES + 4), true)
    applySayCodeClamp(host)
    const container = host.querySelector('.code-block-container')
    expect(container?.classList.contains('is-say-clamped')).toBe(true)
    const more = host.querySelector('.say-code-more')
    expect(more?.textContent).toBe(`展开 ${SAY_CODE_CLAMP_LINES + 4} 行 ▾`)
    expect(host.querySelector('.say-code-fade')).not.toBeNull()
  })

  it('没超过阈值 → 一根线都不加', () => {
    const host = mount(fence(SAY_CODE_CLAMP_LINES), true)
    applySayCodeClamp(host)
    expect(host.querySelector('.say-code-more')).toBeNull()
    expect(host.querySelector('.code-block-container')?.classList.contains('is-say-clamped')).toBe(false)
  })

  it('主会话(不在 say 作用域)一行都不折', () => {
    const host = mount(fence(40), false)
    applySayCodeClamp(host)
    expect(host.querySelector('.say-code-more')).toBeNull()
  })

  it('点展开条 → 展开;再点 → 收起', () => {
    const host = mount(fence(30), true)
    applySayCodeClamp(host)
    const more = host.querySelector<HTMLElement>('.say-code-more')
    more?.click()
    expect(host.querySelector('.code-block-container')?.classList.contains('is-say-clamped')).toBe(false)
    expect(more?.textContent).toBe('收起 ▴')
    more?.click()
    expect(host.querySelector('.code-block-container')?.classList.contains('is-say-clamped')).toBe(true)
    expect(more?.textContent).toBe('展开 30 行 ▾')
  })

  it('重复跑不会挂第二枚展开条', () => {
    const host = mount(fence(30), true)
    applySayCodeClamp(host)
    applySayCodeClamp(host)
    expect(host.querySelectorAll('.say-code-more')).toHaveLength(1)
  })
})
