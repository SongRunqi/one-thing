import { describe, expect, it } from 'vitest'
import {
  COLLAB_DRIVE_LABEL_TASK_HALTED,
  COLLAB_DRIVE_LABEL_TASK_REVIEW,
  decideCollabActivations,
  formatCollabActivationLabel,
} from '../activation.js'
import { computeCollabChainCount, collabMessageCountsTowardChain, collabMessageResetsChain } from '../chain.js'
import { parseCollabMentions } from '../mentions.js'
import { isCollabPassMessage } from '../pass.js'
import { formatCollabReplyQuote, mergeCollabProjectedRows, projectRoomHistory } from '../projection.js'
import {
  buildCollabRoomContext,
  buildCollabRoomSystemPrompt,
  formatCollabSelfTaskFacts,
  type CollabSelfTaskFact,
} from '../roster.js'
import {
  COLLAB_HALT_REASON_EXCERPT_CHARS,
  COLLAB_NO_EVIDENCE_TEXT,
  COLLAB_SYSTEM_SOURCE_MEMBERSHIP,
  COLLAB_SYSTEM_SOURCE_TASK,
  COLLAB_TASK_HALTED_DISPOSITION,
  buildCollabMembershipLines,
  buildCollabTaskDeliveredLine,
  buildCollabTaskDoneLine,
  buildCollabTaskHaltCapLine,
  buildCollabTaskHaltedLine,
  buildCollabTaskRequeueRefusedLine,
  formatCollabTaskEvidence,
  isCollabProjectedSystemLine,
} from '../system-lines.js'
import {
  COLLAB_HARVEST_SOURCE,
  isCollabDriveMessage,
  isCollabHarvestMessage,
  type CollabAgentLike,
  type CollabMessageLike,
} from '../types.js'

const AGENTS: CollabAgentLike[] = [
  { id: 'pm', name: '阿明', title: '产品经理', description: '拆解目标、分派任务' },
  { id: 'fe', name: '小李', title: '前端工程师' },
  { id: 'research', name: '小研', title: '研究员' },
]

describe('parseCollabMentions', () => {
  it('matches CJK names after @ in appearance order, deduped', () => {
    expect(parseCollabMentions('@小研 你看下,@阿明 拍板,@小研 再补充', AGENTS)).toEqual(['research', 'pm'])
  })

  it('prefers the longest name at the same @ position', () => {
    const members: CollabAgentLike[] = [
      { id: 'a', name: '小李' },
      { id: 'b', name: '小李工' },
    ]
    expect(parseCollabMentions('@小李工 上', members)).toEqual(['b'])
  })

  it('ignores text without mentions and unknown names', () => {
    expect(parseCollabMentions('大家好', AGENTS)).toEqual([])
    expect(parseCollabMentions('@路人甲 你好', AGENTS)).toEqual([])
    expect(parseCollabMentions(undefined, AGENTS)).toEqual([])
  })
})

describe('isCollabPassMessage', () => {
  it('accepts the bare sentinel with whitespace tolerance', () => {
    expect(isCollabPassMessage('[pass]')).toBe(true)
    expect(isCollabPassMessage('  [PASS]  \n')).toBe(true)
  })

  it('treats hedged multi-line output as normal speech', () => {
    expect(isCollabPassMessage('[pass]\n但是我想补充一点')).toBe(false)
    expect(isCollabPassMessage('我 pass')).toBe(false)
    expect(isCollabPassMessage('')).toBe(false)
  })
})

describe('isCollabDriveMessage', () => {
  it('detects drives by source or origin.source', () => {
    expect(isCollabDriveMessage({ role: 'user', source: 'collab' })).toBe(true)
    expect(isCollabDriveMessage({ role: 'user', origin: { source: 'collab' } })).toBe(true)
    expect(isCollabDriveMessage({ role: 'user', source: 'text' })).toBe(false)
    expect(isCollabDriveMessage({ role: 'assistant', source: 'collab' })).toBe(false)
  })
})

