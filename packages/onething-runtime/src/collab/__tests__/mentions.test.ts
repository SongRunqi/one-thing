/**
 * W14a 身份 id 化 — docs/design/multi-agent-collab-im.md §4.5.
 *
 * The three questions this file pins down:
 *  1. what a mention BECOMES (ids + a label snapshot, from a picker or a scan)
 *  2. which of the two decides an ACTIVATION when both are available
 *  3. what a mention READS AS after the mentioned member is renamed or deleted
 */
import { describe, expect, it } from 'vitest'
import { decideCollabActivations } from '../activation.js'
import {
  buildCollabMentions,
  mergeCollabMentions,
  normalizeCollabMentions,
  parseCollabMentions,
  renderCollabMentionText,
  resolveCollabMentionIds,
} from '../mentions.js'
import { projectRoomHistory } from '../projection.js'
import { buildWillingnessWindow } from '../willingness.js'
import type { CollabAgentLike, CollabMessageLike } from '../types.js'

const AGENTS: CollabAgentLike[] = [
  { id: 'pm', name: '阿明', title: '产品经理' },
  { id: 'fe', name: '小李', title: '前端工程师' },
  { id: 'research', name: '小研', title: '研究员' },
]

/** Two members that go by the same name — the case ids exist for. */
const TWINS: CollabAgentLike[] = [
  { id: 'fe-1', name: '小李' },
  { id: 'fe-2', name: '小李' },
]

/** 小李 was renamed to 李工 after the message was written. */
const RENAMED: CollabAgentLike[] = [
  { id: 'pm', name: '阿明' },
  { id: 'fe', name: '李工' },
]

describe('buildCollabMentions (name scan → identity)', () => {
  it('stamps the roster id and the display name at this moment', () => {
    expect(buildCollabMentions('@小李 帮忙看下,@阿明 拍板', AGENTS)).toEqual([
      { agentId: 'fe', label: '小李' },
      { agentId: 'pm', label: '阿明' },
    ])
  })

  it('claims every member sharing a name — bare text cannot disambiguate', () => {
    expect(buildCollabMentions('@小李 在吗', TWINS)).toEqual([
      { agentId: 'fe-1', label: '小李' },
      { agentId: 'fe-2', label: '小李' },
    ])
  })

  it('returns nothing for a mention-less message', () => {
    expect(buildCollabMentions('大家早', AGENTS)).toEqual([])
  })
})

describe('normalizeCollabMentions (untrusted input)', () => {
  it('rebuilds plain literals, drops junk and dedupes by id', () => {
    expect(normalizeCollabMentions([
      { agentId: 'fe', label: '小李' },
      { agentId: 'fe', label: '小李' },
      { agentId: '', label: 'x' },
      null,
      'nope',
    ])).toEqual([{ agentId: 'fe', label: '小李' }])
  })

  it('drops non-members and re-stamps labels from the roster', () => {
    // The sender claiming 小李 is called "老板" must not put that word in the room.
    expect(normalizeCollabMentions(
      [{ agentId: 'fe', label: '老板' }, { agentId: 'ghost', label: '幽灵' }],
      { members: AGENTS },
    )).toEqual([{ agentId: 'fe', label: '小李' }])
  })

  it('is empty for anything that is not an array', () => {
    expect(normalizeCollabMentions(undefined)).toEqual([])
    expect(normalizeCollabMentions({ agentId: 'fe' })).toEqual([])
  })
})

describe('mergeCollabMentions (picker ∪ scan, per-label authority)', () => {
  it('keeps a hand-typed mention the picker knew nothing about', () => {
    const picked = [{ agentId: 'fe', label: '小李' }]
    const parsed = [{ agentId: 'fe', label: '小李' }, { agentId: 'pm', label: '阿明' }]
    expect(mergeCollabMentions(picked, parsed)).toEqual([
      { agentId: 'fe', label: '小李' },
      { agentId: 'pm', label: '阿明' },
    ])
  })

  it('lets the picked id own its label — the twin is NOT pulled in', () => {
    const picked = [{ agentId: 'fe-2', label: '小李' }]
    const parsed = buildCollabMentions('@小李 你来', TWINS)
    expect(mergeCollabMentions(picked, parsed)).toEqual([{ agentId: 'fe-2', label: '小李' }])
  })
})

