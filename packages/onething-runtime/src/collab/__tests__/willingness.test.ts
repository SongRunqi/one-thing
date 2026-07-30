import { describe, expect, it } from 'vitest'
import {
  COLLAB_WILLINGNESS_LINE_LIMIT,
  COLLAB_WILLINGNESS_PM_FACT,
  buildWillingnessPrompt,
  buildWillingnessWindow,
  parseWillingnessReply,
} from '../willingness.js'
import {
  COLLAB_SYSTEM_SOURCE_MEMBERSHIP,
  COLLAB_SYSTEM_SOURCE_TASK,
} from '../system-lines.js'
import type { CollabAgentLike, CollabMessageLike } from '../types.js'

const AGENTS: CollabAgentLike[] = [
  { id: 'pm', name: '阿明', title: '产品经理' },
  { id: 'fe', name: '小李', title: '前端工程师' },
  { id: 'research', name: '小研', title: '研究员' },
]

const PERSONA = '你是小李,前端工程师。口头禅是"从实现角度讲"。'

const TRANSCRIPT: CollabMessageLike[] = [
  { role: 'user', content: '官网改版,本周上线' },
  { role: 'user', content: '(阿明 · 被 @ 激活)', source: 'collab', origin: { source: 'collab' } },
  { role: 'assistant', content: '收到,我来拆解', agentId: 'pm' },
  { role: 'assistant', content: '[pass]', agentId: 'research' },
  { role: 'system', content: '房间已全部暂停' },
  { role: 'assistant', content: '从实现角度讲,一周可行', agentId: 'fe' },
  { role: 'user', content: '这个项目该用什么技术栈?' },
]

describe('buildWillingnessWindow', () => {
  it('projects IM-style lines and drops drives, pass turns and unmarked system lines', () => {
    const lines = buildWillingnessWindow({ recent: TRANSCRIPT, members: AGENTS })
    expect(lines).toEqual([
      '用户: 官网改版,本周上线',
      '阿明: 收到,我来拆解',
      '小李: 从实现角度讲,一周可行',
      '用户: 这个项目该用什么技术栈?',
    ])
  })

  it('admits marked collab system lines — same rule as the room projection (W9.1)', () => {
    const lines = buildWillingnessWindow({
      recent: [
        { role: 'system', content: '「加 notes.txt」→ 小李\n开始执行', source: COLLAB_SYSTEM_SOURCE_TASK },
        { role: 'system', content: '「加 notes.txt」排队等待执行(并发上限)', source: 'collab' },
        { role: 'system', content: '小研 加入了群聊', source: COLLAB_SYSTEM_SOURCE_MEMBERSHIP },
        { role: 'assistant', content: '已交付', agentId: 'fe' },
      ],
      members: AGENTS,
    })
    expect(lines).toEqual([
      '系统: 「加 notes.txt」→ 小李 开始执行',
      '系统: 小研 加入了群聊',
      '小李: 已交付',
    ])
  })

  it('keeps only the tail window and truncates long messages', () => {
    const many: CollabMessageLike[] = Array.from({ length: 12 }, (_, index) => ({
      role: 'user',
      content: `第${index}条`,
    }))
    const lines = buildWillingnessWindow({ recent: many, members: AGENTS })
    expect(lines).toHaveLength(8)
    expect(lines[0]).toBe('用户: 第4条')

    const [long] = buildWillingnessWindow({
      recent: [{ role: 'user', content: 'x'.repeat(500) }],
      members: AGENTS,
    })
    expect(long.length).toBe('用户: '.length + COLLAB_WILLINGNESS_LINE_LIMIT + 1)
    expect(long.endsWith('…')).toBe(true)
  })

  it('collapses newlines so one message stays one line, and never signs with a raw id', () => {
    const lines = buildWillingnessWindow({
      recent: [
        { role: 'assistant', content: '第一行\n第二行', agentId: 'fe' },
        { role: 'assistant', content: '你好', agentId: 'ghost' },
      ],
      members: AGENTS,
    })
    // P2-16: a speaker the roster no longer holds is 「前成员」, not `ghost` —
    // the judgement window is prompt text, and an id in it is a riddle.
    expect(lines).toEqual(['小李: 第一行 第二行', '前成员: 你好'])
  })

  it('names a departed member when the global lookup still knows it (P2-16)', () => {
    const lines = buildWillingnessWindow({
      recent: [{ role: 'assistant', content: '你好', agentId: 'ghost' }],
      members: AGENTS,
      resolveAgentName: id => (id === 'ghost' ? '老王' : undefined),
    })
    expect(lines).toEqual(['老王: 你好'])
  })

  it('carries a quote reply into the judgement window as one entry (W7 §3.5 A)', () => {
    // The quote is the social signal that a message is aimed at somebody —
    // the judge cannot weigh it if it never reaches the window. It rides
    // INSIDE the entry so the window stays limited by messages, not by lines.
    const many: CollabMessageLike[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: `第${index}条`,
    }))
    const lines = buildWillingnessWindow({
      recent: [
        ...many,
        {
          role: 'user',
          content: '这条按你说的做',
          replyTo: { messageId: 'm1', authorLabel: '小李', excerpt: '先做接口再做页面' },
        },
      ],
      members: AGENTS,
    })
    expect(lines).toHaveLength(8)
    expect(lines[7]).toBe('> 小李: 先做接口再做页面\n用户: 这条按你说的做')
  })

  // W13.2: quotes now appear on agent replies too (hung after the fact), and
  // 「谁在回谁」is precisely the judgement signal — a window that only quoted
  // the user's own messages would hide half of it.
  it('carries a quote hung on an agent reply (W13.2 补挂)', () => {
    const lines = buildWillingnessWindow({
      recent: [{
        role: 'assistant',
        agentId: 'fe',
        content: '明天下班前',
        replyTo: { messageId: 'm1', authorLabel: '用户', excerpt: '登录页什么时候能好?' },
      }],
      members: AGENTS,
    })
    expect(lines).toEqual(['> 用户: 登录页什么时候能好?\n小李: 明天下班前'])
  })

  it('carries the reaction tally, same source as the projection (W8 §3.5 B)', () => {
    // 「群里已经三个人点了赞」is exactly the signal that says nobody needs to
    // say it again — a judgement blind to it is judging a different room.
    const lines = buildWillingnessWindow({
      recent: [
        {
          role: 'user',
          content: '上线了',
          reactions: [{ emoji: '🎉', by: [{ type: 'agent', agentId: 'fe' }, { type: 'agent', agentId: 'pm' }] }],
        },
      ],
      members: AGENTS,
    })
    expect(lines).toEqual(['用户: 上线了 (🎉×2)'])
  })

  it('leaves an unreacted message byte-identical', () => {
    expect(buildWillingnessWindow({
      recent: [{ role: 'user', content: '上线了', reactions: [] }],
      members: AGENTS,
    })).toEqual(['用户: 上线了'])
  })
})