describe('projectRoomHistory', () => {
  const transcript: CollabMessageLike[] = [
    { role: 'user', content: '@阿明 官网改版,本周上线' },
    { role: 'user', content: '(激活:mention)', source: 'collab', origin: { source: 'collab' } },
    { role: 'assistant', content: '收到,拆解如下', agentId: 'pm', toolCalls: [{ name: 'board', arguments: { action: 'create' }, result: 'ok' }] },
    { role: 'assistant', content: '[pass]', agentId: 'research' },
    { role: 'assistant', content: '从实现角度讲,一周可行', agentId: 'fe' },
    { role: 'user', content: '@小李 工时压几天?' },
  ]

  it('keeps own messages as assistant and relays everyone else IM-style', () => {
    const projected = projectRoomHistory({ messages: transcript, selfAgentId: 'fe', agents: AGENTS })
    expect(projected).toEqual([
      {
        role: 'user',
        content: '<msg from="用户">@阿明 官网改版,本周上线</msg>\n\n<msg from="阿明">收到,拆解如下\n〔调用 board({"action":"create"}) → ok〕</msg>',
      },
      { role: 'assistant', content: '从实现角度讲,一周可行' },
      { role: 'user', content: '<msg from="用户">@小李 工时压几天?</msg>' },
    ])
  })

  it('excludes drives and pass turns from every projection', () => {
    const projected = projectRoomHistory({ messages: transcript, selfAgentId: 'pm', agents: AGENTS })
    const all = projected.map(entry => entry.content).join('\n')
    expect(all).not.toContain('激活:mention')
    expect(all).not.toContain('[pass]')
  })

  it('merges consecutive user-side blocks for alternation-strict providers', () => {
    const projected = projectRoomHistory({ messages: transcript, selfAgentId: 'research', agents: AGENTS })
    expect(projected).toHaveLength(1)
    expect(projected[0].role).toBe('user')
    expect(projected[0].content).toContain('<msg from="阿明">')
    expect(projected[0].content).toContain('<msg from="小李">')
  })

  it('never signs a line with a raw id, and labels known agents by bare name', () => {
    // P2-16: the roster is the room's CURRENT members, so a departed member
    // misses it — and `agent-a1b2…: 你好` in a prompt invites the model to guess
    // whether that is a person. A global lookup answers first; failing that,
    // the honest word.
    const projected = projectRoomHistory({
      messages: [{ role: 'assistant', content: '你好', agentId: 'ghost' }],
      selfAgentId: 'fe',
      agents: [{ id: 'other', name: '无衔' }],
    })
    expect(projected[0].content).toBe('<msg from="前成员">你好</msg>')

    const departed = projectRoomHistory({
      messages: [{ role: 'assistant', content: '你好', agentId: 'ghost' }],
      selfAgentId: 'fe',
      agents: [{ id: 'other', name: '无衔' }],
      resolveAgentName: id => (id === 'ghost' ? '老王' : undefined),
    })
    expect(departed[0].content).toBe('<msg from="老王">你好</msg>')

    const titleless = projectRoomHistory({
      messages: [{ role: 'assistant', content: '你好', agentId: 'other' }],
      selfAgentId: 'fe',
      agents: [{ id: 'other', name: '无衔' }],
    })
    expect(titleless[0].content).toBe('<msg from="无衔">你好</msg>')
  })
})

describe('projectRoomHistory — quote replies (W7 §3.5 A)', () => {
  it('renders a reply as the IM two-line form: quote above, speech below', () => {
    const projected = projectRoomHistory({
      messages: [{
        role: 'user',
        content: '那就按你说的做',
        replyTo: { messageId: 'm1', authorLabel: '阿明', excerpt: '我建议先做接口再做页面' },
      }],
      selfAgentId: 'fe',
      agents: AGENTS,
    })
    expect(projected).toEqual([{
      role: 'user',
      content: '<msg from="用户">> 阿明: 我建议先做接口再做页面\n那就按你说的做</msg>',
    }])
  })

  it('quotes an agent reply with the same shape', () => {
    const projected = projectRoomHistory({
      messages: [{
        role: 'assistant',
        agentId: 'fe',
        content: '我来接',
        replyTo: { messageId: 'm1', authorLabel: '用户', excerpt: '谁来做登录页?' },
      }],
      selfAgentId: 'pm',
      agents: AGENTS,
    })
    expect(projected[0].content).toBe('<msg from="小李">> 用户: 谁来做登录页?\n我来接</msg>')
  })

  it('keeps the quoted context even when the original is no longer in the window', () => {
    // The snapshot travels ON the reply — that is the whole point of copying
    // rather than pointing (§3.5 A).
    const projected = projectRoomHistory({
      messages: [{
        role: 'user',
        content: '同意',
        replyTo: { messageId: 'gone', authorLabel: '小研', excerpt: '数据支持这个方向' },
      }],
      selfAgentId: 'fe',
      agents: AGENTS,
    })
    expect(projected[0].content).toContain('> 小研: 数据支持这个方向')
  })

  it('drops an empty snapshot instead of emitting a bare quote marker', () => {
    const projected = projectRoomHistory({
      messages: [
        { role: 'user', content: '继续', replyTo: { messageId: 'm1', authorLabel: '阿明', excerpt: '  ' } },
      ],
      selfAgentId: 'fe',
      agents: AGENTS,
    })
    expect(projected[0].content).toBe('<msg from="用户">继续</msg>')
  })

  it('falls back to 成员 when the snapshot carries no author', () => {
    expect(formatCollabReplyQuote({ excerpt: '这条' })).toBe('> 成员: 这条')
    expect(formatCollabReplyQuote(undefined)).toBe('')
  })
})

