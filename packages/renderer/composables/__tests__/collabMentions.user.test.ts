// @vitest-environment happy-dom
/**
 * 「@我」pill 的身份来源 —— docs/design/collab-handle-codec.md §2.3 / §2.4。
 *
 * 守的命题:**用户不靠名字被认出来**。名字匹配正是 W14a 为 agent 废弃掉的东西
 * (改名即失效),而在句柄编解码闭合之前,用户是这套系统里唯一还退在那条老路上
 * 的身份 —— 于是改一次名,旧转录里所有「@我」高亮就一起哑掉。
 *
 * 现在消息自己带着 `kind:'user'` 的 label 快照,这一条因此与 agent 同级。
 */
import { describe, expect, it } from 'vitest'
import { renderCollabMentionMarkup } from '../collabInlineTags'
import { renderMarkdown } from '../useMarkdownRenderer'

const roster = [{ id: 'fe', name: '李工' }]

function html(
  text: string,
  mentions: Array<{ agentId: string; label: string; kind?: 'agent' | 'user' }>,
  userLabels: string[],
): string {
  return renderMarkdown(renderCollabMentionMarkup(text, mentions, roster, userLabels), false, {
    surface: 'document',
  })
}

describe('「@我」pill 的身份来源', () => {
  it('带 kind:user 的 mention → 认得出,且写作「@我」', () => {
    const out = html('@songyitian 你说了算', [{ kind: 'user', agentId: '', label: 'songyitian' }], [])
    expect(out).toContain('md-mention--me')
    expect(out).toContain('@我')
    // 用户没有 agent id,pill 上不该长出一个
    expect(out).not.toContain('data-mention-agent-id')
  })

  it('改名之后旧转录仍然认得出 —— 快照在消息里,不在当前档案里', () => {
    // 当前档案名已经换成「一天」,而这条老消息点的是「songyitian」。
    const out = html('@songyitian 在吗', [{ kind: 'user', agentId: '', label: 'songyitian' }], ['用户', '我', '一天'])
    expect(out).toContain('md-mention--me')
  })

  it('没有 mention 的老转录退回名字匹配(既有行为,不回归)', () => {
    const out = html('@一天 在吗', [], ['用户', '我', '一天'])
    expect(out).toContain('md-mention--me')
  })

  it('用户那一条不会把 agent 分支遮掉 —— 同一句里两种 pill 各就各位', () => {
    const out = html(
      '@songyitian 和 @小李 都看一下',
      [
        { kind: 'user', agentId: '', label: 'songyitian' },
        { agentId: 'fe', label: '小李' },
      ],
      [],
    )
    expect(out).toContain('md-mention--me')
    expect(out).toContain('data-mention-agent-id="fe"')
    expect(out).toContain('@李工')
  })
})
