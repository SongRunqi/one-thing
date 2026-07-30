/**
 * W14b 说话即行动 — the pure half.
 *
 * The load-bearing thing here is the EPOCH MATRIX: three kinds of assistant
 * message coexist in one transcript (say / thinking / pre-W14b), the rule is a
 * marker rather than a migration, and every consumer — projection, willingness
 * window, chain accounting, quote gap — has to read that marker the same way.
 * A mutation in any single predicate has to fail a test here.
 */
import { describe, expect, it } from 'vitest'
import {
  COLLAB_SAY_MAX_CHARS,
  COLLAB_SAY_REFUSED_BUDGET,
  COLLAB_SAY_REFUSED_FROZEN,
  COLLAB_SAY_SOURCE,
  COLLAB_TURN_SOURCE,
  formatCollabSayReceipt,
  formatCollabThinkingTraceLabel,
  isCollabSayMessage,
  isCollabThinkingMessage,
  normalizeCollabSayContent,
  resolveCollabSayMentions,
} from '../say.js'
import { collabMessageCountsTowardChain, computeCollabChainCount } from '../chain.js'
import { COLLAB_MESSAGE_SOURCE, isCollabDriveMessage } from '../types.js'
import { projectRoomHistory } from '../projection.js'
import { buildWillingnessWindow } from '../willingness.js'
import { isCollabVisibleRoomMessage, shouldAttachCollabReplyTo } from '../reply-quote.js'
import { buildCollabRoomContext } from '../roster.js'
import { buildCollabSilentDeliveryLine } from '../system-lines.js'
import {
  COLLAB_ROOM_TOOLS,
  COLLAB_WORK_REQUIRED_TOOLS,
  resolveCollabToolAllowlist,
} from '../tool-surface.js'
import type { CollabAgentLike, CollabMessageLike } from '../types.js'

const MEMBERS: CollabAgentLike[] = [
  { id: 'pm', name: '阿明', title: '产品' },
  { id: 'fe', name: '小李', title: '前端' },
]

/** The three epochs, as one transcript. */
const SAY: CollabMessageLike = {
  role: 'assistant',
  agentId: 'fe',
  content: '登录页明天下班前',
  source: COLLAB_SAY_SOURCE,
}
const THINKING: CollabMessageLike = {
  role: 'assistant',
  agentId: 'fe',
  content: '先看排期,再决定说不说',
  source: COLLAB_TURN_SOURCE,
}
const LEGACY: CollabMessageLike = {
  role: 'assistant',
  agentId: 'fe',
  content: '旧转录里,这条就是发言',
}

describe('epoch markers', () => {
  it('tells the three epochs apart', () => {
    expect(isCollabSayMessage(SAY)).toBe(true)
    expect(isCollabThinkingMessage(SAY)).toBe(false)

    expect(isCollabThinkingMessage(THINKING)).toBe(true)
    expect(isCollabSayMessage(THINKING)).toBe(false)

    expect(isCollabSayMessage(LEGACY)).toBe(false)
    expect(isCollabThinkingMessage(LEGACY)).toBe(false)
  })

  it('reads the marker off origin.source too (both writers, one rule)', () => {
    expect(isCollabSayMessage({ role: 'assistant', origin: { source: COLLAB_SAY_SOURCE } })).toBe(true)
    expect(isCollabThinkingMessage({ role: 'assistant', origin: { source: COLLAB_TURN_SOURCE } })).toBe(true)
  })

  it('never claims a non-assistant message', () => {
    expect(isCollabSayMessage({ role: 'user', source: COLLAB_SAY_SOURCE })).toBe(false)
    expect(isCollabThinkingMessage({ role: 'system', source: COLLAB_TURN_SOURCE })).toBe(false)
  })
})