describe('projectRoomHistory — reactions (W8 §3.5 B)', () => {
  it('tail-annotates a reacted user message with the aggregated tally', () => {
    const projected = projectRoomHistory({
      messages: [{
        role: 'user',
        content: '上线了',
        reactions: [{ emoji: '🎉', by: [{ type: 'agent', agentId: 'fe' }, { type: 'agent', agentId: 'pm' }] }],
      }],
      selfAgentId: 'fe',
      agents: AGENTS,
    })
    expect(projected[0].content).toBe('<msg from="用户">上线了 (🎉×2)</msg>')
  })

  it('annotates another agent’s speech too, and stacks with the quote line', () => {
    const projected = projectRoomHistory({
      messages: [{
        role: 'assistant',
        agentId: 'fe',
        content: '我来接',
        replyTo: { messageId: 'm1', authorLabel: '用户', excerpt: '谁来做登录页?' },
        reactions: [{ emoji: '👍', by: [{ type: 'user' }] }],
      }],
      selfAgentId: 'pm',
      agents: AGENTS,
    })
    // Quote stays on top; the tally rides the tail of the speech line itself.
    expect(projected[0].content).toBe('<msg from="小李">> 用户: 谁来做登录页?\n我来接 (👍)</msg>')
  })

  it('never annotates the activated agent’s OWN past speech', () => {
    // Appending words an agent did not write to its own transcript would make
    // it read「(👍)」as something it said.
    const projected = projectRoomHistory({
      messages: [{
        role: 'assistant',
        agentId: 'fe',
        content: '我来接',
        reactions: [{ emoji: '👍', by: [{ type: 'user' }] }],
      }],
      selfAgentId: 'fe',
      agents: AGENTS,
    })
    expect(projected).toEqual([{ role: 'assistant', content: '我来接' }])
  })

  it('leaves a message with no reactions byte-identical', () => {
    const projected = projectRoomHistory({
      messages: [
        { role: 'user', content: '继续', reactions: [] },
        { role: 'user', content: '再来', reactions: [{ emoji: '👍', by: [] }] },
      ],
      selfAgentId: 'fe',
      agents: AGENTS,
    })
    expect(projected[0].content).toBe('<msg from="用户">继续</msg>\n\n<msg from="用户">再来</msg>')
  })
})

describe('isCollabProjectedSystemLine (W9.1 放行/拒斥矩阵)', () => {
  it('admits marked task and membership lines, by source or origin.source', () => {
    expect(isCollabProjectedSystemLine({ role: 'system', source: COLLAB_SYSTEM_SOURCE_TASK })).toBe(true)
    expect(isCollabProjectedSystemLine({ role: 'system', source: COLLAB_SYSTEM_SOURCE_MEMBERSHIP })).toBe(true)
    expect(isCollabProjectedSystemLine({ role: 'system', origin: { source: COLLAB_SYSTEM_SOURCE_TASK } })).toBe(true)
  })

  it('rejects operational noise, unmarked system lines and non-system roles', () => {
    // Budget / chain gate / freeze / permission reminders are posted with the
    // plain collab source and must stay display-only.
    expect(isCollabProjectedSystemLine({ role: 'system', source: 'collab' })).toBe(false)
    expect(isCollabProjectedSystemLine({ role: 'system' })).toBe(false)
    expect(isCollabProjectedSystemLine({ role: 'system', source: 'text' })).toBe(false)
    expect(isCollabProjectedSystemLine({ role: 'user', source: COLLAB_SYSTEM_SOURCE_TASK })).toBe(false)
    expect(isCollabProjectedSystemLine({ role: 'assistant', source: COLLAB_SYSTEM_SOURCE_TASK })).toBe(false)
  })
})

describe('projectRoomHistory — collab system lines (W9.1)', () => {
  const transcript: CollabMessageLike[] = [
    { role: 'system', content: '「加 notes.txt」→ 小李 开始执行(看板可查看现场)', source: COLLAB_SYSTEM_SOURCE_TASK },
    { role: 'system', content: '今天这个房间已花费 $5.00,达到日预算 $5', source: 'collab' },
    { role: 'system', content: '「加 notes.txt」受阻:小李 无法继续,任务未交付', source: COLLAB_SYSTEM_SOURCE_TASK },
    { role: 'assistant', content: '已交付,notes.txt 写好了', agentId: 'fe' },
  ]

  it('relays marked task lines as 系统 blocks and drops the operational ones', () => {
    const projected = projectRoomHistory({ messages: transcript, selfAgentId: 'pm', agents: AGENTS })
    expect(projected).toEqual([
      {
        role: 'user',
        content: [
          '<msg from="系统">「加 notes.txt」→ 小李 开始执行(看板可查看现场)</msg>',
          '<msg from="系统">「加 notes.txt」受阻:小李 无法继续,任务未交付</msg>',
          '<msg from="小李">已交付,notes.txt 写好了</msg>',
        ].join('\n\n'),
      },
    ])
    // The reviewer must never be told about the budget gate.
    expect(projected[0].content).not.toContain('日预算')
  })

  it('projects membership lines the same way (W6 reuses the marker)', () => {
    const projected = projectRoomHistory({
      messages: [{ role: 'system', content: '小研 加入了群聊', source: COLLAB_SYSTEM_SOURCE_MEMBERSHIP }],
      selfAgentId: 'fe',
      agents: AGENTS,
    })
    expect(projected).toEqual([{ role: 'user', content: '<msg from="系统">小研 加入了群聊</msg>' }])
  })

  it('projects task facts to the agent they are about, too', () => {
    const projected = projectRoomHistory({ messages: transcript, selfAgentId: 'fe', agents: AGENTS })
    expect(projected[0].content).toContain('<msg from="系统">「加 notes.txt」受阻')
    expect(projected[1]).toEqual({ role: 'assistant', content: '已交付,notes.txt 写好了' })
  })
})

