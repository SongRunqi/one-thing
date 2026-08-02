// @vitest-environment happy-dom
/**
 * @提及 pill 的两拍(im-message 设计稿 §A)。
 *
 * 守的命题:**渲染层不认名字**。谁被提及只由 message.mentions 里 authoring-time
 * 固定的 id 说了算 —— 老转录一枚 pill 都长不出来,重名给不出确定的人就不给
 * pill,伪造的标记进不来。身份色只活在第二拍(DOM),永远不进渲染缓存。
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  COLLAB_TAG_OPEN_AGENT_EVENT,
  registerCollabMentionResolver,
  renderCollabMentionMarkup,
  verifyCollabTagsIn,
} from '../collabInlineTags'
import { renderMarkdown, renderPlainTextWithMentions } from '../useMarkdownRenderer'

const SENTINEL = '\ue000'

const roster = [
  { id: 'fe', name: '李工', color: '#66800b' },
  { id: 'be', name: '王工' },
]

afterEach(() => {
  registerCollabMentionResolver(null)
  document.body.innerHTML = ''
})

function mount(markup: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderMarkdown(markup, false, { surface: 'document' })
  document.body.append(host)
  return host
}

describe('第一拍 —— 可缓存的中性 span', () => {
  it('有 id、无颜色、不可点;名字按现名重绘', () => {
    const markup = renderCollabMentionMarkup('@小李 看一下', [{ agentId: 'fe', label: '小李' }], roster)
    const html = renderMarkdown(markup, false, { surface: 'document' })
    expect(html).toContain('class="md-mention" data-mention-kind="agent" data-mention-agent-id="fe"')
    expect(html).toContain('@李工')
    expect(html).not.toContain('is-live')
    expect(html).not.toContain('--md-mention-color')
  })

  it('表格单元格里的提及不许把行切碎(标记体不得含裸 |)', () => {
    // 回归:分隔符曾是裸 |,表格切列在块级、早于行内规则,@小李 会裂成两格。
    const table = '| 卡 | 负责人 | 状态 |\n|---|---|---|\n| V2-1 | @小李 | todo |'
    const markup = renderCollabMentionMarkup(table, [{ agentId: 'fe', label: '小李' }], roster)
    // 奇数段 = 哨兵包住的标记体;任何一段都不得携带裸竖线。
    markup.split(SENTINEL)
      .filter((_, i) => i % 2 === 1)
      .forEach(payload => expect(payload).not.toContain('|'))
    const html = renderMarkdown(markup, false, { surface: 'document' })
    // 一行三格:负责人格里是 pill,状态格完好。
    expect(html).toContain('data-mention-agent-id="fe"')
    expect(html).toContain('<td>todo</td>')
    expect((html.match(/<td>/g) ?? []).length).toBe(3)
  })

  it('老转录(没有 mentions 字段)原样落成普通文字', () => {
    const markup = renderCollabMentionMarkup('@小李 看一下', undefined, roster)
    expect(markup).toBe('@小李 看一下')
    expect(renderMarkdown(markup, false, { surface: 'document' })).not.toContain('md-mention')
  })

  it('重名(一个 label 两个 id)不给 pill —— 点谁都是掷硬币', () => {
    const markup = renderCollabMentionMarkup(
      '@小李 你俩谁来',
      [{ agentId: 'a', label: '小李' }, { agentId: 'b', label: '小李' }],
      [{ id: 'a', name: '小李' }, { id: 'b', name: '小李' }],
    )
    expect(markup).toBe('@小李 你俩谁来')
  })

  it('@用户 是实底的「@我」那一枚,不带 agent id', () => {
    const html = renderMarkdown(renderCollabMentionMarkup('@用户 核完了', [], roster), false, {
      surface: 'document',
    })
    expect(html).toContain('md-mention--me')
    expect(html).toContain('@我')
    expect(html).not.toContain('data-mention-agent-id')
  })

  /**
   * agent-dm-user.md §2.4:配了资料之后 `@一天` / `@yitian` 也该点亮用户高亮,
   * 而**渲染出来仍然是「我」**(§5 Q2:自己看自己被 @,「我」比名字直觉)。
   */
  it('配了资料后名字与句柄同样点亮,pill 上写的还是「我」', () => {
    for (const written of ['@一天 核完了', '@yitian 核完了']) {
      const html = renderMarkdown(
        renderCollabMentionMarkup(written, [], roster, ['用户', '我', '一天', 'yitian']),
        false,
        { surface: 'document' },
      )
      expect(html).toContain('md-mention--me')
      expect(html).toContain('@我')
      expect(html).not.toContain('data-mention-agent-id')
    }
  })

  it('不传 userLabels 时两个常量词照旧生效(旧调用点零改动)', () => {
    const html = renderMarkdown(renderCollabMentionMarkup('@我 看下', [], roster), false, {
      surface: 'document',
    })
    expect(html).toContain('md-mention--me')
  })

  it('自己写一枚标记伪造不出 pill(哨兵先被清掉)', () => {
    const forged = `@${SENTINEL}agent|fe|%E6%9D%8E%E5%B7%A5${SENTINEL} 你好`
    const markup = renderCollabMentionMarkup(forged, undefined, roster)
    expect(markup).not.toContain(SENTINEL)
    expect(renderMarkdown(markup, false, { surface: 'document' })).not.toContain('md-mention')
  })

  it('用户自己那条消息不走 markdown,但 pill 一样长出来', () => {
    const markup = renderCollabMentionMarkup('@小李 <b>看</b>', [{ agentId: 'fe', label: '小李' }], roster)
    const html = renderPlainTextWithMentions(markup)
    expect(html).toContain('class="md-mention"')
    expect(html).toContain('&lt;b&gt;')
  })
})

