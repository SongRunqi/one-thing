/**
 * **真机验收:等人作答的那段时间里,输入通道必须活着**(2026-08-12)。
 *
 * 默认跳过 —— 花钱、要网络、要本机装着 claude。跑它:
 *
 * ```
 * ONETHING_REAL_CLI=1 npx vitest run \
 *   packages/onething-runtime/src/external-agents/__tests__/claude-code-interaction.real-cli.test.ts
 * ```
 *
 * 事故形状(真机):SDK 会话里模型调 `AskUserQuestion`,卡片弹出、用户十几秒后作答,
 * 答案送回时工具以
 * `Tool permission request failed: AbortError: Stream closed` 收场。
 *
 * CLI 那一侧的判据是**唯一**的一条(2.1.228 反编译原文):
 *
 * ```js
 * async sendRequest(e, t, r, n = randomUUID(), o) {
 *   let i = { type: 'control_request', request_id: n, request: e }
 *   if (jEo(n), this.inputClosed) throw new dT('Stream closed')
 * ```
 *
 * 也就是说这句话**只**说明一件事:CLI 要发这条 `can_use_tool` 的时候,它的 stdin
 * 已经 EOF 了。stdin 由谁关?只由我们关(SDK 的 `Query.streamInput` 在输入迭代器
 * 结束后调 `transport.endInput()`)。所以这条用例盯的不是「审批答得对不对」,而是
 * **通道的寿命**:提问期间不许收口,答案必须真的回得去、工具必须真的成功。
 *
 * 三个场景分开写,因为它们分离的是三条不同的嫌疑:
 *  - 全新会话 + 慢答 → 收口判据本身
 *  - 续接会话 + 慢答 → `--resume` 会不会带来一条被误当成本轮终点的 result
 *  - 同一会话上**前一轮被掐、后一轮紧接着开跑** → 跨轮串扰(真机日志里两条
 *    `init` 只隔 5ms,正是这个形状)
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClaudeCodeConnector } from '../claude-code-connector.js'
import type { ExternalAgentEvent, ExternalAgentSessionLink } from '../types.js'

/** 一句必然会让模型去调 AskUserQuestion 的题面。 */
const ASK_PROMPT = 'Use the AskUserQuestion tool right now to ask me which colour family I prefer '
  + 'for a kitchen wall (warm / cool / neutral). Ask first — do not guess and do not answer directly.'

/** 用户"想了很久"。事故里是 10 秒;这里放到 15 秒,留出余量。 */
const SLOW_ANSWER_MS = 15_000

const CHOICE = 'Cool tones'

interface TurnOutcome {
  events: ExternalAgentEvent[]
  link?: ExternalAgentSessionLink
  /** 提问真的打到宿主了没有。 */
  asked: boolean
  /** 工具最终的收场正文(失败时就是那句 `Stream closed`)。 */
  toolResults: { name: string; isError: boolean; text: string }[]
}

/**
 * `interactionHandler` 里睡 `answerDelayMs` 就是这几条用例的全部机关:它模拟的是
 * 一个真的在看卡片的人,而事故正发生在这段时间里。
 */
function makeConnector(params: { answerDelayMs: number; onAsked: () => void }) {
  return createClaudeCodeConnector({
    logger: console,
    userDialogKinds: [],
    interactionHandler: async ({ questions }) => {
      params.onAsked()
      await new Promise(resolve => setTimeout(resolve, params.answerDelayMs))
      const answers: Record<string, { selected: string[] }> = {}
      for (const question of questions) answers[question.id] = { selected: [CHOICE] }
      return { id: 'real-cli-ask', outcome: 'answered', answers }
    },
    // 提问不该走审批面;真走到这里就放行,免得测试卡在一个不相干的门上。
    permissionHandler: async () => ({ behavior: 'allow' }),
  })
}

/** 跑一轮,把「提问 → 慢答 → 工具收场」串起来。 */
async function runTurn(params: {
  localSessionId: string
  cwd: string
  prompt: string
  answerDelayMs: number
  resume?: ExternalAgentSessionLink
  abortSignal?: AbortSignal
  /** 传进来就共用一个连接器实例(跨轮串扰只在共用实例上才看得见)。 */
  connector?: ReturnType<typeof createClaudeCodeConnector>
  onAsked?: () => void
}): Promise<TurnOutcome> {
  const outcome: TurnOutcome = { events: [], asked: false, toolResults: [] }
  const connector = params.connector ?? makeConnector({
    answerDelayMs: params.answerDelayMs,
    onAsked: () => { outcome.asked = true; params.onAsked?.() },
  })
  if (params.connector) outcome.asked = false

  for await (const event of connector.streamTurn({
    localSessionId: params.localSessionId,
    messageId: 'msg-1',
    prompt: params.prompt,
    cwd: params.cwd,
    model: 'haiku',
    thinking: 'disabled',
    turn: 0,
    ...(params.resume ? { resume: params.resume } : {}),
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
  })) {
    outcome.events.push(event)
    if (event.type === 'session-established') outcome.link = event.link
    if (event.type === 'tool-result') {
      outcome.toolResults.push({
        name: event.toolCall.name,
        isError: typeof event.result.error === 'string' && event.result.error.length > 0,
        text: `${event.result.content ?? ''}${event.result.error ?? ''}`,
      })
    }
  }
  return outcome
}