describe('buildCollabMembershipLines (W6 / §3.5 C 群公告)', () => {
  it('announces arrivals with the avatar mark, departures, then the new PM', () => {
    expect(buildCollabMembershipLines({
      previousMemberIds: ['pm', 'fe'],
      nextMemberIds: ['pm', 'research'],
      previousPmAgentId: 'pm',
      nextPmAgentId: 'research',
      agents: [
        { id: 'pm', name: '阿明', avatar: '📋' },
        { id: 'fe', name: '小李', avatar: '🔧' },
        { id: 'research', name: '小研', avatar: '🔎' },
      ],
    })).toEqual([
      '🔎 小研 加入了群聊',
      '小李 已被移出群聊',
      '小研 成为群负责人',
    ])
  })

  it('states the vacancy without re-naming a PM who just left', () => {
    const agents: CollabAgentLike[] = [{ id: 'pm', name: '阿明' }, { id: 'fe', name: '小李' }]
    expect(buildCollabMembershipLines({
      previousMemberIds: ['pm', 'fe'],
      nextMemberIds: ['fe'],
      previousPmAgentId: 'pm',
      agents,
    })).toEqual(['阿明 已被移出群聊', '群里暂时没有负责人'])

    // Demoted but still in the room — the name belongs in the line.
    expect(buildCollabMembershipLines({
      previousMemberIds: ['pm', 'fe'],
      nextMemberIds: ['pm', 'fe'],
      previousPmAgentId: 'pm',
      agents,
    })).toEqual(['阿明 不再是群负责人'])
  })

  it('says nothing when the roster only got reordered, and falls back to the id', () => {
    expect(buildCollabMembershipLines({
      previousMemberIds: ['pm', 'fe'],
      nextMemberIds: ['fe', 'pm'],
      previousPmAgentId: 'pm',
      nextPmAgentId: 'pm',
      agents: AGENTS,
    })).toEqual([])
    expect(buildCollabMembershipLines({
      previousMemberIds: [],
      nextMemberIds: ['ghost'],
    })).toEqual(['ghost 加入了群聊'])
  })

  it('membership lines are the projected kind — the room must know who left', () => {
    expect(isCollabProjectedSystemLine({
      role: 'system',
      source: COLLAB_SYSTEM_SOURCE_MEMBERSHIP,
    })).toBe(true)
  })
})

describe('buildCollabTaskHaltedLine (W9.2)', () => {
  it('states the fact (not delivered) before the disposition instruction', () => {
    const line = buildCollabTaskHaltedLine({ title: '给项目加 notes.txt', assigneeName: '小李' })
    expect(line).toBe(
      '「给项目加 notes.txt」受阻:小李 无法继续,任务未交付(原因见看板任务卡)。'
      + COLLAB_TASK_HALTED_DISPOSITION,
    )
    expect(line.indexOf('任务未交付')).toBeLessThan(line.indexOf('请负责人决定下一步'))
    // Disposition, not review: 重派/换人/改方案/问用户.
    expect(line).toContain('重新指派')
    expect(line).toContain('换人')
    expect(line).toContain('改方案')
    expect(line).toContain('向用户说明')
    expect(line).not.toContain('评审')
  })

  it('works without a known assignee', () => {
    expect(buildCollabTaskHaltedLine({ title: 'X' })).toContain('「X」受阻:无法继续,任务未交付')
  })

  // W9b.3: 「原因见看板任务卡」 was a dangling pointer — nothing ever wrote it.
  it('carries the reason excerpt instead of the dangling board pointer', () => {
    const line = buildCollabTaskHaltedLine({ title: 'X', assigneeName: '小李', reason: '  没有 write \n 工具  ' })
    expect(line).toContain('(原因: 没有 write 工具)')
    expect(line).not.toContain('原因见看板任务卡')
    expect(line).toContain(COLLAB_TASK_HALTED_DISPOSITION)
  })

  it('excerpts long reasons and keeps the pointer when nothing is knowable', () => {
    const long = buildCollabTaskHaltedLine({ title: 'X', reason: '很'.repeat(300) })
    expect(long).toContain(`原因: ${'很'.repeat(COLLAB_HALT_REASON_EXCERPT_CHARS)}…`)
    expect(buildCollabTaskHaltedLine({ title: 'X', reason: '   ' })).toContain('原因见看板任务卡')
  })
})