describe('buildWillingnessPrompt', () => {
  const base = {
    self: AGENTS[1],
    members: AGENTS,
    roomName: '官网改版项目组',
    personaPrompt: PERSONA,
    recent: TRANSCRIPT,
  }

  it('is the persona VERBATIM plus the factual room note — no behavioral rules', () => {
    const { system } = buildWillingnessPrompt(base)
    expect(system.startsWith(PERSONA)).toBe(true)
    expect(system).toContain('(情况说明:')
    expect(system).toContain('「官网改版项目组」')
    expect(system).not.toContain('规则')
    expect(system).not.toContain('扮演')
    expect(system).not.toContain('铁律')
    // The JSON instruction is the task, and belongs to the user turn only.
    expect(system).not.toContain('respond')
  })

  it('adds the lead fact for the PM only', () => {
    expect(buildWillingnessPrompt({ ...base, pmAgentId: 'pm' }).system)
      .not.toContain(COLLAB_WILLINGNESS_PM_FACT)
    expect(buildWillingnessPrompt({ ...base, self: AGENTS[0], personaPrompt: '你是阿明。', pmAgentId: 'pm' }).system)
      .toContain(COLLAB_WILLINGNESS_PM_FACT)
    expect(buildWillingnessPrompt({ ...base, pmAgentId: 'fe' }).system)
      .toContain(COLLAB_WILLINGNESS_PM_FACT)
  })

  it('asks the JSON question after the window, newest message last', () => {
    const { user } = buildWillingnessPrompt(base)
    const lines = user.split('\n').filter(Boolean)
    expect(lines[0]).toBe('用户: 官网改版,本周上线')
    expect(lines[lines.length - 2]).toBe('用户: 这个项目该用什么技术栈?')
    expect(user).toContain('你会开口说话吗')
    expect(user).toContain('{"respond": true|false, "react": "👍"|null}')
    expect(user).not.toContain('[pass]')
    expect(user).not.toContain('被 @ 激活')
  })

  it('carries the judge its own in-flight cards (W9.3)', () => {
    const { system } = buildWillingnessPrompt({
      ...base,
      taskFacts: [{ id: 'a1b2c3d4-ffff', title: '给项目加 notes.txt', status: 'blocked' }],
    })
    expect(system).toContain('(你名下的任务:#a1b2c3d4「给项目加 notes.txt」——你的执行受阻')
    expect(buildWillingnessPrompt(base).system).not.toContain('你名下的任务')
  })

  it('still asks the question when the window is empty', () => {
    const { user } = buildWillingnessPrompt({ ...base, recent: [] })
    expect(user.startsWith('最新这条消息之后')).toBe(true)
  })
})

