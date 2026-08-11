/**
 * **中途追话的验收(连接器侧)**,2026-08-12。
 *
 * 用户的判决是「实时性问题很大」,不能插话是主因之一。此前外部会话上的一条中途
 * 消息必然进宿主的 steering 队列,要等**整个 CLI 回合**跑完才轮到它 —— agentic
 * 长跑就是几分钟。
 *
 * 这里断言的是三件事,每一件都对应一条实测结论(真 CLI 2.1.227 + haiku,逐条
 * 时间线见 `ClaudeCodeSdkUserMessage.priority` 的注释):
 *
 *  1. **形状与时机** —— 追话作为第二条 `SDKUserMessage` 进那条整轮开着的输入
 *     迭代器;这一轮已经开口了就带 `priority:'now'`(实测:当前轮 13ms 内就地
 *     收场),还没开口就**不带**(实测:带了会被整条吞掉,重跑的是原 prompt)。
 *  2. **收场不提前** —— 追话在飞时,当前轮那条 `result` 不是终点:输入不关、
 *     `finish` 不发。少了这一条,追话那一轮永远不会跑。
 *  3. **如实标注** —— 三种收场("插进去了 / 排上了 / 没送到")分别报出去,
 *     宿主据此决定要不要退回自己的队列。压成一个 boolean 就等于让宿主猜,而它
 *     猜错的方向永远是「以为插进去了」。
 */
import { describe, expect, it } from 'vitest'
import { createClaudeCodeConnector } from '../claude-code-connector.js'
import type {
  ClaudeCodeSdkMessage,
  ClaudeCodeSdkUserMessage,
} from '../claude-code-connector.js'
import type { ExternalAgentEvent } from '../types.js'

const RESULT: ClaudeCodeSdkMessage = { type: 'result', subtype: 'success', session_id: 's' }
const TEXT_EVENT: ClaudeCodeSdkMessage = {
  type: 'stream_event',
  session_id: 's',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '1 -- ' } },
}

/**
 * 一台**可以被拨动**的回合台。
 *
 * 与既有的回放式 harness 不同:追话是一个时序问题(「开口之前」vs「开口之后」),
 * 回放一个固定数组测不出时序。所以这里把 SDK 侧的出栈交给测试自己 `emit`,并把
 * 那条真正的输入迭代器整个交出来 —— 断言的是**它收到了什么**,而不是我们以为
 * 自己发了什么。
 */
function createTurnBench() {
  const sent: ClaudeCodeSdkUserMessage[] = []
  let inputClosed = false
  const outbox: ClaudeCodeSdkMessage[] = []
  let wake: (() => void) | undefined
  let finished = false

  const connector = createClaudeCodeConnector({
    queryFn: ({ prompt }) => {
      // 输入迭代器在后台被消费,与真 SDK 的 `Query.streamInput` 同一个形状:
      // 它一直读到迭代器自己结束为止。
      void (async () => {
        for await (const message of prompt) sent.push(message)
        inputClosed = true
      })()
      return (async function* out(): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
        for (;;) {
          while (outbox.length > 0) yield outbox.shift()!
          if (finished) return
          await new Promise<void>(resolve => { wake = resolve })
        }
      })()
    },
  })

  const events: ExternalAgentEvent[] = []
  const drained = (async () => {
    for await (const event of connector.streamTurn({
      localSessionId: 'exec-1',
      messageId: 'msg-1',
      prompt: 'count to 60',
      cwd: '/tmp',
      turn: 0,
    })) events.push(event)
  })()

  function emit(...messages: ClaudeCodeSdkMessage[]): Promise<void> {
    outbox.push(...messages)
    const resume = wake
    wake = undefined
    resume?.()
    // 让消费侧把这一批走完(生成器链要好几个微任务才传导到底)。
    return new Promise<void>(resolve => { setTimeout(resolve, 0) })
  }

  function finish(): Promise<void> {
    finished = true
    const resume = wake
    wake = undefined
    resume?.()
    return drained
  }

  return {
    connector,
    events,
    sent,
    emit,
    finish,
    get inputClosed() { return inputClosed },
    /** 让已排队的微任务跑完,再读状态。 */
    settle: () => new Promise<void>(resolve => { setTimeout(resolve, 0) }),
  }
}