describe('halt cap lines (W9b.2)', () => {
  it('states the count, the stop, and that the user decides', () => {
    const line = buildCollabTaskHaltCapLine({ title: '加 notes.txt', haltedCount: 2, assigneeName: '小李', reason: '缺 write' })
    expect(line).toContain('第 2 次受阻')
    expect(line).toContain('(原因: 缺 write)')
    expect(line).toContain('已停止自动处置')
    expect(line).toContain('等用户决定下一步')
    // It must NOT ask anyone to dispose of it — that is the loop being cut.
    expect(line).not.toContain(COLLAB_TASK_HALTED_DISPOSITION)
  })

  it('says a refused re-dispatch executed nothing (no silent death path)', () => {
    const line = buildCollabTaskRequeueRefusedLine({ title: '加 notes.txt', haltedCount: 3 })
    expect(line).toContain('已受阻 3 次')
    expect(line).toContain('没有派出任何执行')
    expect(line).toContain('用户')
  })
})

describe('execution evidence lines (W9b.4)', () => {
  it('formats counts deterministically (count desc, then name)', () => {
    expect(formatCollabTaskEvidence({ toolCounts: { read: 2, write: 1, bash: 2 } }))
      .toBe('bash×2, read×2, write×1')
    expect(formatCollabTaskEvidence({ toolCounts: {} })).toBe('')
    expect(formatCollabTaskEvidence(undefined)).toBe('')
  })

  it('stamps the delivery with the machine-counted trace', () => {
    const line = buildCollabTaskDeliveredLine({
      title: '加 notes.txt',
      assigneeName: '小李',
      evidence: { toolCounts: { write: 1, read: 2 } },
    })
    expect(line).toBe('「加 notes.txt」小李 交付进入评审。执行记录: read×2, write×1')
  })

  it('marks a delivery with zero tool calls as 无执行记录 (the theatre tell)', () => {
    const line = buildCollabTaskDeliveredLine({ title: '加 notes.txt', assigneeName: '小李', evidence: { toolCounts: {} } })
    expect(line).toContain(COLLAB_NO_EVIDENCE_TEXT)
    expect(line).toContain('未经实际执行')
  })

  it('marks a done card with no evidence at all', () => {
    expect(buildCollabTaskDoneLine({ title: '加 notes.txt', evidence: { toolCounts: { write: 1 } } }))
      .toBe('「加 notes.txt」已标记完成。执行记录: write×1')
    const fake = buildCollabTaskDoneLine({ title: '加 notes.txt' })
    expect(fake).toContain(COLLAB_NO_EVIDENCE_TEXT)
    expect(fake).toContain('未经执行验证')
  })
})

describe('formatCollabActivationLabel (W9.2 受阻 vs 交付)', () => {
  it('separates the halted disposition drive from the delivery review drive', () => {
    expect(formatCollabActivationLabel('task-event', COLLAB_DRIVE_LABEL_TASK_HALTED)).toBe('任务受阻待处置')
    expect(formatCollabActivationLabel('task-event', COLLAB_DRIVE_LABEL_TASK_REVIEW)).toBe('任务交付待评审')
    expect(COLLAB_DRIVE_LABEL_TASK_HALTED).not.toBe(COLLAB_DRIVE_LABEL_TASK_REVIEW)
  })

  it('falls back to the reason label when no override is given', () => {
    expect(formatCollabActivationLabel('mention')).toBe('被 @ 激活')
    expect(formatCollabActivationLabel('self-elected')).toBe('主动接话')
    expect(formatCollabActivationLabel('task-event')).toBe('任务事件')
    expect(formatCollabActivationLabel('mention', '   ')).toBe('被 @ 激活')
  })
})

describe('decideCollabActivations', () => {
  const base = {
    members: AGENTS,
    chainCount: 0,
    maxChain: 4,
  }

  it('activates mentioned members in order', () => {
    const result = decideCollabActivations({ ...base, authorKind: 'user', text: '@小李 @小研 一起看看' })
    expect(result.activations).toEqual([
      { agentId: 'fe', reason: 'mention' },
      { agentId: 'research', reason: 'mention' },
    ])
  })

  it('activates nobody by position — a mention-less message goes to willingness', () => {
    const result = decideCollabActivations({ ...base, authorKind: 'user', text: '大家怎么看?' })
    expect(result.activations).toEqual([])
    expect(result.blockedByChain).toBeUndefined()
  })

  it('activates nobody for a mention-less agent message either', () => {
    const result = decideCollabActivations({ ...base, authorKind: 'agent', authorAgentId: 'fe', text: '我说完了' })
    expect(result.activations).toEqual([])
  })

  it('never activates the author itself', () => {
    const result = decideCollabActivations({ ...base, authorKind: 'agent', authorAgentId: 'fe', text: '@小李 @阿明' })
    expect(result.activations).toEqual([{ agentId: 'pm', reason: 'mention' }])
  })

  it('freezes agent-driven chains at the cap and reports the block', () => {
    const result = decideCollabActivations({
      ...base,
      authorKind: 'agent',
      authorAgentId: 'fe',
      text: '@阿明 你看',
      chainCount: 4,
    })
    expect(result.activations).toEqual([])
    expect(result.blockedByChain).toBe(true)
  })

  it('ignores mentions of non-members and honors frozen rooms', () => {
    expect(decideCollabActivations({ ...base, authorKind: 'user', text: '@路人 来' }).activations)
      .toEqual([])
    expect(decideCollabActivations({ ...base, authorKind: 'user', text: '@小李 来', frozen: true }).activations)
      .toEqual([])
  })
})