describe('epoch matrix — chain accounting', () => {
  it('counts speech, ignores thinking, keeps the old epoch intact', () => {
    expect(collabMessageCountsTowardChain(SAY)).toBe(true)
    expect(collabMessageCountsTowardChain(THINKING)).toBe(false)
    expect(collabMessageCountsTowardChain(LEGACY)).toBe(true)
    expect(collabMessageCountsTowardChain({ ...LEGACY, content: '[pass]' })).toBe(false)
    // A say IS speech even if its text looks like the retired sentinel: the
    // marker outranks the words (pass 退役).
    expect(collabMessageCountsTowardChain({ ...SAY, content: '[pass]' })).toBe(true)
  })

  it('counts one per utterance, so live and replay agree', () => {
    // One turn: a thinking record and three things actually said.
    const transcript: CollabMessageLike[] = [
      { role: 'user', content: '大家看看' },
      THINKING,
      { ...SAY, content: '一' },
      { ...SAY, content: '二' },
      { ...SAY, content: '三' },
    ]
    expect(computeCollabChainCount(transcript)).toBe(3)
  })

  it('still resets on a human message', () => {
    expect(computeCollabChainCount([SAY, SAY, { role: 'user', content: '停' }, SAY])).toBe(1)
  })
})

describe('epoch matrix — projection', () => {
  const transcript: CollabMessageLike[] = [
    { role: 'user', content: '登录页什么时候能好?' },
    THINKING,
    SAY,
    LEGACY,
  ]

  it('projects what was said and drops the thinking record — for other members', () => {
    const projected = projectRoomHistory({ messages: transcript, selfAgentId: 'pm', agents: MEMBERS })
    const text = projected.map(entry => entry.content).join('\n')
    expect(text).toContain('<msg from="小李">登录页明天下班前')
    expect(text).toContain('旧转录里,这条就是发言')
    expect(text).not.toContain('先看排期')
  })

  it('drops it for its OWN author too — an agent does not re-read its thoughts', () => {
    const projected = projectRoomHistory({ messages: transcript, selfAgentId: 'fe', agents: MEMBERS })
    // R4: fe's two utterances are adjacent assistant rows and now merge into
    // one block (alternation-strict providers reject the pair), so the check is
    // over the text rather than over one row of it.
    const assistantText = projected.filter(entry => entry.role === 'assistant')
      .map(entry => entry.content)
      .join('\n')
    expect(assistantText).toContain('登录页明天下班前')
    expect(assistantText).not.toContain('先看排期')
  })
})

describe('epoch matrix — willingness window', () => {
  it('windows speech only', () => {
    const lines = buildWillingnessWindow({
      recent: [{ role: 'user', content: '在吗' }, THINKING, SAY],
      members: MEMBERS,
    })
    expect(lines).toEqual(['用户: 在吗', '小李: 登录页明天下班前'])
  })
})

describe('epoch matrix — quote gap', () => {
  it('does not count a thinking trace as a row the room saw', () => {
    expect(isCollabVisibleRoomMessage(SAY)).toBe(true)
    expect(isCollabVisibleRoomMessage(LEGACY)).toBe(true)
    expect(isCollabVisibleRoomMessage(THINKING)).toBe(false)
  })

  it('so a reply that only had a thinking record between it and the trigger stays bare', () => {
    const messages = [
      { ...({ role: 'user', content: '@小李 登录页?' } as CollabMessageLike), id: 'trigger' },
      { ...THINKING, id: 'think' },
      { ...SAY, id: 'reply' },
    ]
    expect(shouldAttachCollabReplyTo({
      messages,
      triggerMessageId: 'trigger',
      replyMessageId: 'reply',
      reply: SAY,
    })).toBe(false)
  })
})

describe('say mentions', () => {
  it('whitelists ids against the roster and re-labels from it (防冒名)', () => {
    expect(resolveCollabSayMentions({
      content: '拍个板',
      mentionAgentIds: ['pm', 'ghost'],
      members: MEMBERS,
    })).toEqual([{ agentId: 'pm', label: '阿明' }])
  })

  it('falls back to the prose scan for a bare @名字', () => {
    expect(resolveCollabSayMentions({ content: '@小李 你看一下', members: MEMBERS }))
      .toEqual([{ agentId: 'fe', label: '小李' }])
  })

  it('merges both without duplicating anyone', () => {
    expect(resolveCollabSayMentions({
      content: '@小李 你看一下',
      mentionAgentIds: ['pm', 'fe'],
      members: MEMBERS,
    })).toEqual([
      { agentId: 'pm', label: '阿明' },
      { agentId: 'fe', label: '小李' },
    ])
  })

  it('ignores garbage in the parameter instead of failing the utterance', () => {
    expect(resolveCollabSayMentions({ content: '没点名', mentionAgentIds: 'nope', members: MEMBERS }))
      .toEqual([])
    expect(resolveCollabSayMentions({ content: '没点名', mentionAgentIds: [null, 7], members: MEMBERS }))
      .toEqual([])
  })
})