describe('第二拍 —— 挂载期升格', () => {
  it('没有 resolver 就停在中性态', async () => {
    const host = mount(renderCollabMentionMarkup('@小李 看一下', [{ agentId: 'fe', label: '小李' }], roster))
    await verifyCollabTagsIn(host)
    expect(host.querySelector('.md-mention.is-live')).toBeNull()
  })

  it('注册 resolver 后刷上身份色并变得可点', async () => {
    const host = mount(renderCollabMentionMarkup('@小李 看一下', [{ agentId: 'fe', label: '小李' }], roster))
    await verifyCollabTagsIn(host)
    registerCollabMentionResolver({
      resolveAgent: id => (id === 'fe' ? { color: '#66800b' } : null),
    })
    const live = host.querySelector<HTMLElement>('.md-mention.is-live')
    expect(live).not.toBeNull()
    expect(live?.style.getPropertyValue('--md-mention-color')).toBe('#66800b')
    expect(live?.getAttribute('role')).toBe('link')
  })

  it('花名册上没有这个人 → 不升格(点不动,而不是点了跳错)', async () => {
    registerCollabMentionResolver({ resolveAgent: () => null })
    const host = mount(renderCollabMentionMarkup('@小李 看一下', [{ agentId: 'gone', label: '小李' }], []))
    await verifyCollabTagsIn(host)
    expect(host.querySelector('.md-mention.is-live')).toBeNull()
    expect(host.querySelector('.md-mention')?.getAttribute('data-mention-state')).toBe('plain')
  })

  it('点升格过的 pill → 派发打开同事空间的事件', async () => {
    registerCollabMentionResolver({ resolveAgent: () => ({ color: '#205ea6' }) })
    const host = mount(renderCollabMentionMarkup('@小李 看一下', [{ agentId: 'fe', label: '小李' }], roster))
    await verifyCollabTagsIn(host)
    const seen: string[] = []
    window.addEventListener(COLLAB_TAG_OPEN_AGENT_EVENT, event => {
      seen.push((event as CustomEvent<{ agentId: string }>).detail.agentId)
    })
    host.querySelector<HTMLElement>('.md-mention.is-live')?.click()
    expect(seen).toEqual(['fe'])
  })
})