describe('chain accounting', () => {
  it('counts agent speech, ignores drives/pass, resets on real user messages', () => {
    const drive: CollabMessageLike = { role: 'user', content: 'x', source: 'collab' }
    const speech: CollabMessageLike = { role: 'assistant', content: '发言', agentId: 'fe' }
    const pass: CollabMessageLike = { role: 'assistant', content: '[pass]', agentId: 'fe' }
    const human: CollabMessageLike = { role: 'user', content: '继续' }

    expect(collabMessageCountsTowardChain(speech)).toBe(true)
    expect(collabMessageCountsTowardChain(pass)).toBe(false)
    expect(collabMessageCountsTowardChain({ role: 'assistant', content: '无署名' })).toBe(false)
    expect(collabMessageResetsChain(human)).toBe(true)
    expect(collabMessageResetsChain(drive)).toBe(false)

    expect(computeCollabChainCount([human, drive, speech, speech, human, drive, speech, pass])).toBe(1)
  })

  it('replay agrees with live accounting when harvest posts are mixed in (W12)', () => {
    const drive: CollabMessageLike = { role: 'user', content: 'x', source: 'collab' }
    const speech: CollabMessageLike = { role: 'assistant', content: '发言', agentId: 'fe' }
    const pass: CollabMessageLike = { role: 'assistant', content: '[pass]', agentId: 'fe' }
    const human: CollabMessageLike = { role: 'user', content: '继续' }
    // What coordinator.postAgentMessage writes: signed, but pipeline output.
    const harvest: CollabMessageLike = {
      role: 'assistant',
      content: '【交付】「重构首页」\n做完了',
      agentId: 'fe',
      source: COLLAB_HARVEST_SOURCE,
    }

    expect(isCollabHarvestMessage(harvest)).toBe(true)
    // The harvest marker must not be mistaken for a coordinator drive.
    expect(isCollabDriveMessage(harvest)).toBe(false)
    expect(collabMessageCountsTowardChain(harvest)).toBe(false)

    /** The live path: noteAgentSpoke is called only where the coordinator calls
     *  it — after a real agent turn — and is a noop for harvest posts. */
    const liveCount = (messages: readonly CollabMessageLike[]): number => {
      let count = 0
      for (const message of messages) {
        if (message.role === 'user' && !isCollabDriveMessage(message)) count = 0
        else if (isCollabHarvestMessage(message)) continue // noteAgentSpoke noop
        else if (message.role === 'assistant' && message.agentId && !isCollabPassMessage(message.content)) count += 1
      }
      return count
    }

    const transcript = [
      human, drive, speech,
      harvest, harvest,
      drive, speech, pass,
      harvest,
      drive, speech,
    ]
    expect(liveCount(transcript)).toBe(3)
    expect(computeCollabChainCount(transcript)).toBe(liveCount(transcript))

    // A human message still resets both sides to zero.
    expect(computeCollabChainCount([...transcript, human])).toBe(liveCount([...transcript, human]))
  })
})

describe('buildCollabRoomContext', () => {
  it('states the situation as facts: room, members, relay format — no rules', () => {
    const context = buildCollabRoomContext({
      self: AGENTS[1],
      members: AGENTS,
      roomName: '官网改版项目组',
    })
    expect(context).toContain('「官网改版项目组」')
    expect(context).toContain('用户、阿明(产品经理)、小研(研究员)')
    expect(context).not.toContain('小李') // self is not listed to itself
    expect(context).toContain('「名字: 内容」')
    // Capability facts prevent collective confabulation ("我扫了项目结构"
    // with zero tools) and dead discussions (members not @-ing each other).
    expect(context).toContain('board')
    expect(context).toContain('工作会话')
    expect(context).toContain('@名字')
    // No stage directions, no rule lists, no pass instruction.
    expect(context).not.toContain('铁律')
    expect(context).not.toContain('[pass]')
    expect(context).not.toContain('规则')
    expect(context).not.toContain('扮演')
  })
})

