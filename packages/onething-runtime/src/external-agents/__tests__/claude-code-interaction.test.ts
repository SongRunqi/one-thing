/**
 * **E4 的验收(连接器侧)**:提问有落点、persona 进 system 位。
 *
 * 这个文件钉的是 §0 诊断里那两条「结构性静默」:
 *
 *  - G6/G7:`AskUserQuestion` 与 `onUserDialog` 在 E4 之前全仓零命中 —— 模型问了
 *    一句话,而那句话哪儿都没去。四种收场必须**逐种**翻成 SDK 看得懂的答复,
 *    没有一种是「继续等」(原则 3);
 *  - G9:整份 system prompt 被丢掉,于是群里的 Iris 不是 Iris。
 *
 * 用假的 `queryFn` 截下 SDK 选项,断言的是**我们真的递给了 SDK 什么** ——
 * 而不是我们打算递什么。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  askUserQuestionOutput,
  askUserQuestionToInteraction,
  createClaudeCodeConnector,
  DEFAULT_USER_DIALOG_KINDS,
} from '../claude-code-connector.js'
import type { ClaudeCodeQueryOptions, ClaudeCodeSdkMessage } from '../claude-code-connector.js'
import type { ExternalAgentEvent, ExternalAgentInteractionAsk } from '../types.js'
import type { InteractionAnswer } from '@onething/core/interaction'

async function* replay(messages: ClaudeCodeSdkMessage[]): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
  for (const message of messages) yield message
}

async function drain(events: AsyncIterable<ExternalAgentEvent>): Promise<void> {
  for await (const _event of events) { /* drain */ }
}

const done: ClaudeCodeSdkMessage[] = [{ type: 'result', subtype: 'success', session_id: 'cc-1' }]

/** 起一轮,把 SDK 收到的那份 options 截下来。 */
async function captureOptions(
  connectorOptions: Parameters<typeof createClaudeCodeConnector>[0],
  turn: Partial<Parameters<ReturnType<typeof createClaudeCodeConnector>['streamTurn']>[0]> = {},
): Promise<ClaudeCodeQueryOptions> {
  let captured: ClaudeCodeQueryOptions | undefined
  const connector = createClaudeCodeConnector({
    ...connectorOptions,
    queryFn: params => {
      captured = params.options
      return replay(done)
    },
  })
  await drain(connector.streamTurn({
    localSessionId: 'exec-1',
    messageId: 'msg-1',
    prompt: 'hi',
    cwd: '/tmp/p',
    turn: 1,
    ...turn,
  }))
  if (!captured) throw new Error('queryFn was never called')
  return captured
}

const ASK_INPUT = {
  questions: [
    {
      question: '用哪个日期库?',
      header: 'Library',
      multiSelect: false,
      options: [
        { label: 'date-fns', description: '体积小,按需引入', preview: 'import { format } from "date-fns"' },
        { label: 'dayjs', description: 'moment 兼容 API' },
      ],
    },
    {
      question: '要开哪些特性?',
      header: 'Features',
      multiSelect: true,
      options: [
        { label: '时区', description: 'tz 支持' },
        { label: '本地化', description: 'i18n' },
      ],
    },
  ],
}

describe('AskUserQuestionInput → InteractionRequest 的映射', () => {
  it('字段逐一对得上,主键用 id 不用 header,「其他」显式声明', () => {
    const questions = askUserQuestionToInteraction(ASK_INPUT)
    expect(questions).toEqual([
      {
        id: 'q0',
        header: 'Library',
        question: '用哪个日期库?',
        multiSelect: false,
        options: [
          { label: 'date-fns', description: '体积小,按需引入', preview: 'import { format } from "date-fns"' },
          { label: 'dayjs', description: 'moment 兼容 API' },
        ],
        // SDK 说「'Other' will be provided automatically」——我们显式声明出来。
        allowFreeText: true,
      },
      {
        id: 'q1',
        header: 'Features',
        question: '要开哪些特性?',
        multiSelect: true,
        options: [
          { label: '时区', description: 'tz 支持' },
          { label: '本地化', description: 'i18n' },
        ],
        allowFreeText: true,
      },
    ])
  })

  it('答案回填成 AskUserQuestionOutput:键是问题原文,多选逗号拼接,自由输入进 response', () => {
    const questions = askUserQuestionToInteraction(ASK_INPUT)
    const answer: InteractionAnswer = {
      id: 'i-1',
      outcome: 'answered',
      answers: {
        q0: { selected: ['date-fns'] },
        q1: { selected: ['时区', '本地化'], freeText: '顺便把 ISO 周数也开了' },
      },
    }
    expect(askUserQuestionOutput(questions, answer)).toEqual({
      answers: {
        '用哪个日期库?': 'date-fns',
        '要开哪些特性?': '时区, 本地化',
      },
      response: '顺便把 ISO 周数也开了',
    })
  })

  it('认不出问题的 input 不会造出一张空卡', () => {
    expect(askUserQuestionToInteraction({ questions: [{ header: '只有标签' }] })).toEqual([])
    expect(askUserQuestionToInteraction(null)).toEqual([])
  })
})