describe('parseWillingnessReply', () => {
  /** The `respond` half only — every assertion below predates W8 and must
   *  keep reading exactly the same through the structured return. */
  const respondOf = (text: string | null | undefined) => parseWillingnessReply(text).respond

  it('reads the standard answer in both directions', () => {
    expect(respondOf('{"respond": true}')).toBe(true)
    expect(respondOf('{"respond": false}')).toBe(false)
    expect(respondOf("{'respond':TRUE}")).toBe(true)
  })

  it('tolerates markdown fences and surrounding prose', () => {
    expect(respondOf('```json\n{"respond": true}\n```')).toBe(true)
    expect(respondOf('好的,我的判断是:\n```\n{ "respond" : true }\n```\n(以上)')).toBe(true)
    expect(respondOf('```json\n{"respond": false}\n```')).toBe(false)
  })

  it('accepts a bare boolean but nothing looser', () => {
    expect(respondOf('true')).toBe(true)
    expect(respondOf(' "TRUE" ')).toBe(true)
    expect(respondOf('我觉得 true 应该说两句')).toBe(false)
  })

  it('is false for empty, garbage, and echoed instructions', () => {
    expect(respondOf('')).toBe(false)
    expect(respondOf(undefined)).toBe(false)
    expect(respondOf(null)).toBe(false)
    expect(respondOf('我会说话的')).toBe(false)
    expect(respondOf('{"speak": true}')).toBe(false)
    // Echoing the instruction is not an answer.
    expect(respondOf('只输出 JSON: {"respond": true|false}')).toBe(false)
  })

  // ── W8: the react half (§3.5 B) ──

  it('carries no reaction for the pre-W8 shape (backward compatible)', () => {
    expect(parseWillingnessReply('{"respond": false}')).toEqual({ respond: false, react: null })
    expect(parseWillingnessReply('{"respond": true}')).toEqual({ respond: true, react: null })
    expect(parseWillingnessReply('true')).toEqual({ respond: true, react: null })
  })

  it('reads a palette emoji alongside the verdict', () => {
    expect(parseWillingnessReply('{"respond": false, "react": "👍"}'))
      .toEqual({ respond: false, react: '👍' })
    expect(parseWillingnessReply('```json\n{"respond": false, "react": "🎉"}\n```'))
      .toEqual({ respond: false, react: '🎉' })
    // Unquoted and single-quoted forms are the same answer.
    expect(parseWillingnessReply("{'respond': false, 'react': '👀'}").react).toBe('👀')
    expect(parseWillingnessReply('{"respond": false, "react": 🤔}').react).toBe('🤔')
  })

  it('canonicalizes an emoji written without its variation selector', () => {
    // Models drop U+FE0F freely; '❤' and '❤️' are the same reaction.
    expect(parseWillingnessReply('{"respond": false, "react": "❤"}').react).toBe('❤️')
  })

  it('drops anything outside the palette', () => {
    expect(parseWillingnessReply('{"respond": false, "react": "🚀"}').react).toBeNull()
    expect(parseWillingnessReply('{"respond": false, "react": "赞"}').react).toBeNull()
    expect(parseWillingnessReply('{"respond": false, "react": null}').react).toBeNull()
    expect(parseWillingnessReply('{"respond": false, "react": ""}').react).toBeNull()
  })

  it('does not read an echoed react instruction as a real reaction', () => {
    expect(parseWillingnessReply('只输出 JSON: {"respond": true|false, "react": "👍"|null}'))
      .toEqual({ respond: false, react: null })
  })
})