describe('self task facts (W9.3)', () => {
  const facts: CollabSelfTaskFact[] = [
    { id: 'a1b2c3d4-1111-2222-3333-444444444444', title: '给项目加 notes.txt', status: 'doing' },
    { id: 'ffffeeee-5555-6666-7777-888888888888', title: '重构配置读取', status: 'blocked' },
  ]

  it('states the cards as facts — short id, title, status — and nothing else', () => {
    const line = formatCollabSelfTaskFacts(facts)
    // W10: 状态用第一人称句子陈述,让"后台 worker 就是你自己"成为字面事实。
    expect(line).toBe('(你名下的任务:#a1b2c3d4「给项目加 notes.txt」——你正在工作会话里执行;#ffffeeee「重构配置读取」——你的执行受阻。以看板上的状态为准。)')
    // Facts only: no instruction, no role-play framing (persona 原文铁律).
    expect(line).not.toContain('你应该')
    expect(line).not.toContain('请')
    expect(line).not.toContain('必须')
  })

  it('never states an own card in the third person (W10)', () => {
    const doing = formatCollabSelfTaskFacts([facts[0]])
    expect(doing).toContain('你正在工作会话里执行')
    expect(doing).not.toContain('(进行中)')
    const blocked = formatCollabSelfTaskFacts([facts[1]])
    expect(blocked).toContain('你的执行受阻')
    expect(blocked).not.toContain('(受阻)')
  })

  it('says nothing when the agent has no in-flight card', () => {
    expect(formatCollabSelfTaskFacts([])).toBe('')
    expect(buildCollabRoomContext({ self: AGENTS[1], members: AGENTS, roomName: 'r' }))
      .not.toContain('你名下的任务')
  })

  it('rides along in the room note, after the situation note', () => {
    const context = buildCollabRoomContext({
      self: AGENTS[1],
      members: AGENTS,
      roomName: '官网改版项目组',
      taskFacts: facts,
    })
    expect(context).toContain('(你名下的任务:')
    expect(context.indexOf('(情况说明:')).toBeLessThan(context.indexOf('(你名下的任务:'))

    const prompt = buildCollabRoomSystemPrompt({
      self: AGENTS[1],
      members: AGENTS,
      roomName: '官网改版项目组',
      personaPrompt: '你是小李,前端工程师。',
      taskFacts: facts,
    })
    expect(prompt.startsWith('你是小李,前端工程师。')).toBe(true)
    expect(prompt).toContain('#ffffeeee「重构配置读取」——你的执行受阻')
  })
})

describe('buildCollabRoomSystemPrompt', () => {
  it('is the persona VERBATIM plus only the factual room note', () => {
    const persona = '你是小李,前端工程师。口头禅是"从实现角度讲"。'
    const prompt = buildCollabRoomSystemPrompt({
      self: AGENTS[1],
      members: AGENTS,
      roomName: '官网改版项目组',
      personaPrompt: persona,
    })
    expect(prompt.startsWith(persona)).toBe(true)
    expect(prompt).toContain('(情况说明:')
    // Nothing prepended, no wrapper sentences, no product identity.
    expect(prompt).not.toContain('你就是「')
    expect(prompt).not.toContain('扮演')
    expect(prompt).not.toContain('AI assistant')
  })

  it('falls back to a minimal persona line when the agent has no prompt', () => {
    const prompt = buildCollabRoomSystemPrompt({
      self: { id: 'x', name: '无声' },
      members: AGENTS,
      roomName: 'r',
      personaPrompt: '',
    })
    expect(prompt.startsWith('你是无声。')).toBe(true)
  })
})

/**
 * R4 / P2-13 — adjacency is one function now (mergeCollabProjectedRows), and it
 * finally covers the assistant side.
 *
 * Both projections merged consecutive USER blocks, inline, in two hand-kept-in-
 * sync walks — and neither merged assistant blocks. Since W14b an agent speaks
 * one message per `say` call, so a member that says three things in one turn
 * produced three adjacent assistant rows in its own projection and a 400 from
 * any alternation-strict provider.
 */
describe('mergeCollabProjectedRows (R4)', () => {
  it('merges consecutive user blocks', () => {
    expect(mergeCollabProjectedRows([
      { role: 'user', content: '<msg from="用户">一</msg>' },
      { role: 'user', content: '<msg from="小李">二</msg>' },
      { role: 'assistant', content: '三' },
    ])).toEqual([
      { role: 'user', content: '<msg from="用户">一</msg>\n\n<msg from="小李">二</msg>' },
      { role: 'assistant', content: '三' },
    ])
  })

  it('merges consecutive assistant blocks from the SAME agent', () => {
    expect(mergeCollabProjectedRows([
      { role: 'assistant', content: '一', agentId: 'fe' },
      { role: 'assistant', content: '二', agentId: 'fe' },
    ])).toEqual([{ role: 'assistant', content: '一\n\n二', agentId: 'fe' }])
  })

  it('never merges across agents', () => {
    const rows = [
      { role: 'assistant', content: '一', agentId: 'fe' },
      { role: 'assistant', content: '二', agentId: 'pm' },
    ]
    expect(mergeCollabProjectedRows(rows)).toEqual(rows)
  })

  it('leaves an alternating transcript alone', () => {
    const rows = [
      { role: 'user', content: '问' },
      { role: 'assistant', content: '答', agentId: 'fe' },
      { role: 'user', content: '再问' },
    ]
    expect(mergeCollabProjectedRows(rows)).toEqual(rows)
  })

  it('looks straight through display-only rows — downstream drops them', () => {
    const merged = mergeCollabProjectedRows([
      { role: 'user', content: '一' },
      { role: 'system', content: '房间已全部暂停' },
      { role: 'user', content: '二' },
    ])
    expect(merged).toEqual([
      { role: 'user', content: '一\n\n二' },
      { role: 'system', content: '房间已全部暂停' },
    ])
  })

  it('refuses to merge a row carrying structure — orphan tool_results are worse', () => {
    const rows = [
      { role: 'assistant', content: '一', agentId: 'fe' },
      { role: 'assistant', content: '二', agentId: 'fe', toolCalls: [{ id: 'c1' }] },
    ]
    expect(mergeCollabProjectedRows(rows, {
      hasStructuralPayload: row => Boolean((row as { toolCalls?: unknown[] }).toolCalls?.length),
    })).toEqual(rows)
  })

  it('concatenates attachments when it merges, and never edits the source row', () => {
    const first = { role: 'user', content: '一', attachments: [{ id: 'a' }] }
    const second = { role: 'user', content: '二', attachments: [{ id: 'b' }] }
    const merged = mergeCollabProjectedRows([first, second])

    expect(merged).toEqual([{ role: 'user', content: '一\n\n二', attachments: [{ id: 'a' }, { id: 'b' }] }])
    // A self message is pushed as the ORIGINAL stored object — rewriting it in
    // place would edit the transcript itself.
    expect(first).toEqual({ role: 'user', content: '一', attachments: [{ id: 'a' }] })
  })
})

