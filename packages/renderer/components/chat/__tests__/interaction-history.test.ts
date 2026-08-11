/**
 * 已办提问的**持久面** —— 从消息里那次 AskUserQuestion 工具调用倒推已办记录。
 *
 * 这条链存在的理由只有一个:`interactions` store 里的 `settled` 是事件转达,只活在
 * 收到那条广播的窗口里。重载一次,卡片整张消失,用户回看不到自己当初选了哪条路。
 * 而答案本来就落在消息里(工具调用的 `arguments` + `result`),这里读的就是它。
 *
 * 下面那份 REAL_RESULT 是从真机会话里原样抄回来的
 * (`~/.onething/sessions/41feeb78-…/messages.jsonl`),不是照着代码编的样例 ——
 * 这条链解析的是外部 CLI 念回来的一句话,样例必须来自现场。
 */
import { describe, expect, it } from 'vitest'
import {
  deriveInteractionFromToolCall,
  deriveInteractionHistory,
  parseAnswerPairs,
  toQuestionAnswer,
  type InteractionHistoryToolCall,
} from '../interaction/interaction-history'
import type { InteractionQuestion } from '@/types'

const T0 = 1_700_000_000_000

/** 真机原文(措辞是 Claude Code CLI 的,里面的配对是 askUserQuestionOutput 写出去的)。 */
const REAL_RESULT =
  'Your questions have been answered: "要怎么把这张 PNG 换上去?"="直接用 PNG 位图(推荐简单)". ' +
  'You can now continue with these answers in mind.'

function askCall(overrides: Partial<InteractionHistoryToolCall> = {}): InteractionHistoryToolCall {
  return {
    id: 'toolu_01L6',
    toolId: 'AskUserQuestion',
    toolName: 'AskUserQuestion',
    status: 'completed',
    timestamp: T0,
    endTime: T0 + 47_000,
    arguments: {
      questions: [
        {
          question: '要怎么把这张 PNG 换上去?',
          header: '图标替换方式',
          multiSelect: false,
          options: [
            { label: '直接用 PNG 位图(推荐简单)', description: '改动最小最快' },
            { label: '帮我转成 SVG 矢量再换' },
          ],
        },
      ],
    },
    result: REAL_RESULT,
    ...overrides,
  }
}

describe('parseAnswerPairs', () => {
  it('从真机那句话里挑出「题」=「答」的配对', () => {
    const pairs = parseAnswerPairs(REAL_RESULT)
    expect(pairs.get('要怎么把这张 PNG 换上去?')).toBe('直接用 PNG 位图(推荐简单)')
    expect(pairs.size).toBe(1)
  })

  it('多题各成一对', () => {
    const pairs = parseAnswerPairs('Your questions have been answered: "A"="1", "B"="2, 3".')
    expect(pairs.get('A')).toBe('1')
    expect(pairs.get('B')).toBe('2, 3')
  })

  it('不是字符串 / 没有配对时是空表,而不是抛', () => {
    expect(parseAnswerPairs(undefined).size).toBe(0)
    expect(parseAnswerPairs({ ok: true }).size).toBe(0)
    expect(parseAnswerPairs('User declined to answer.').size).toBe(0)
  })
})

describe('toQuestionAnswer —— askUserQuestionOutput 的逆运算', () => {
  const single: InteractionQuestion = {
    id: 'q1',
    question: '配色?',
    options: [{ label: '暖' }, { label: '冷' }],
  }
  const multi: InteractionQuestion = {
    id: 'q2',
    question: '改哪几页?',
    multiSelect: true,
    allowFreeText: true,
    options: [{ label: '首页' }, { label: '定价页' }],
  }

  it('文本正好是某个选项 → 选中它', () => {
    expect(toQuestionAnswer(single, '暖')).toEqual({ selected: ['暖'] })
  })

  it('多选按 ", " 拆回去', () => {
    expect(toQuestionAnswer(multi, '首页, 定价页')).toEqual({ selected: ['首页', '定价页'] })
  })

  it('多选里混进一句自己写的 → 认得出的算选中,剩下的归「其他」', () => {
    expect(toQuestionAnswer(multi, '首页, 还有博客')).toEqual({
      selected: ['首页'],
      freeText: '还有博客',
    })
  })

  it('一个选项都对不上 → 整句是用户自己写的那句', () => {
    expect(toQuestionAnswer(single, '都不合适,我要第三种')).toEqual({
      selected: [],
      freeText: '都不合适,我要第三种',
    })
  })
})

