// @vitest-environment happy-dom
/**
 * 防线二「渲染验真」(collab-team-v2 §6.1)。
 *
 * 这里守的核心命题只有一句:**没有验真通过的标签必须点不动**。默认态、验真
 * 失败态、没有 verifier 的态,三条路都得停在纯文本上 —— 一枚能点的假链接比
 * 一行假话更危险,因为它看起来像系统在背书。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COLLAB_TAG_OPEN_CARD_EVENT,
  COLLAB_TAG_OPEN_FILE_EVENT,
  registerCollabTagVerifier,
  verifyCollabTagsIn,
} from '../collabInlineTags'
import { renderMarkdown } from '../useMarkdownRenderer'

afterEach(() => {
  registerCollabTagVerifier(null)
  document.body.innerHTML = ''
})

function mount(markdown: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderMarkdown(markdown, false, { surface: 'document' })
  document.body.append(host)
  return host
}

describe('markdown 规则', () => {
  it('把 <card>/<file> 渲染成中性 span,不产生链接', () => {
    const html = renderMarkdown('做完了 <card id="75a8f033aabb"/>,产物 <file path="docs/a.md"/>', false, {
      surface: 'document',
    })
    expect(html).toContain('class="collab-tag collab-tag--card" data-collab-card-id="75a8f033aabb"')
    expect(html).toContain('#75a8f033')
    expect(html).toContain('data-collab-file-path="docs/a.md"')
    expect(html).toContain('>a.md<')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('is-live')
  })

  it('围栏里的标签仍然是代码', () => {
    const html = renderMarkdown('```\n<card id="abc"/>\n```', false, { surface: 'document' })
    expect(html).not.toContain('collab-tag')
    expect(html).toContain('&lt;card')
  })

  it('畸形标签走 markdown-it 的转义老路', () => {
    const html = renderMarkdown('<card/> 和 <script>x</script>', false, { surface: 'document' })
    expect(html).not.toContain('collab-tag')
    expect(html).not.toContain('<script>')
  })

  it('allowHtml 仍然是 false —— 规则没有开任何 HTML 口子', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">', false, { surface: 'document' })
    expect(html).toContain('&lt;img')
  })
})

describe('验真', () => {
  it('没有 verifier 时一枚都不升格', async () => {
    const host = mount('见 <card id="abc"/>')
    await verifyCollabTagsIn(host)
    expect(host.querySelector('.collab-tag.is-live')).toBeNull()
    expect(host.querySelector('.collab-tag')?.getAttribute('data-collab-verify')).toBe('plain')
  })

  it('卡不存在 → 停在纯文本', async () => {
    registerCollabTagVerifier({ verifyCard: () => null, verifyFile: () => null })
    const host = mount('见 <card id="nope"/>')
    await verifyCollabTagsIn(host)
    expect(host.querySelector('.collab-tag.is-live')).toBeNull()
  })

  it('卡存在 → 升格并换成看板现时标题', async () => {
    registerCollabTagVerifier({
      verifyCard: id => ({ id: `${id}-full`, title: '改登录页' }),
      verifyFile: () => null,
    })
    const host = mount('见 <card id="75a8f033"/>')
    await verifyCollabTagsIn(host)
    const tag = host.querySelector('.collab-tag.is-live')
    expect(tag).not.toBeNull()
    expect(tag?.textContent).toBe('#75a8f033「改登录页」')
    expect(tag?.getAttribute('data-collab-resolved')).toBe('75a8f033-full')
    expect(tag?.getAttribute('role')).toBe('link')
  })

  it('文件存在 → 记住解析出来的绝对路径', async () => {
    registerCollabTagVerifier({
      verifyCard: () => null,
      verifyFile: async path => ({ absolutePath: `/room/${path}` }),
    })
    const host = mount('产物 <file path="docs/a.md"/>')
    await verifyCollabTagsIn(host)
    expect(host.querySelector('.collab-tag.is-live')?.getAttribute('data-collab-resolved'))
      .toBe('/room/docs/a.md')
  })

  it('同一枚标签只问一次(一屏十几处提及不该打成风暴)', async () => {
    const verifyCard = vi.fn(() => ({ id: 'abc' }))
    registerCollabTagVerifier({ verifyCard, verifyFile: () => null })
    const host = mount('<card id="abc"/> 再说一次 <card id="abc"/>')
    await verifyCollabTagsIn(host)
    expect(verifyCard).toHaveBeenCalledTimes(1)
    expect(host.querySelectorAll('.collab-tag.is-live')).toHaveLength(2)
  })
})

describe('点击', () => {
  it('升格过的卡标签派发定位事件', async () => {
    registerCollabTagVerifier({ verifyCard: id => ({ id }), verifyFile: () => null })
    const host = mount('见 <card id="abc"/>')
    await verifyCollabTagsIn(host)
    const seen: string[] = []
    window.addEventListener(COLLAB_TAG_OPEN_CARD_EVENT, event => {
      seen.push((event as CustomEvent<{ taskId: string }>).detail.taskId)
    })
    host.querySelector<HTMLElement>('.collab-tag.is-live')?.click()
    expect(seen).toEqual(['abc'])
  })

  it('没升格的标签点了什么也不发生', async () => {
    registerCollabTagVerifier({ verifyCard: () => null, verifyFile: () => null })
    const host = mount('见 <card id="abc"/>')
    await verifyCollabTagsIn(host)
    const listener = vi.fn()
    window.addEventListener(COLLAB_TAG_OPEN_CARD_EVENT, listener)
    window.addEventListener(COLLAB_TAG_OPEN_FILE_EVENT, listener)
    host.querySelector<HTMLElement>('.collab-tag')?.click()
    expect(listener).not.toHaveBeenCalled()
  })
})