describe('claude-code connector steering', () => {
  it('声明自己插得进话', () => {
    const connector = createClaudeCodeConnector({})
    expect(connector.capabilities.steer).toBe(true)
    expect(typeof connector.steer).toBe('function')
  })

  it('没有正在跑的回合时如实报 unavailable,一个字都不发', () => {
    const connector = createClaudeCodeConnector({})
    expect(connector.steer?.('exec-1', '插一句')).toBe('unavailable')
    // 空白追话同样不算送到 —— 送一条空消息进去只会白跑一轮。
    expect(connector.steer?.('exec-1', '   ')).toBe('unavailable')
  })

  it('这一轮已经开口:带 priority:"now" 塞进同一条输入迭代器,报 steered', async () => {
    const bench = createTurnBench()
    await bench.settle()
    // 起手那条用户消息已经发出去了,追话还没有。
    expect(bench.sent).toHaveLength(1)
    expect(bench.sent[0].priority).toBeUndefined()

    await bench.emit(TEXT_EVENT)
    expect(bench.connector.steer?.('exec-1', '别数了,只回 PIVOT')).toBe('steered')
    await bench.settle()

    expect(bench.sent).toHaveLength(2)
    expect(bench.sent[1]).toMatchObject({
      type: 'user',
      parent_tool_use_id: null,
      priority: 'now',
      message: { role: 'user', content: [{ type: 'text', text: '别数了,只回 PIVOT' }] },
    })

    await bench.emit(RESULT, RESULT)
    await bench.finish()
  })

  it('这一轮还没开口:不带 priority(会被吞掉),如实报 queued', async () => {
    const bench = createTurnBench()
    await bench.settle()

    expect(bench.connector.steer?.('exec-1', '插一句')).toBe('queued')
    await bench.settle()

    expect(bench.sent).toHaveLength(2)
    expect(bench.sent[1].priority).toBeUndefined()
    expect(bench.sent[1].message.content).toEqual([{ type: 'text', text: '插一句' }])

    await bench.emit(RESULT, RESULT)
    await bench.finish()
  })

  it('追话在飞时,当前轮那条 result 不是终点:输入不关、finish 不发', async () => {
    const bench = createTurnBench()
    await bench.settle()
    await bench.emit(TEXT_EVENT)
    expect(bench.connector.steer?.('exec-1', '改问首都')).toBe('steered')
    await bench.settle()

    // 被截断的那一轮收场了。
    await bench.emit(RESULT)
    expect(bench.inputClosed).toBe(false)
    expect(bench.events.some(event => event.type === 'finish')).toBe(false)

    // 追话那一轮的 result 才是真正的终点。
    await bench.emit(RESULT)
    await bench.settle()
    expect(bench.inputClosed).toBe(true)
    expect(bench.events.filter(event => event.type === 'finish')).toHaveLength(1)

    await bench.finish()
  })

  it('回合收场后登记表清干净,迟到的追话不会被谎报成送到了', async () => {
    const bench = createTurnBench()
    await bench.settle()
    await bench.emit(RESULT)
    await bench.finish()

    expect(bench.connector.steer?.('exec-1', '太晚了')).toBe('unavailable')
  })

  it('dispose 之后没有任何回合可以被追话', async () => {
    const bench = createTurnBench()
    await bench.settle()
    await bench.emit(TEXT_EVENT)
    await bench.connector.dispose()

    expect(bench.connector.steer?.('exec-1', '插一句')).toBe('unavailable')
    await bench.finish().catch(() => { /* abort 掐断,与本用例无关 */ })
  })
})