describe('canUseTool 上的 AskUserQuestion 分流(G6)', () => {
  it('answered → allow,答案按 SDK 形状回填进 input', async () => {
    const asks: ExternalAgentInteractionAsk[] = []
    const options = await captureOptions({
      interactionHandler: async ask => {
        asks.push(ask)
        return {
          id: 'i-1',
          outcome: 'answered',
          answers: { q0: { selected: ['dayjs'] }, q1: { selected: ['时区'] } },
        }
      },
    })

    const decision = await options.canUseTool!(
      'AskUserQuestion',
      ASK_INPUT as unknown as Record<string, unknown>,
      { signal: new AbortController().signal, toolUseID: 'toolu_ask' },
    )
    expect(decision).toMatchObject({
      behavior: 'allow',
      updatedInput: {
        answers: { '用哪个日期库?': 'dayjs', '要开哪些特性?': '时区' },
      },
    })
    // 卡片按 toolUseID 归位 —— 与审批那一侧同一条纪律(G1)。
    expect(asks.at(-1)).toMatchObject({
      localSessionId: 'exec-1',
      messageId: 'msg-1',
      toolCallId: 'toolu_ask',
    })
    expect(asks.at(-1)!.questions).toHaveLength(2)
  })

  it.each([
    ['declined', '用户不想回答'],
    ['timeout', '无人应答,提问已超时结算'],
    ['aborted', 'Session cleared'],
  ] as const)('%s → deny,理由原样回到 SDK', async (outcome, reason) => {
    const options = await captureOptions({
      interactionHandler: async () => ({ id: 'i-1', outcome, answers: {}, reason }),
    })
    await expect(options.canUseTool!(
      'AskUserQuestion',
      ASK_INPUT as unknown as Record<string, unknown>,
      { signal: new AbortController().signal, toolUseID: 'toolu_ask' },
    )).resolves.toEqual({ behavior: 'deny', message: reason })
  })

  it('没有落点就当场拒绝,不是挂着 —— 挂着就是 F3', async () => {
    const options = await captureOptions({})
    await expect(options.canUseTool!(
      'AskUserQuestion',
      ASK_INPUT as unknown as Record<string, unknown>,
      { signal: new AbortController().signal, toolUseID: 'toolu_ask' },
    )).resolves.toMatchObject({ behavior: 'deny' })
  })

  it('提问不经审批桥 —— 那是两个概念', async () => {
    const permissionHandler = vi.fn(async () => ({ behavior: 'allow' as const }))
    const options = await captureOptions({
      permissionHandler,
      interactionHandler: async () => ({ id: 'i-1', outcome: 'answered', answers: {} }),
    })
    await options.canUseTool!(
      'AskUserQuestion',
      ASK_INPUT as unknown as Record<string, unknown>,
      { signal: new AbortController().signal, toolUseID: 'toolu_ask' },
    )
    expect(permissionHandler).not.toHaveBeenCalled()
  })
})

describe('onUserDialog / supportedDialogKinds(G7)', () => {
  it('声明表与回调同时给 —— 缺席就是 CLI 侧的 fail closed', async () => {
    const options = await captureOptions({
      interactionHandler: async () => ({ id: 'i-1', outcome: 'answered', answers: {} }),
    })
    expect(options.supportedDialogKinds).toEqual(DEFAULT_USER_DIALOG_KINDS)
    expect(typeof options.onUserDialog).toBe('function')
  })

  it('userDialogKinds: [] 就地关掉这条路(回调也一并不给,否则 SDK 在入参处抛)', async () => {
    const options = await captureOptions({
      interactionHandler: async () => ({ id: 'i-1', outcome: 'answered', answers: {} }),
      userDialogKinds: [],
    })
    expect(options.supportedDialogKinds).toBeUndefined()
    expect(options.onUserDialog).toBeUndefined()
  })

  it('答上来了才回 completed;答不上来一律 cancelled', async () => {
    const outcomes: InteractionAnswer[] = [
      { id: 'i-1', outcome: 'answered', answers: { dialog: { selected: ['重试'] } } },
      { id: 'i-2', outcome: 'timeout', answers: {}, reason: '超时' },
    ]
    let cursor = 0
    const options = await captureOptions({
      interactionHandler: async () => outcomes[cursor++]!,
    })
    const signal = new AbortController().signal

    await expect(options.onUserDialog!(
      {
        dialogKind: 'refusal_fallback_prompt',
        payload: { question: '模型拒答了,要不要换个说法重试?', options: [{ label: '重试' }, { label: '算了' }] },
        toolUseID: 'toolu_dialog',
      },
      { signal },
    )).resolves.toEqual({
      behavior: 'completed',
      result: { answers: { '模型拒答了,要不要换个说法重试?': '重试' } },
    })

    await expect(options.onUserDialog!(
      { dialogKind: 'refusal_fallback_prompt', payload: { question: '再来一次?' } },
      { signal },
    )).resolves.toEqual({ behavior: 'cancelled' })
  })

  it('payload 里认不出问题 → cancelled(绝不拿一张空卡去占住一个人)', async () => {
    const interactionHandler = vi.fn(async () => ({ id: 'i', outcome: 'answered' as const, answers: {} }))
    const options = await captureOptions({ interactionHandler })
    await expect(options.onUserDialog!(
      { dialogKind: 'something_new', payload: { unrecognized: 1 } },
      { signal: new AbortController().signal },
    )).resolves.toEqual({ behavior: 'cancelled' })
    expect(interactionHandler).not.toHaveBeenCalled()
  })
})

describe('persona 进 SDK 的 system 位(G9)', () => {
  it('用 preset+append —— 保住 Claude Code 自己那份操作说明', async () => {
    const persona = 'You are Iris, a designer with sharp taste and a sharper tongue.'
    const options = await captureOptions({}, { systemPrompt: persona })
    expect(options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: persona,
    })
  })

  it('没有 persona 就不发这一位(CLI 用它自己的默认)', async () => {
    expect((await captureOptions({})).systemPrompt).toBeUndefined()
    expect((await captureOptions({}, { systemPrompt: '   ' })).systemPrompt).toBeUndefined()
  })
})
