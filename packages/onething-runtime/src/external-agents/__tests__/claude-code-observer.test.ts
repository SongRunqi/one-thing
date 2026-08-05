/**
 * **E6 的验收(连接器侧)**:外部回合在时间轴上不再是一片空白
 * (claude-code-integration-v2 §6)。
 *
 * 两个产生点,各自钉死:
 *
 *  - **一轮的起 / 落**。落点在 `finally` —— 它是这个生成器唯一的收场出口,所以正常
 *    跑完、抛错、被 abort 掐断走的都是它。「起了却没落」在账上只可能意味着进程没了。
 *  - **`canUseTool` 的每一次决定**。内层 `decideToolUse` 有六个 return,记账放在外层
 *    的唯一出口上 —— 逐个去记必然漏掉一两支,而漏掉的多半是 deny 那几支,恰恰是回查
 *    时最想看见的。
 *
 * 断言的是**我们真的递给了观测口什么**,不是我们打算递什么。
 */
import { describe, expect, it } from 'vitest'
import { createClaudeCodeConnector } from '../claude-code-connector.js'
import type { ClaudeCodeQueryOptions, ClaudeCodeSdkMessage } from '../claude-code-connector.js'
import type { ExternalAgentEvent, ExternalAgentObserver } from '../types.js'

type TurnCall = Parameters<ExternalAgentObserver['turn']>[0]
type ToolCall = Parameters<ExternalAgentObserver['toolDecision']>[0]

async function* replay(messages: ClaudeCodeSdkMessage[]): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
  for (const message of messages) yield message
}

async function drain(events: AsyncIterable<ExternalAgentEvent>): Promise<void> {
  for await (const _event of events) { /* drain */ }
}

const done: ClaudeCodeSdkMessage[] = [{ type: 'result', subtype: 'success', session_id: 'cc-1' }]

function recorder(): {
  observer: ExternalAgentObserver
  turns: TurnCall[]
  tools: ToolCall[]
} {
  const turns: TurnCall[] = []
  const tools: ToolCall[] = []
  return {
    turns,
    tools,
    observer: {
      turn: input => { turns.push(input) },
      toolDecision: input => { tools.push(input) },
    },
  }
}

/** 起一轮;`onOptions` 拿到 SDK 那份选项(`canUseTool` 就在里面)。 */
async function runTurn(options: {
  observer?: ExternalAgentObserver
  messages?: ClaudeCodeSdkMessage[]
  onOptions?: (queryOptions: ClaudeCodeQueryOptions) => Promise<void> | void
  permissionHandler?: NonNullable<Parameters<typeof createClaudeCodeConnector>[0]>['permissionHandler']
  abortSignal?: AbortSignal
  throwOnStream?: boolean
}): Promise<void> {
  const connector = createClaudeCodeConnector({
    ...(options.observer ? { observer: options.observer } : {}),
    ...(options.permissionHandler ? { permissionHandler: options.permissionHandler } : {}),
    queryFn: params => {
      if (options.throwOnStream) {
        return (async function* boom(): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
          throw new Error('SDK exploded')
        })()
      }
      const pending = options.onOptions?.(params.options)
      return (async function* run(): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
        await pending
        yield* replay(options.messages ?? done)
      })()
    },
  })
  await drain(connector.streamTurn({
    localSessionId: 'exec-1',
    messageId: 'msg-1',
    prompt: 'hi',
    cwd: '/tmp/p',
    turn: 1,
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  }))
}

describe('外部回合的起与落', () => {
  it('跑完 = start + end(complete),end 带墙钟', async () => {
    const { observer, turns } = recorder()
    await runTurn({ observer })
    expect(turns.map(call => call.phase)).toEqual(['start', 'end'])
    expect(turns[0]).toMatchObject({
      connectorId: 'claude-code-agent', localSessionId: 'exec-1', phase: 'start',
    })
    expect(turns[0].outcome).toBeUndefined()
    expect(turns[1]).toMatchObject({ phase: 'end', outcome: 'complete' })
    expect(turns[1].elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('抛错 = end(error) —— 而且照旧抛给上游', async () => {
    const { observer, turns } = recorder()
    await expect(runTurn({ observer, throwOnStream: true })).rejects.toThrow('SDK exploded')
    expect(turns.map(call => call.phase)).toEqual(['start', 'end'])
    expect(turns[1].outcome).toBe('error')
  })

  it('被掐断 = end(aborted),不是 error —— 「被人停掉」与「炸了」是两个结论', async () => {
    const { observer, turns } = recorder()
    const controller = new AbortController()
    await runTurn({
      observer,
      abortSignal: controller.signal,
      onOptions: () => { controller.abort() },
    })
    expect(turns[1]).toMatchObject({ phase: 'end', outcome: 'aborted' })
  })

  it('不装观测口 = 不记账,而且这一轮照跑(观测是旁路)', async () => {
    await expect(runTurn({})).resolves.toBeUndefined()
  })
})

describe('canUseTool 的每一次决定', () => {
  it('宿主工具:放行 + hostTool=true,名字归一化成本地那一个', async () => {
    const { observer, tools } = recorder()
    await runTurn({
      observer,
      onOptions: async queryOptions => {
        await queryOptions.canUseTool?.(
          'mcp__onething__send_message',
          { content: 'hi' },
          { signal: new AbortController().signal, toolUseID: 'toolu_1' },
        )
      },
    })
    expect(tools).toEqual([{
      connectorId: 'claude-code-agent',
      localSessionId: 'exec-1',
      // 前缀说的是「这次它是怎么进到 SDK 里的」,不是「它是什么」(E3)。
      toolName: 'send_message',
      decision: 'allow',
      hostTool: true,
      toolCallId: 'toolu_1',
    }])
  })

  it('SDK 自带工具被拒:deny 也记 —— 那正是回查时最想看见的一支', async () => {
    const { observer, tools } = recorder()
    await runTurn({
      observer,
      permissionHandler: async () => ({ behavior: 'deny', message: '无人应答,120 秒后自动拒绝' }),
      onOptions: async queryOptions => {
        await queryOptions.canUseTool?.(
          'Write',
          { path: '/etc/hosts' },
          { signal: new AbortController().signal, toolUseID: 'toolu_2' },
        )
      },
    })
    expect(tools).toEqual([{
      connectorId: 'claude-code-agent',
      localSessionId: 'exec-1',
      toolName: 'Write',
      decision: 'deny',
      hostTool: false,
      toolCallId: 'toolu_2',
    }])
  })

  it('没装审批桥的那一支也记(六个 return 全过同一个出口)', async () => {
    const { observer, tools } = recorder()
    await runTurn({
      observer,
      onOptions: async queryOptions => {
        await queryOptions.canUseTool?.(
          'Bash',
          { command: 'ls' },
          { signal: new AbortController().signal },
        )
      },
    })
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ toolName: 'Bash', decision: 'deny', hostTool: false })
    // toolUseID 缺席时这一格就缺席,不补空串。
    expect(tools[0].toolCallId).toBeUndefined()
  })

  it('观测口自己抛了也不影响决定 —— 它绝不能变成第二个故障源', async () => {
    let decision: unknown
    await runTurn({
      observer: {
        turn: () => { throw new Error('observer boom') },
        toolDecision: () => { throw new Error('observer boom') },
      },
      onOptions: async queryOptions => {
        decision = await queryOptions.canUseTool?.(
          'mcp__onething__send_message',
          {},
          { signal: new AbortController().signal },
        )
      },
    })
    expect(decision).toMatchObject({ behavior: 'allow' })
  })
})
