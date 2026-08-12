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
  readAskUserRecord,
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

// ---------------------------------------------------------------------------
// 原生 ask_user —— 判据走结构化字段,不做文本逆运算
// ---------------------------------------------------------------------------

/**
 * 原生工具的 result **不是字符串**:引擎把 `{title, output, metadata}` 整个存进
 * `toolCalls[].result`(`core/engine/tool-orchestration.ts:827`,真机 jsonl 里
 * `read`/`write`/`edit` 都是这个形状)。答案在 `metadata` 里,是结构不是话。
 */
function askUserCall(overrides: Partial<InteractionHistoryToolCall> = {}): InteractionHistoryToolCall {
  return {
    id: 'toolu_native',
    toolId: 'ask_user',
    toolName: 'ask_user',
    status: 'completed',
    timestamp: T0,
    endTime: T0 + 12_000,
    arguments: {
      questions: [{
        question: '这一步要不要先备份?',
        header: '备份',
        options: [{ label: '先备份', description: '慢一点但稳' }, { label: '直接改' }],
      }],
    },
    result: {
      title: '用户已回答',
      output: '用户已回答:「这一步要不要先备份?」→ 先备份',
      metadata: {
        interaction: 'ask_user',
        outcome: 'answered',
        answers: [{
          questionId: 'toolu_native:0',
          question: '这一步要不要先备份?',
          selected: ['先备份'],
        }],
      },
    },
    ...overrides,
  }
}

describe('readAskUserRecord', () => {
  it('认的是 metadata.interaction 这个结构标记,不是那句人话', () => {
    const record = readAskUserRecord(askUserCall().result)
    expect(record).toEqual({
      outcome: 'answered',
      answers: [{ questionId: 'toolu_native:0', question: '这一步要不要先备份?', selected: ['先备份'] }],
    })
  })

  it('字符串结果 / 别的工具的 metadata / 认不出的 outcome 一律不认', () => {
    expect(readAskUserRecord('用户已回答:「A」→ B')).toBeUndefined()
    expect(readAskUserRecord({ metadata: { path: '/tmp/x' } })).toBeUndefined()
    expect(readAskUserRecord({ metadata: { interaction: 'ask_user', outcome: '???' } })).toBeUndefined()
    expect(readAskUserRecord(undefined)).toBeUndefined()
  })

  it('answers 是垃圾时退成空表,而不是抛', () => {
    const record = readAskUserRecord({
      metadata: { interaction: 'ask_user', outcome: 'timeout', reason: '无人应答', answers: 'nope' },
    })
    expect(record).toEqual({ outcome: 'timeout', reason: '无人应答', answers: [] })
  })
})

describe('deriveInteractionFromToolCall —— 原生 ask_user', () => {
  it('从结构化 result 重建一张已办卡,origin 是 host-tool', () => {
    const derived = deriveInteractionFromToolCall(askUserCall(), 'session-1')!
    expect(derived.request.origin).toBe('host-tool')
    expect(derived.request.toolCallId).toBe('toolu_native')
    expect(derived.request.questions[0].id).toBe('toolu_native:0')
    expect(derived.request.questions[0].options).toHaveLength(2)
    expect(derived.settledAt).toBe(T0 + 12_000)
    expect(derived.answer.outcome).toBe('answered')
    expect(derived.answer.answers['toolu_native:0']).toEqual({ selected: ['先备份'] })
  })

  it('多选与自由输入原样还原(数组就是数组,不拼成一句再拆回来)', () => {
    const derived = deriveInteractionFromToolCall(askUserCall({
      arguments: {
        questions: [{
          question: '带上哪几样?',
          multiSelect: true,
          allowFreeText: true,
          options: [{ label: '钥匙' }, { label: '钱包' }, { label: '伞' }],
        }],
      },
      result: {
        metadata: {
          interaction: 'ask_user',
          outcome: 'answered',
          answers: [{
            questionId: 'toolu_native:0',
            question: '带上哪几样?',
            selected: ['钥匙', '伞'],
            freeText: '还有充电宝',
          }],
        },
      },
    }), 'session-1')!
    expect(derived.answer.answers['toolu_native:0']).toEqual({
      selected: ['钥匙', '伞'],
      freeText: '还有充电宝',
    })
  })

  /**
   * 这是原生这一族相对外部那一族**多出来**的能力:outcome 就写在 metadata 里,
   * 所以跳过 / 超时 / 中止的卡也能跨重载重建,不必只留「答过」的那一种。
   */
  it.each(['declined', 'timeout', 'aborted'] as const)('%s 的卡照样重建得出来', outcome => {
    const derived = deriveInteractionFromToolCall(askUserCall({
      result: {
        metadata: { interaction: 'ask_user', outcome, reason: '就这么定了', answers: [] },
      },
    }), 'session-1')!
    expect(derived.answer.outcome).toBe(outcome)
    expect(derived.answer.reason).toBe('就这么定了')
    expect(derived.answer.answers).toEqual({})
  })

  it('questionId 对不上时退到题面原文认回来', () => {
    const derived = deriveInteractionFromToolCall(askUserCall({
      result: {
        metadata: {
          interaction: 'ask_user',
          outcome: 'answered',
          answers: [{ questionId: '换过公式了:0', question: '这一步要不要先备份?', selected: ['直接改'] }],
        },
      },
    }), 'session-1')!
    expect(derived.answer.answers['toolu_native:0']).toEqual({ selected: ['直接改'] })
  })

  it('「答过」却一条都对不上题:不画一张「答了什么不知道」的卡', () => {
    expect(deriveInteractionFromToolCall(askUserCall({
      result: {
        metadata: {
          interaction: 'ask_user',
          outcome: 'answered',
          answers: [{ questionId: '别的题:0', question: '完全不同的题', selected: ['X'] }],
        },
      },
    }), 'session-1')).toBeUndefined()
  })

  it('还在执行中 / 没有结构化 metadata / 题面缺失都不造卡', () => {
    expect(deriveInteractionFromToolCall(askUserCall({ status: 'executing' }), 's')).toBeUndefined()
    expect(deriveInteractionFromToolCall(askUserCall({ result: '用户已回答:「A」→ B' }), 's')).toBeUndefined()
    expect(deriveInteractionFromToolCall(askUserCall({ arguments: undefined }), 's')).toBeUndefined()
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

  it('两族工具混在一条会话里,同一本历史都收得住', () => {
    const messages = [
      { toolCalls: [askCall({ id: 'external', timestamp: T0 })] },
      { toolCalls: [askUserCall({ id: 'native', timestamp: T0 + 100 })] },
    ]
    const history = deriveInteractionHistory(messages, 'session-1')
    expect(history.map(entry => entry.request.id)).toEqual(['external', 'native'])
    expect(history.map(entry => entry.request.origin)).toEqual(['external-agent', 'host-tool'])
  })

  it('没消息 / 没会话 id 时是空表', () => {
    expect(deriveInteractionHistory(undefined, 'session-1')).toEqual([])
    expect(deriveInteractionHistory([askCall() as never], '')).toEqual([])
  })
})