describe('deriveInteractionFromToolCall', () => {
  it('真机那条调用推出一张完整的已办记录', () => {
    const derived = deriveInteractionFromToolCall(askCall(), 'session-1')
    expect(derived).toBeDefined()
    expect(derived!.request.id).toBe('toolu_01L6')
    expect(derived!.request.toolCallId).toBe('toolu_01L6')
    expect(derived!.request.sessionId).toBe('session-1')
    expect(derived!.request.createdAt).toBe(T0)
    expect(derived!.settledAt).toBe(T0 + 47_000)
    // 题面连同当初的备选一起还原 —— 已办卡上要报「未选几项」,那要数得出来。
    expect(derived!.request.questions[0]!.header).toBe('图标替换方式')
    expect(derived!.request.questions[0]!.options).toHaveLength(2)
    expect(derived!.answer.outcome).toBe('answered')
    expect(derived!.answer.answers[derived!.request.questions[0]!.id]).toEqual({
      selected: ['直接用 PNG 位图(推荐简单)'],
    })
  })

  it('题没有 id 就按位置补一个 —— 答案表用同一把 id,两边自洽', () => {
    const derived = deriveInteractionFromToolCall(askCall(), 'session-1')!
    expect(derived.request.questions[0]!.id).toBe('toolu_01L6:0')
    expect(Object.keys(derived.answer.answers)).toEqual(['toolu_01L6:0'])
  })

  it('别的工具、还没跑完的调用,都不是提问记录', () => {
    expect(deriveInteractionFromToolCall(askCall({ toolName: 'Bash', toolId: 'Bash' }), 's')).toBeUndefined()
    expect(deriveInteractionFromToolCall(askCall({ status: 'executing' }), 's')).toBeUndefined()
  })

  /**
   * 收场有四种,持久面只认得出一种:跳过 / 超时 / 中止在连接器那边都走 deny,
   * 落到工具调用上只剩一句理由,分不出是哪一种。猜一个贴上去 = 拿「已跳过」盖
   * 一次「超时」,所以宁可不造卡。
   */
  it('解不出答案配对就不造卡(不拿一个猜来的 outcome 盖上去)', () => {
    expect(deriveInteractionFromToolCall(
      askCall({ status: 'failed', result: '用户选择不回答这个问题。' }),
      'session-1',
    )).toBeUndefined()
    expect(deriveInteractionFromToolCall(askCall({ result: undefined }), 'session-1')).toBeUndefined()
  })

  it('配对一条都对不上题面时同样不造卡', () => {
    const derived = deriveInteractionFromToolCall(
      askCall({ result: 'Your questions have been answered: "另一个问题"="随便".' }),
      'session-1',
    )
    expect(derived).toBeUndefined()
  })

  it('题面缺失 / arguments 是垃圾都不炸', () => {
    expect(deriveInteractionFromToolCall(askCall({ arguments: undefined }), 's')).toBeUndefined()
    expect(deriveInteractionFromToolCall(askCall({ arguments: { questions: 'nope' } }), 's')).toBeUndefined()
    expect(deriveInteractionFromToolCall(askCall({ arguments: { questions: [null, 42] } }), 's')).toBeUndefined()
  })
})

describe('deriveInteractionHistory', () => {
  it('扫全会话,按提问时间排', () => {
    const messages = [
      { toolCalls: [{ id: 'x', toolName: 'Bash', status: 'completed' }] },
      { toolCalls: [askCall({ id: 'late', timestamp: T0 + 100 })] },
      {},
      { toolCalls: [askCall({ id: 'early', timestamp: T0 })] },
    ]
    const history = deriveInteractionHistory(messages, 'session-1')
    expect(history.map(entry => entry.request.id)).toEqual(['early', 'late'])
  })

  it('没消息 / 没会话 id 时是空表', () => {
    expect(deriveInteractionHistory(undefined, 'session-1')).toEqual([])
    expect(deriveInteractionHistory([askCall() as never], '')).toEqual([])
  })
})