function expectAnsweredCleanly(outcome: TurnOutcome): void {
  expect(outcome.asked, '提问必须打到宿主').toBe(true)
  const streamClosed = outcome.toolResults.filter(r => /Stream closed/.test(r.text))
  expect(
    streamClosed.map(r => r.text),
    '等人作答期间输入通道被关了 —— 答案送不回去',
  ).toEqual([])
  const ask = outcome.toolResults.find(r => /AskUserQuestion/i.test(r.name))
  expect(ask, '应当有一条 AskUserQuestion 的收场').toBeDefined()
  expect(ask!.isError, 'AskUserQuestion 不该以失败收场').toBe(false)
  expect(ask!.text, '答案必须真的进到工具结果里').toContain(CHOICE)
}

describe.skipIf(!process.env.ONETHING_REAL_CLI)('claude-code interaction channel lifetime (real CLI)', () => {
  it('全新会话 + 15 秒后作答:答案送达且工具成功', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cc-ask-fresh-'))
    const outcome = await runTurn({
      localSessionId: 'real-cli-ask-fresh',
      cwd,
      prompt: ASK_PROMPT,
      answerDelayMs: SLOW_ANSWER_MS,
    })
    expectAnsweredCleanly(outcome)
  }, 240_000)

  it('续接会话 + 15 秒后作答:答案送达且工具成功', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cc-ask-resume-'))
    // 先跑一轮拿 externalSessionId —— 事故会话正是这条 resume 路径。
    const first = await runTurn({
      localSessionId: 'real-cli-ask-resume',
      cwd,
      prompt: 'Reply with exactly one word: ready.',
      answerDelayMs: 0,
    })
    expect(first.link?.externalSessionId, '第一轮必须建立外部会话').toBeTruthy()

    const outcome = await runTurn({
      localSessionId: 'real-cli-ask-resume',
      cwd,
      prompt: ASK_PROMPT,
      answerDelayMs: SLOW_ANSWER_MS,
      resume: first.link!,
    })
    expectAnsweredCleanly(outcome)
  }, 300_000)

  it('前一轮被掐 + 后一轮紧接着提问:后一轮的通道不受牵连', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cc-ask-overlap-'))
    // 真机形状:用户在上一轮还没跑完时改了消息重发。上一轮被 abort,新一轮立刻开跑,
    // 两条 `init` 于是只隔几毫秒。
    const killed = new AbortController()
    const first = runTurn({
      localSessionId: 'real-cli-ask-overlap',
      cwd,
      prompt: 'Write the numbers 1 through 200, one per line. No preamble.',
      answerDelayMs: 0,
      abortSignal: killed.signal,
    }).catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 3_000))
    killed.abort()

    const outcome = await runTurn({
      localSessionId: 'real-cli-ask-overlap',
      cwd,
      prompt: ASK_PROMPT,
      answerDelayMs: SLOW_ANSWER_MS,
    })
    await first
    expectAnsweredCleanly(outcome)
  }, 300_000)

  /**
   * 真机日志里最扎眼的一条异常:同一个本地会话上两条 `[ClaudeCodeConnector] init`
   * 只隔 5ms —— 两个 CLI 进程同时挂在一条会话上。连接器的 `activeTurns` /
   * `abortControllers` 都以 localSessionId 为键,两轮共存时这些登记表只剩一份。
   */
  it('同一会话上两轮并存:后开跑的那一轮照样问得出、答得回', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cc-ask-concurrent-'))
    let asked = false
    const connector = makeConnector({ answerDelayMs: SLOW_ANSWER_MS, onAsked: () => { asked = true } })

    const long = runTurn({
      localSessionId: 'real-cli-ask-concurrent',
      cwd,
      prompt: 'Write the numbers 1 through 200, one per line. No preamble.',
      answerDelayMs: 0,
      connector,
    }).catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 3_000))

    const outcome = await runTurn({
      localSessionId: 'real-cli-ask-concurrent',
      cwd,
      prompt: ASK_PROMPT,
      answerDelayMs: SLOW_ANSWER_MS,
      connector,
    })
    outcome.asked = asked
    await long
    expectAnsweredCleanly(outcome)
  }, 300_000)
})