describe('projectRoomHistory — 相邻发言合并 (R4)', () => {
  const MEMBERS = [{ id: 'fe', name: '小李' }, { id: 'pm', name: '阿明' }]
  const say = (agentId: string, content: string) =>
    ({ role: 'assistant' as const, agentId, content, source: 'collab-say' })

  it('merges one agent’s three say calls into one assistant block', () => {
    const projected = projectRoomHistory({
      messages: [say('fe', '一'), say('fe', '二'), say('fe', '三')],
      selfAgentId: 'fe',
      agents: MEMBERS,
    })
    expect(projected).toEqual([{ role: 'assistant', content: '一\n\n二\n\n三' }])
  })

  it('keeps other members on the user side, merged into one block', () => {
    const projected = projectRoomHistory({
      messages: [say('fe', '一'), say('fe', '二')],
      selfAgentId: 'pm',
      agents: MEMBERS,
    })
    expect(projected).toEqual([{ role: 'user', content: '<msg from="小李">一</msg>\n\n<msg from="小李">二</msg>' }])
  })

  it('merges across a system line that sits between two utterances', () => {
    const projected = projectRoomHistory({
      messages: [
        say('fe', '一'),
        { role: 'system', content: '「加 notes.txt」→ 小李 开始执行', source: 'collab-task' },
        say('fe', '二'),
      ],
      selfAgentId: 'pm',
      agents: MEMBERS,
    })
    // The task line projects as user-side text, so all three are one block.
    expect(projected).toHaveLength(1)
    expect(projected[0].role).toBe('user')
    expect(projected[0].content).toBe('<msg from="小李">一</msg>\n\n<msg from="系统">「加 notes.txt」→ 小李 开始执行</msg>\n\n<msg from="小李">二</msg>')
  })
})

/**
 * R7 / P2-17 — a freeze that eats an @ says so.
 *
 * Writing 「@小李 看一下」 into a room paused an hour ago produced nothing at
 * all: no answer, no refusal. That reads as a broken room rather than a paused
 * one. The decision now reports the swallowed mention so the coordinator can
 * post one line per freeze.
 */
describe('decideCollabActivations — 冻结吞 @ 出信号 (P2-17)', () => {
  it('flags a mention the freeze swallowed', () => {
    const decision = decideCollabActivations({
      authorKind: 'user',
      text: '@小李 看一下这个',
      members: AGENTS,
      chainCount: 0,
      maxChain: 8,
      frozen: true,
    })
    expect(decision.activations).toEqual([])
    expect(decision.blockedByFrozen).toBe(true)
  })

  it('stays quiet when the frozen room was not addressed', () => {
    const decision = decideCollabActivations({
      authorKind: 'user',
      text: '随便说一句',
      members: AGENTS,
      chainCount: 0,
      maxChain: 8,
      frozen: true,
    })
    expect(decision.blockedByFrozen).toBeUndefined()
  })

  it('does not apologise for a name that is not in the room', () => {
    const decision = decideCollabActivations({
      authorKind: 'user',
      text: '@路人甲 在吗',
      members: AGENTS,
      chainCount: 0,
      maxChain: 8,
      frozen: true,
    })
    expect(decision.blockedByFrozen).toBeUndefined()
  })

  it('says nothing new when the room is open — the flag is freeze-only', () => {
    const decision = decideCollabActivations({
      authorKind: 'user',
      text: '@小李 看一下这个',
      members: AGENTS,
      chainCount: 0,
      maxChain: 8,
    })
    expect(decision.blockedByFrozen).toBeUndefined()
    expect(decision.activations.map(entry => entry.agentId)).toEqual(['fe'])
  })
})