describe('say content', () => {
  it('rejects nothing-to-say', () => {
    expect(normalizeCollabSayContent('')).toBeNull()
    expect(normalizeCollabSayContent('   \n ')).toBeNull()
    expect(normalizeCollabSayContent(undefined)).toBeNull()
  })

  it('trims and caps', () => {
    expect(normalizeCollabSayContent('  你好  ')).toBe('你好')
    expect(normalizeCollabSayContent('x'.repeat(COLLAB_SAY_MAX_CHARS + 50)))
      .toHaveLength(COLLAB_SAY_MAX_CHARS)
  })
})

describe('copy the agent reads', () => {
  it('names the failure as a DELIVERY failure, not an error code', () => {
    expect(COLLAB_SAY_REFUSED_FROZEN).toContain('未送达')
    expect(COLLAB_SAY_REFUSED_BUDGET).toContain('未送达')
  })

  it('hands the message id back so a follow-up can quote it', () => {
    expect(formatCollabSayReceipt('m-9')).toContain('m-9')
  })

  it('labels the trace with its step count', () => {
    expect(formatCollabThinkingTraceLabel(2)).toBe('思考过程 · 2 步')
    expect(formatCollabThinkingTraceLabel(0)).toBe('思考过程')
    expect(formatCollabThinkingTraceLabel(Number.NaN)).toBe('思考过程')
  })
})

describe('情况说明 — say is stated as a FACT (v3 铁律)', () => {
  const note = buildCollabRoomContext({
    self: MEMBERS[1],
    members: MEMBERS,
    roomName: '官网改版组',
  })

  it('states the mechanism: say sends, multiple calls allowed, params exist', () => {
    expect(note).toContain('say')
    expect(note).toContain('多次')
    expect(note).toContain('mentions')
    expect(note).toContain('replyTo')
  })

  it('states that not calling it is silence, and that thinking stays private', () => {
    expect(note).toContain('不调用 say 就是保持沉默')
    expect(note).toContain('思考过程')
  })

  it('never mentions stay_silent — the tool is retired (W22)', () => {
    // 退役清单的提示层一条:群里没有的工具不该出现在情况说明里,否则模型会
    // 去调一个不存在的名字,把一轮浪费在 "Tool not available" 上。
    expect(note).not.toContain('stay_silent')
    // …and the inventory line matches the union surface: own tools stay
    // available in a room turn (2026-07-30 收紧同日撤销),轻重活分界仍在。
    expect(note).toContain('你平时可用的工具在群里同样可用')
    expect(note).toContain('建卡指派')
  })

  it('keeps the board fact and adds no instruction', () => {
    expect(note).toContain('board')
    expect(note).not.toContain('你应该')
    expect(note).not.toContain('请务必')
  })
})

describe('工具面(D5 + W14b,union 语义)', () => {
  it('UNIONs say + board into a room turn, keeping the agent tools', () => {
    // Union(collab-team-v2 §2.1;2026-07-30 曾收紧为 replace,同日应用户
    // 要求撤销):配了白名单 → own ∪ {say, board},轻活可以在群回合直接做。
    expect(resolveCollabToolAllowlist({ kind: 'room', ownTools: ['read'] }))
      .toEqual(['read', 'say', 'board', 'dm'])
    // 没配白名单 = 跟随全局 = 不限制。
    expect(resolveCollabToolAllowlist({ kind: 'room' })).toBeNull()
    expect(resolveCollabToolAllowlist({ kind: 'agent' })).toBeNull()
    expect(resolveCollabToolAllowlist({ kind: 'agent', ownTools: ['read', 'render_preview'] }))
      .toEqual(['read', 'render_preview', 'say', 'board', 'dm'])
  })

  it('UNIONs say + board into a work session whitelist, keeping its real tools', () => {
    expect(resolveCollabToolAllowlist({ kind: 'work', ownTools: ['read'] }))
      .toEqual(['read', 'board', 'say'])
    expect(resolveCollabToolAllowlist({ kind: 'work', ownTools: ['read', 'say'] }))
      .toEqual(['read', 'say', 'board'])
  })

  it('offers stay_silent to NOBODY — the tool is retired (W22 退役清单)', () => {
    // 事故形状:一个惰性工具 + 一个「必须调工具」的开局 = 永不终止的落点。
    // 断路器是兜底,这里是根除:任何会话的工具面里都不该再出现这个名字。
    expect(COLLAB_ROOM_TOOLS).not.toContain('stay_silent')
    expect(COLLAB_WORK_REQUIRED_TOOLS).not.toContain('stay_silent')
    for (const kind of ['room', 'agent', 'work', 'chat']) {
      expect(resolveCollabToolAllowlist({ kind, ownTools: ['read'] }) ?? [])
        .not.toContain('stay_silent')
    }
  })

  it('leaves a work session with no whitelist unrestricted, and never touches chats', () => {
    expect(resolveCollabToolAllowlist({ kind: 'work', ownTools: null })).toBeNull()
    expect(resolveCollabToolAllowlist({ kind: 'chat', ownTools: null })).toBeNull()
    expect(resolveCollabToolAllowlist({ kind: 'chat', ownTools: ['read'] })).toEqual(['read'])
  })
})

