/**
 * 原生提问工具(`ask_user`)的行为守卫。
 *
 * 这个工具全部的难点都在**收场**上,所以测试也全压在那里:
 *   1. 题目数量的闸(0 题没有可问的,5 题是一次审讯);
 *   2. 题 id 的公式 —— 它必须与渲染层从持久化 `arguments` 反推时用的那把**同一个**
 *      公式,否则 answers 表对不上题面;
 *   3. 四种收场逐一翻成模型看得懂的工具结果,没有一种走 throw;
 *   4. 回合中止要**真的把 pending 撤回**,不能只让工具自己走开 —— 留一张没人会答的
 *      卡在屏幕上,和留一只挂着的 Promise,是同一个 bug 的两面。
 */
import { describe, expect, it, vi } from 'vitest'
import type { InteractionAnswer, InteractionQuestion } from '@onething/core/interaction'
import {
  ASK_USER_ABORTED_REASON,
  ASK_USER_TIMEOUT_MS,
  AskUserParameters,
  createAskUserTool,
  type AskUserAbortInput,
  type AskUserAskInput,
  type AskUserMetadata,
} from '../builtin/ask-user.js'
import type { Tool } from '../tool.js'

const SESSION = 'session-1'
const MESSAGE = 'message-1'
const TOOL_CALL = 'call-1'

const ONE_QUESTION = {
  questions: [
    {
      question: '用哪一套配色?',
      header: '配色',
      options: [
        { label: '暖色', description: '偏纸墨' },
        { label: '冷色' },
      ],
    },
  ],
}

interface Harness {
  tool: ReturnType<typeof createAskUserTool>
  asks: AskUserAskInput[]
  aborts: AskUserAbortInput[]
  /** 手动结算那次挂起的提问(模拟用户点了卡片 / 内核到点自结算)。 */
  settle: (answer: InteractionAnswer) => void
}

function harness(options: { onAsk?: (input: AskUserAskInput) => void } = {}): Harness {
  const asks: AskUserAskInput[] = []
  const aborts: AskUserAbortInput[] = []
  let settle: (answer: InteractionAnswer) => void = () => {}
  const tool = createAskUserTool({
    ask: input => {
      asks.push(input)
      options.onAsk?.(input)
      return new Promise<InteractionAnswer>(resolve => {
        settle = resolve
      })
    },
    abort: input => {
      aborts.push(input)
    },
  })
  return { tool, asks, aborts, settle: answer => settle(answer) }
}

function context(overrides: Partial<Tool.Context<AskUserMetadata>> = {}): Tool.Context<AskUserMetadata> {
  return {
    sessionId: SESSION,
    messageId: MESSAGE,
    toolCallId: TOOL_CALL,
    metadata: () => {},
    ...overrides,
  } as Tool.Context<AskUserMetadata>
}

function answered(questions: InteractionQuestion[], selections: string[][]): InteractionAnswer {
  const answers: InteractionAnswer['answers'] = {}
  questions.forEach((question, index) => {
    const selected = selections[index]
    if (selected) answers[question.id] = { selected }
  })
  return { id: 'ask-1', answers, outcome: 'answered' }
}

