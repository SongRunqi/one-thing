/**
 * **后台任务可见性的验收(连接器侧)**,2026-08-11。
 *
 * 用户原话:「我发了之后,作为用户我认为它已经执行完了,但输入框还是可终止状态。
 * 它到底在不在执行、执行了多长时间,除了终止按钮我一律不知。」
 *
 * 连接器手上一直有全部信号(`background_tasks_changed` 的整表替换),这一期只是
 * 把同一个电平**再报一次**给观测口。所以这里断言的全部是「我们真的递给观测口
 * 什么」,三条:
 *
 *  1. 电平抬起 → `running`,带**起始墙钟**(不是耗时:走秒在渲染侧自算);
 *  2. 电平归零 → `settled`,带总时长;
 *  3. **零后台的普通回合一条都不发** —— 每次对话都挂一根状态条是噪音,不是可见性。
 *
 * 第 3 条是这一期最容易写坏的地方,所以它有自己的一条用例。
 */
import { describe, expect, it } from 'vitest'
import { createClaudeCodeConnector } from '../claude-code-connector.js'
import type { ClaudeCodeSdkMessage } from '../claude-code-connector.js'
import type { ExternalAgentEvent, ExternalAgentObserver } from '../types.js'

type BackgroundCall = Parameters<NonNullable<ExternalAgentObserver['backgroundTasks']>>[0]

async function drain(events: AsyncIterable<ExternalAgentEvent>): Promise<void> {
  for await (const _event of events) { /* drain */ }
}

function tasks(...ids: string[]): ClaudeCodeSdkMessage {
  return {
    type: 'system',
    subtype: 'background_tasks_changed',
    session_id: 's',
    tasks: ids.map(id => ({ task_id: id, task_type: 'local_agent', description: id })),
  } as ClaudeCodeSdkMessage
}

const result: ClaudeCodeSdkMessage = { type: 'result', subtype: 'success', session_id: 's' }

/** 起一轮,回放给定的 SDK 消息,收集观测口上的后台电平调用。 */
async function runTurn(messages: ClaudeCodeSdkMessage[], options: {
  abortSignal?: AbortSignal
} = {}): Promise<BackgroundCall[]> {
  const calls: BackgroundCall[] = []
  const observer: ExternalAgentObserver = {
    turn: () => {},
    toolDecision: () => {},
    backgroundTasks: input => { calls.push(input) },
  }
  const connector = createClaudeCodeConnector({
    observer,
    // 防呆表调到最短,让"超时后仍非零"那一支在测试里也走得到。
    backgroundTaskTimeoutMs: 20,
    queryFn: () => (async function* run(): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
      for (const message of messages) yield message
    })(),
  })
  await drain(connector.streamTurn({
    localSessionId: 'exec-1',
    messageId: 'msg-1',
    prompt: 'hi',
    cwd: '/tmp/p',
    turn: 1,
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  }))
  return calls
}