describe('epoch 判别的变异锁', () => {
  it('marker outranks content — a say is speech no matter what it says', () => {
    // Mutation: falling through to the pass-sentinel check for say messages.
    expect(collabMessageCountsTowardChain({ ...SAY, content: '[pass]' })).toBe(true)
    expect(isCollabVisibleRoomMessage({ ...SAY, content: '  ' })).toBe(false) // empty is still empty
  })

  it('thinking wins over say when a message somehow carries both', () => {
    // Mutation: checking the say marker first would let a mislabelled record
    // count toward the chain and enter the projection.
    const both: CollabMessageLike = { ...SAY, origin: { source: COLLAB_TURN_SOURCE } }
    expect(collabMessageCountsTowardChain(both)).toBe(false)
    expect(projectRoomHistory({ messages: [both], selfAgentId: 'pm', agents: MEMBERS })).toEqual([])
  })

  it('an unmarked assistant message is never treated as thinking', () => {
    // Mutation: defaulting to "thinking" would erase every pre-W14b room.
    expect(isCollabThinkingMessage(LEGACY)).toBe(false)
    expect(collabMessageCountsTowardChain(LEGACY)).toBe(true)
    expect(projectRoomHistory({ messages: [LEGACY], selfAgentId: 'pm', agents: MEMBERS }))
      .toHaveLength(1)
  })

  it('the marker is scoped to collab: a lookalike source on a user message is inert', () => {
    expect(isCollabThinkingMessage({ role: 'user', source: COLLAB_TURN_SOURCE })).toBe(false)
    expect(collabMessageCountsTowardChain({ role: 'user', agentId: 'fe', content: 'x' })).toBe(false)
  })
})

describe('驱动消息不进投影、不计链', () => {
  const DRIVE: CollabMessageLike = {
    role: 'user',
    content: '(小李 · 主动接话)\n(你的发言通过 say 工具送出,可多次;说完直接结束。)',
    source: COLLAB_MESSAGE_SOURCE,
  }

  it('rides the drive marker, so it never enters anyone projection', () => {
    expect(isCollabDriveMessage(DRIVE)).toBe(true)
    expect(projectRoomHistory({
      messages: [{ role: 'user', content: '@小李 登录页?' }, DRIVE, THINKING, SAY],
      selfAgentId: 'fe',
      agents: MEMBERS,
    }).map(entry => entry.content).join('\n')).not.toContain('说完直接结束')
  })

  it('does not reset the chain the way a human message does', () => {
    // Mutation: a drive that counted as human input would hand the room an
    // extra chain budget every turn.
    expect(computeCollabChainCount([SAY, SAY, DRIVE, SAY])).toBe(3)
  })
})

describe('worker 交付兜底行(不冒名)', () => {
  it('says who did not speak, and carries the report anyway', () => {
    const line = buildCollabSilentDeliveryLine({
      title: '加 status.txt',
      assigneeName: '小李',
      summary: '文件已写入,内容为 ok',
      kind: 'delivery',
    })
    expect(line).toContain('小李')
    expect(line).toContain('没有在群里说明')
    expect(line).toContain('文件已写入')
  })

  it('has a distinct progress wording', () => {
    expect(buildCollabSilentDeliveryLine({ title: 'x', kind: 'progress' })).toContain('本轮结束')
  })
})