describe('ask_user 参数校验', () => {
  it('一题到四题放行', () => {
    for (const count of [1, 2, 3, 4]) {
      const parsed = AskUserParameters.safeParse({
        questions: Array.from({ length: count }, (_, i) => ({
          question: `问题 ${i}`,
          options: [{ label: 'A' }, { label: 'B' }],
        })),
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('零题拒收 —— 一次没有问题的提问只会画一张空卡', () => {
    expect(AskUserParameters.safeParse({ questions: [] }).success).toBe(false)
  })

  it('五题拒收 —— 一张卡上摆五道题是审讯,不是提问', () => {
    const parsed = AskUserParameters.safeParse({
      questions: Array.from({ length: 5 }, (_, i) => ({
        question: `问题 ${i}`,
        options: [{ label: 'A' }],
      })),
    })
    expect(parsed.success).toBe(false)
  })

  it('没有选项 / 空题面同样拒收', () => {
    expect(AskUserParameters.safeParse({
      questions: [{ question: '选哪个?', options: [] }],
    }).success).toBe(false)
    expect(AskUserParameters.safeParse({
      questions: [{ question: '', options: [{ label: 'A' }] }],
    }).success).toBe(false)
  })
})

describe('ask_user 发起提问', () => {
  it('按 sessionId / toolCallId 发问,题 id 用 `<toolCallId>:<i>` 那把公式', async () => {
    const h = harness()
    const pending = h.tool.execute(AskUserParameters.parse({
      questions: [
        { question: 'Q1', options: [{ label: 'A' }] },
        { question: 'Q2', options: [{ label: 'B' }] },
      ],
    }), context())

    expect(h.asks).toHaveLength(1)
    expect(h.asks[0].sessionId).toBe(SESSION)
    expect(h.asks[0].toolCallId).toBe(TOOL_CALL)
    // 「这次调用 + 第几题」是这把钥匙的全部输入,重放也要拼出同一个。
    expect(h.asks[0].questions.map(q => q.id)).toEqual([`${TOOL_CALL}:0`, `${TOOL_CALL}:1`])
    // 没有硬超时:表只是兜底,而且必须留在 32 位 setTimeout 的上限之内。
    expect(h.asks[0].timeoutMs).toBe(ASK_USER_TIMEOUT_MS)
    expect(ASK_USER_TIMEOUT_MS).toBeLessThan(2 ** 31 - 1)

    h.settle(answered(h.asks[0].questions, [['A'], ['B']]))
    await pending
  })

  it('入参的可选格原样带过去,没给的不凭空补', async () => {
    const h = harness()
    const pending = h.tool.execute(AskUserParameters.parse({
      questions: [{
        question: 'Q',
        header: '短标签',
        multiSelect: true,
        allowFreeText: true,
        options: [{ label: 'A', description: '说明' }, { label: 'B' }],
      }],
    }), context())

    const question = h.asks[0].questions[0]
    expect(question).toMatchObject({
      header: '短标签',
      multiSelect: true,
      allowFreeText: true,
      options: [{ label: 'A', description: '说明' }, { label: 'B' }],
    })
    // description 没给就不该出现一个 undefined 键。
    expect('description' in question.options[1]).toBe(false)

    h.settle(answered(h.asks[0].questions, [['A']]))
    await pending
  })

  it('没有 toolCallId 时退到 messageId 当锚,而不是丢掉这次提问', async () => {
    const h = harness()
    const pending = h.tool.execute(
      AskUserParameters.parse(ONE_QUESTION),
      context({ toolCallId: undefined }),
    )
    expect(h.asks[0].toolCallId).toBeUndefined()
    expect(h.asks[0].questions[0].id).toBe(`${MESSAGE}:0`)

    h.settle(answered(h.asks[0].questions, [['暖色']]))
    await pending
  })

  /**
   * 归位的**第二档**必须从这里出发。渲染侧只认 `toolCallId` 的话,流式期间那次调用
   * 还没落进消息的卡就只剩尾泊 —— 而末尾是新消息出现的位置,用户读成「我答完之后
   * 冒出一条消息」。`ctx.messageId` 在这里断掉,后面每一档都接不住。
   */
  it('消息锚原样带给渲染侧 —— 哪怕 toolCallId 已经有了(两个键各管一档)', async () => {
    const h = harness()
    const pending = h.tool.execute(AskUserParameters.parse(ONE_QUESTION), context())

    expect(h.asks[0].toolCallId).toBe(TOOL_CALL)
    expect(h.asks[0].messageId).toBe(MESSAGE)

    h.settle(answered(h.asks[0].questions, [['暖色']]))
    await pending
  })
})

describe('ask_user 收场翻译', () => {
  it('单选:结构化 metadata + 一行人话摘要', async () => {
    const h = harness()
    const pending = h.tool.execute(AskUserParameters.parse(ONE_QUESTION), context())
    h.settle(answered(h.asks[0].questions, [['暖色']]))
    const result = await pending

    expect(result.metadata).toEqual({
      interaction: 'ask_user',
      outcome: 'answered',
      answers: [{
        questionId: `${TOOL_CALL}:0`,
        question: '用哪一套配色?',
        selected: ['暖色'],
      }],
    })
    expect(result.title).toBe('用户已回答')
    expect(result.output).toContain('用户已回答:「用哪一套配色?」→ 暖色')
    // 同一份事实也以 JSON 形态给模型,免得它去解那句中文。
    expect(result.output).toContain('"selected"')
    expect(result.output).toContain('"暖色"')
  })

  it('多选带自由输入:selected 是数组,freeText 单独一格', async () => {
    const h = harness()
    const pending = h.tool.execute(AskUserParameters.parse({
      questions: [{
        question: '带上哪几样?',
        multiSelect: true,
        allowFreeText: true,
        options: [{ label: '钥匙' }, { label: '钱包' }, { label: '伞' }],
      }],
    }), context())

    const questionId = h.asks[0].questions[0].id
    h.settle({
      id: 'ask-1',
      outcome: 'answered',
      answers: { [questionId]: { selected: ['钥匙', '伞'], freeText: '还有充电宝' } },
    })
    const result = await pending

    expect((result.metadata as AskUserMetadata).answers).toEqual([{
      questionId,
      question: '带上哪几样?',
      selected: ['钥匙', '伞'],
      freeText: '还有充电宝',
    }])
    expect(result.output).toContain('钥匙、伞、还有充电宝')
  })

  it('部分作答:没答的那一题不编一条「选了零个」的记录', async () => {
    const h = harness()
    const pending = h.tool.execute(AskUserParameters.parse({
      questions: [
        { question: 'Q1', options: [{ label: 'A' }] },
        { question: 'Q2', options: [{ label: 'B' }] },
      ],
    }), context())
    h.settle(answered(h.asks[0].questions, [['A']]))
    const result = await pending

    expect((result.metadata as AskUserMetadata).answers).toHaveLength(1)
    expect((result.metadata as AskUserMetadata).answers[0].questionId).toBe(`${TOOL_CALL}:0`)
  })

  it.each([
    ['declined', '用户选择不回答', '用户跳过了提问'],
    ['timeout', '无人应答', '提问超时'],
    ['aborted', '会话已清理', '提问已取消'],
  ] as const)('%s 是正常返回,不是异常', async (outcome, reason, title) => {
    const h = harness()
    const pending = h.tool.execute(AskUserParameters.parse(ONE_QUESTION), context())
    h.settle({ id: 'ask-1', answers: {}, outcome, reason })
    const result = await pending

    expect(result.title).toBe(title)
    expect(result.metadata).toMatchObject({ interaction: 'ask_user', outcome, reason, answers: [] })
    // 收场的理由本身就是写给模型的下一步指示,必须进 output。
    expect(result.output).toContain(reason)
  })
})

describe('ask_user 回合中止', () => {
  it('信号已经响过就不再挂一张没人会看的卡', async () => {
    const h = harness()
    const controller = new AbortController()
    controller.abort()

    const result = await h.tool.execute(
      AskUserParameters.parse(ONE_QUESTION),
      context({ abortSignal: controller.signal }),
    )

    expect(h.asks).toHaveLength(0)
    expect(result.title).toBe('提问已取消')
    expect((result.metadata as AskUserMetadata).outcome).toBe('aborted')
    expect(result.output).toContain(ASK_USER_ABORTED_REASON)
  })

  it('飞行中被中止:pending 真的被撤回,工具收到 aborted', async () => {
    const controller = new AbortController()
    // abort 回调把那条 pending 结成 aborted —— 与内核 `Interaction.abort` 同款语义。
    const h: Harness = (() => {
      const asks: AskUserAskInput[] = []
      const aborts: AskUserAbortInput[] = []
      let settle: (answer: InteractionAnswer) => void = () => {}
      const tool = createAskUserTool({
        ask: input => {
          asks.push(input)
          return new Promise<InteractionAnswer>(resolve => { settle = resolve })
        },
        abort: input => {
          aborts.push(input)
          settle({ id: 'ask-1', answers: {}, outcome: 'aborted', reason: input.reason })
        },
      })
      return { tool, asks, aborts, settle: answer => settle(answer) }
    })()

    const pending = h.tool.execute(
      AskUserParameters.parse(ONE_QUESTION),
      context({ abortSignal: controller.signal }),
    )
    expect(h.asks).toHaveLength(1)

    controller.abort()
    const result = await pending

    // 撤回按 toolCallId —— 那是这次提问唯一跨得过内存的相关键。
    expect(h.aborts).toEqual([{
      sessionId: SESSION,
      toolCallId: TOOL_CALL,
      reason: ASK_USER_ABORTED_REASON,
    }])
    expect(result.title).toBe('提问已取消')
    expect((result.metadata as AskUserMetadata).outcome).toBe('aborted')
  })

  it('用户抢在中止之前答完:不再撤回,也不改写他的答案', async () => {
    const h = harness()
    const controller = new AbortController()
    const pending = h.tool.execute(
      AskUserParameters.parse(ONE_QUESTION),
      context({ abortSignal: controller.signal }),
    )

    h.settle(answered(h.asks[0].questions, [['冷色']]))
    const result = await pending
    controller.abort()

    expect(h.aborts).toHaveLength(0)
    expect((result.metadata as AskUserMetadata).outcome).toBe('answered')
    expect((result.metadata as AskUserMetadata).answers[0].selected).toEqual(['冷色'])
  })
})

describe('ask_user 注册表出事', () => {
  it('ask 抛错原样冒出去,由工具执行层结成一次工具错误(不静默变成「用户没答」)', async () => {
    const tool = createAskUserTool({
      ask: () => Promise.reject(new Error('Interaction registry exploded')),
      abort: vi.fn(),
    })
    await expect(
      tool.execute(AskUserParameters.parse(ONE_QUESTION), context()),
    ).rejects.toThrow('Interaction registry exploded')
  })
})