describe('resolveCollabMentionIds (consumption priority)', () => {
  it('prefers the ids on the message over its text', () => {
    expect(resolveCollabMentionIds(
      { content: '@小李 在吗', mentions: [{ agentId: 'fe-2', label: '小李' }] },
      TWINS,
    )).toEqual(['fe-2'])
  })

  it('falls back to the name scan when the field is absent (pre-W14a transcripts)', () => {
    expect(resolveCollabMentionIds({ content: '@小李 在吗' }, TWINS)).toEqual(['fe-1', 'fe-2'])
  })

  it('treats an EMPTY array as "mentions nobody", not as a missing field', () => {
    expect(resolveCollabMentionIds({ content: '@小李 在吗', mentions: [] }, TWINS)).toEqual([])
  })

  it('keeps working when the text no longer says the name (rename)', () => {
    expect(resolveCollabMentionIds(
      { content: '@小李 帮忙', mentions: [{ agentId: 'fe', label: '小李' }] },
      RENAMED,
    )).toEqual(['fe'])
    // …which is exactly what the name scan alone can no longer do:
    expect(parseCollabMentions('@小李 帮忙', RENAMED)).toEqual([])
  })
})

describe('decideCollabActivations — identity first (W14a)', () => {
  const base = { members: AGENTS, chainCount: 0, maxChain: 4 }

  it('activates by id even after the mentioned member was renamed', () => {
    const result = decideCollabActivations({
      ...base,
      members: RENAMED,
      authorKind: 'user',
      text: '@小李 看一下',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    expect(result.activations).toEqual([{ agentId: 'fe', reason: 'mention' }])
  })

  it('activates exactly the picked twin (id) — the text alone activates both', () => {
    expect(decideCollabActivations({
      ...base,
      members: TWINS,
      authorKind: 'user',
      text: '@小李 你来',
      mentions: [{ agentId: 'fe-2', label: '小李' }],
    }).activations).toEqual([{ agentId: 'fe-2', reason: 'mention' }])

    expect(decideCollabActivations({
      ...base,
      members: TWINS,
      authorKind: 'user',
      text: '@小李 你来',
    }).activations).toEqual([
      { agentId: 'fe-1', reason: 'mention' },
      { agentId: 'fe-2', reason: 'mention' },
    ])
  })

  it('still refuses non-members, the author itself and frozen rooms via the id path', () => {
    expect(decideCollabActivations({
      ...base,
      authorKind: 'user',
      text: '@幽灵 来',
      mentions: [{ agentId: 'ghost', label: '幽灵' }],
    }).activations).toEqual([])

    expect(decideCollabActivations({
      ...base,
      authorKind: 'agent',
      authorAgentId: 'fe',
      text: '@小李 @阿明',
      mentions: [{ agentId: 'fe', label: '小李' }, { agentId: 'pm', label: '阿明' }],
    }).activations).toEqual([{ agentId: 'pm', reason: 'mention' }])

    expect(decideCollabActivations({
      ...base,
      authorKind: 'user',
      text: '@小李 来',
      mentions: [{ agentId: 'fe', label: '小李' }],
      frozen: true,
    }).activations).toEqual([])
  })

  it('reports the chain block through the id path too', () => {
    const result = decideCollabActivations({
      ...base,
      authorKind: 'agent',
      authorAgentId: 'fe',
      text: '@阿明 你看',
      mentions: [{ agentId: 'pm', label: '阿明' }],
      chainCount: 4,
    })
    expect(result.activations).toEqual([])
    expect(result.blockedByChain).toBe(true)
  })
})

describe('renderCollabMentionText (display resolution)', () => {
  const mentions = [{ agentId: 'fe', label: '小李' }]

  it('repaints the mention with the current name', () => {
    expect(renderCollabMentionText('@小李 明天能好吗', mentions, RENAMED))
      .toBe('@李工 明天能好吗')
  })

  it('keeps the label snapshot when the agent is gone from the roster', () => {
    expect(renderCollabMentionText('@小李 明天能好吗', mentions, [{ id: 'pm', name: '阿明' }]))
      .toBe('@小李 明天能好吗')
  })

  it('leaves the text ALONE when one label resolves two ways (renamed twin)', () => {
    expect(renderCollabMentionText(
      '@小李 你来',
      [{ agentId: 'fe-1', label: '小李' }, { agentId: 'fe-2', label: '小李' }],
      [{ id: 'fe-1', name: '李工' }, { id: 'fe-2', name: '小李' }],
    )).toBe('@小李 你来')
  })

  it('rewrites every occurrence and touches nothing else', () => {
    expect(renderCollabMentionText('@小李 和 @小李工 不是一个人', mentions, RENAMED))
      .toBe('@李工 和 @李工工 不是一个人')
    expect(renderCollabMentionText('邮件是 a@小李.com', mentions, RENAMED))
      .toBe('邮件是 a@李工.com')
  })

  it('returns the input untouched without mentions, without @, or with no rename', () => {
    const text = '@小李 在吗'
    expect(renderCollabMentionText(text, undefined, RENAMED)).toBe(text)
    expect(renderCollabMentionText('没有艾特', mentions, RENAMED)).toBe('没有艾特')
    expect(renderCollabMentionText(text, mentions, AGENTS)).toBe(text)
  })
})

describe('rename resolution is the SAME on every surface', () => {
  const messages: CollabMessageLike[] = [
    {
      role: 'user',
      content: '@小李 登录页什么时候能好',
      mentions: [{ agentId: 'fe', label: '小李' }],
    },
    {
      role: 'assistant',
      agentId: 'pm',
      content: '@小李 说的明天',
      mentions: [{ agentId: 'fe', label: '小李' }],
    },
  ]

  it('projects the current name into the model view', () => {
    const projected = projectRoomHistory({ messages, selfAgentId: 'fe', agents: RENAMED })
    expect(projected).toEqual([
      { role: 'user', content: '<msg from="用户">@李工 登录页什么时候能好</msg>\n\n<msg from="阿明">@李工 说的明天</msg>' },
    ])
  })

  it('projects the current name into the willingness window', () => {
    expect(buildWillingnessWindow({ recent: messages, members: RENAMED })).toEqual([
      '用户: @李工 登录页什么时候能好',
      '阿明: @李工 说的明天',
    ])
  })
})

/**
 * R7 / P2-11 — the repaint disambiguates like the parser does.
 *
 * The candidate set used to hold only the RENAMED labels, so a short renamed
 * name could eat the opening of a longer one that had not changed.
 */
describe('renderCollabMentionText — longest name wins (P2-11)', () => {
  const MEMBERS = [
    { id: 'a', name: '小李新' },
    { id: 'b', name: '小李工' },
  ]

  it('does not let a renamed short name swallow a longer unchanged one', () => {
    // 小李 (id a) was renamed to 小李新; 小李工 (id b) was not touched.
    expect(renderCollabMentionText(
      '@小李工 你看下',
      [{ agentId: 'a', label: '小李' }, { agentId: 'b', label: '小李工' }],
      MEMBERS,
    )).toBe('@小李工 你看下')
  })

  it('still repaints the renamed one when it is the actual mention', () => {
    expect(renderCollabMentionText(
      '@小李 你看下',
      [{ agentId: 'a', label: '小李' }],
      MEMBERS,
    )).toBe('@小李新 你看下')
  })

  it('leaves a roster name that was never mentioned exactly as written', () => {
    expect(renderCollabMentionText(
      '@小李工 和 @小李 都看下',
      [{ agentId: 'a', label: '小李' }],
      MEMBERS,
    )).toBe('@小李工 和 @小李新 都看下')
  })
})