describe('后台子代理的电平 → 观测口', () => {
  it('零后台的普通回合:一条都不发', async () => {
    expect(await runTurn([result])).toEqual([])
  })

  it('整表替换成空集但从没抬起过:仍然一条都不发', async () => {
    // SDK 在某些次序下会先发一条空表。没抬起过就没有"落"可言 —— 发一条
    // settled 等于凭空在气泡里画一根"已完成"的状态条。
    expect(await runTurn([tasks(), result])).toEqual([])
  })

  it('抬起 → running,带起始墙钟而不是耗时', async () => {
    const before = Date.now()
    const calls = await runTurn([tasks('task-1'), result, tasks(), result])
    const running = calls.filter(call => call.phase === 'running')

    expect(running).toHaveLength(1)
    expect(running[0]).toMatchObject({
      connectorId: 'claude-code-agent',
      localSessionId: 'exec-1',
      phase: 'running',
      count: 1,
    })
    expect(running[0].startedAt).toBeGreaterThanOrEqual(before)
    expect(running[0].startedAt).toBeLessThanOrEqual(Date.now())
    // running 不带耗时:渲染侧自己算,否则宿主就得逐秒发事件。
    expect(running[0].elapsedMs).toBeUndefined()
  })

  it('归零 → settled,带总时长,且 startedAt 与起时同一个值', async () => {
    const calls = await runTurn([tasks('task-1'), result, tasks(), result])
    const running = calls.find(call => call.phase === 'running')
    const settled = calls.find(call => call.phase === 'settled')

    expect(settled).toBeDefined()
    expect(settled).toMatchObject({ phase: 'settled', count: 0 })
    expect(settled!.elapsedMs).toBeGreaterThanOrEqual(0)
    // 整段期间是同一个起点 —— 渲染侧据此走秒,中途换基准会让计时跳。
    expect(settled!.startedAt).toBe(running!.startedAt)
  })

  it('任务数变了才补报,没变不重复投递', async () => {
    const calls = await runTurn([
      tasks('task-1'),
      tasks('task-1'),          // 同一张表 → 不该再发
      tasks('task-1', 'task-2'), // 数变了 → 补一条
      result,
      tasks(),
      result,
    ])
    expect(calls.filter(call => call.phase === 'running').map(call => call.count))
      .toEqual([1, 2])
  })

  it('一轮里起落两次 = 两段独立计时', async () => {
    const calls = await runTurn([
      tasks('task-1'), result, tasks(), result,
      tasks('task-2'), result, tasks(), result,
    ])
    const starts = calls.filter(call => call.phase === 'running')
    expect(starts).toHaveLength(2)
    expect(calls.filter(call => call.phase === 'settled')).toHaveLength(2)
    // 第二段重新起表,不是接着第一段算。
    expect(starts[1].startedAt).toBeGreaterThanOrEqual(starts[0].startedAt)
  })

  it('收场时电平仍非零:如实报残留数,不谎称干净归零', async () => {
    // 防呆表超时会关掉输入迭代器,流随之收尾,而 task-1 从没归零过。
    const calls = await runTurn([tasks('task-1'), result])
    const settled = calls.filter(call => call.phase === 'settled')

    expect(settled).toHaveLength(1)
    // count 是残留数而不是 0 —— 一条说"还有 1 个在跑"的定格,比一条假装
    // 干净收尾的结论有用。
    expect(settled[0].count).toBe(1)
    expect(settled[0].elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('abort:照样收场,不留一根永远走秒的状态条', async () => {
    const controller = new AbortController()
    controller.abort()
    const calls = await runTurn([tasks('task-1'), result], { abortSignal: controller.signal })
    // 起没起得来取决于 abort 掐在哪一步,但只要起了就**必须**有落。
    if (calls.some(call => call.phase === 'running')) {
      expect(calls.filter(call => call.phase === 'settled')).toHaveLength(1)
    }
  })

  it('观测口抛错不炸回合', async () => {
    const connector = createClaudeCodeConnector({
      observer: {
        turn: () => {},
        toolDecision: () => {},
        backgroundTasks: () => { throw new Error('observer boom') },
      },
      backgroundTaskTimeoutMs: 20,
      queryFn: () => (async function* run(): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
        yield tasks('task-1')
        yield result
        yield tasks()
        yield result
      })(),
    })
    await expect(drain(connector.streamTurn({
      localSessionId: 'exec-1',
      prompt: 'hi',
      cwd: '/tmp/p',
      turn: 1,
    }))).resolves.toBeUndefined()
  })

  it('没装观测口(金重放 / 纯连接器测试)也照常跑完', async () => {
    const connector = createClaudeCodeConnector({
      backgroundTaskTimeoutMs: 20,
      queryFn: () => (async function* run(): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
        yield tasks('task-1')
        yield result
        yield tasks()
        yield result
      })(),
    })
    await expect(drain(connector.streamTurn({
      localSessionId: 'exec-1',
      prompt: 'hi',
      cwd: '/tmp/p',
      turn: 1,
    }))).resolves.toBeUndefined()
  })
})
