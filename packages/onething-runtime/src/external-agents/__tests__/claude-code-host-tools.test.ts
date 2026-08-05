/**
 * connector 侧的宿主工具面(E3 §2 第 4 步)。
 *
 * 三件只有在 connector 这一层才看得见的事:
 *
 *  1. **注入的两道门**——能力表(E0)说接得住,而且装配层装上了解析器。任何一道
 *     不过就退回 E3 之前的形状。
 *  2. **两类工具怎么分家**——宿主工具带 `mcp__onething__` 前缀、自带审批,直接
 *     放行;SDK 自带工具照旧过 `canUseTool` 那座桥。
 *  3. **事件流出口的名字归一化**——SDK 侧叫 `mcp__onething__send_message`,而它
 *     就是本地回合那个 `send_message`。归一化之后打字灯(W19)终于对外部 agent
 *     亮得起来 —— 此前它是恒灭的。
 */
import { describe, expect, it, vi } from 'vitest'
import { isCollabSendCall } from '../../collab/say.js'
import { createCollabTypingTracker } from '../../collab/typing.js'
import { createClaudeCodeConnector } from '../claude-code-connector.js'
import type { ClaudeCodeQueryOptions, ClaudeCodeSdkMessage } from '../claude-code-connector.js'
import type { ExternalAgentEvent } from '../types.js'

/** 一条最小的 SDK 流:一次宿主工具调用 + 一次 SDK 自带工具调用 + 收尾。 */
function sdkStream(): AsyncIterable<ClaudeCodeSdkMessage> {
  const messages: ClaudeCodeSdkMessage[] = [
    { type: 'system', subtype: 'init', session_id: 'sdk-1' },
    {
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'call-1', name: 'mcp__onething__send_message' },
      },
    },
    {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"content":"到了"}' },
      },
    },
    { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } },
    {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call-1', content: '已送达' }],
      },
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01 },
  ]
  return (async function* () {
    for (const message of messages) yield message
  })()
}

async function runTurn(options: Parameters<typeof createClaudeCodeConnector>[0] = {}) {
  const captured: { queryOptions?: ClaudeCodeQueryOptions } = {}
  const connector = createClaudeCodeConnector({
    ...options,
    queryFn: ({ options: queryOptions }) => {
      captured.queryOptions = queryOptions
      return sdkStream()
    },
  })
  const events: ExternalAgentEvent[] = []
  for await (const event of connector.streamTurn({
    localSessionId: 'exec-1',
    prompt: '说一句',
    cwd: '/tmp',
    turn: 1,
  })) {
    events.push(event)
  }
  return { captured, events }
}

const injection = {
  mcpServers: { onething: { type: 'sdk', name: 'onething', instance: {} } },
  toolNames: ['mcp__onething__send_message'],
}

describe('注入的两道门', () => {
  it('装上解析器 + 能力表说接得住 ⇒ mcpServers 进 queryOptions', async () => {
    const surface = vi.fn(() => injection)
    const { captured } = await runTurn({ hostToolSurface: surface })

    expect(captured.queryOptions?.mcpServers).toEqual(injection.mcpServers)
    // 解析器拿到的是这一轮的执行会话 —— 它据此查场子、查白名单、绑语境。
    expect(surface).toHaveBeenCalledWith(
      expect.objectContaining({ localSessionId: 'exec-1', cwd: '/tmp' }),
    )
  })

  it('没装解析器 ⇒ 一个字都不注(E3 之前的形状逐字保留)', async () => {
    const { captured } = await runTurn()
    expect(captured.queryOptions?.mcpServers).toBeUndefined()
  })

  it('能力表把 hostTools 翻成 false ⇒ 装了也不注 —— 这一位现在有读者', async () => {
    // 原则 5:能力是**声明**出来的。翻这一位必须真的改变行为,否则声明与真实
    // 能力就开始分家了。
    const capabilities = await import('../../agents/executor/capabilities.js')
    const spy = vi.spyOn(capabilities, 'findAgentExecutorDescriptor')
      .mockReturnValue({
        id: 'claude-code-agent',
        kind: 'external',
        capabilities: {
          hostTools: false,
          steer: false,
          interrupt: true,
          contextWindow: 'theirs',
          persona: 'system',
        },
      })

    const surface = vi.fn(() => injection)
    const { captured } = await runTurn({ hostToolSurface: surface })

    expect(surface).not.toHaveBeenCalled()
    expect(captured.queryOptions?.mcpServers).toBeUndefined()
    spy.mockRestore()
  })

  it('解析器炸了不炸回合 —— 代价是这一轮没有发言权,不是这一轮什么都没有', async () => {
    const warn = vi.fn()
    const { captured, events } = await runTurn({
      hostToolSurface: () => {
        throw new Error('store offline')
      },
      logger: { log: vi.fn(), warn },
    })
    expect(captured.queryOptions?.mcpServers).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('host tool surface failed'))
    // 回合照跑到底。
    expect(events.some(event => event.type === 'finish')).toBe(true)
  })

  it('回合收尾时解绑语境 —— 漏解会让下一轮之后的迟到调用打在过期语境上', async () => {
    const release = vi.fn()
    await runTurn({ hostToolSurface: () => ({ ...injection, release }) })
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('两类工具在 canUseTool 上分家', () => {
  it('宿主工具直接放行 —— 审批已经在我们自己的执行器那条路上了', async () => {
    const permissionHandler = vi.fn(async () => true)
    const { captured } = await runTurn({
      hostToolSurface: () => injection,
      permissionHandler,
    })

    const decision = await captured.queryOptions!.canUseTool!(
      'mcp__onething__send_message',
      { content: '到了' },
      { signal: new AbortController().signal },
    )
    expect(decision).toEqual({ behavior: 'allow', updatedInput: { content: '到了' } })
    // 同一个动作被审两次 = 用户要点两下,第二下问的是他刚答过的事。
    expect(permissionHandler).not.toHaveBeenCalled()
  })

  it('SDK 自带工具照旧过桥', async () => {
    const permissionHandler = vi.fn(async () => false)
    const { captured } = await runTurn({
      hostToolSurface: () => injection,
      permissionHandler,
    })

    const decision = await captured.queryOptions!.canUseTool!(
      'Bash',
      { command: 'rm -rf /' },
      { signal: new AbortController().signal },
    )
    expect(decision).toEqual({ behavior: 'deny', message: 'User denied this tool call.' })
    expect(permissionHandler).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'Bash', localSessionId: 'exec-1' }),
    )
  })

  it('别人家的 MCP 服务器不是宿主工具 —— 它照旧要审批', async () => {
    const permissionHandler = vi.fn(async () => true)
    const { captured } = await runTurn({
      hostToolSurface: () => injection,
      permissionHandler,
    })
    await captured.queryOptions!.canUseTool!(
      'mcp__playwright__click',
      {},
      { signal: new AbortController().signal },
    )
    expect(permissionHandler).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'mcp__playwright__click' }),
    )
  })
})

describe('事件流出口:名字归一化让打字灯亮得起来', () => {
  it('tool-call 事件带的是 send_message,不是 mcp__onething__send_message', async () => {
    const { events } = await runTurn({ hostToolSurface: () => injection })

    const start = events.find(event => event.type === 'tool-call-start')
    expect(start).toMatchObject({ toolName: 'send_message' })

    const done = events.find(event => event.type === 'tool-call-done')
    expect(done).toMatchObject({ toolCall: { name: 'send_message', externallyExecuted: true } })
  })

  it('归一化之后 W19 的打字灯认得出它 —— 此前对外部 agent 是恒灭的', async () => {
    const { events } = await runTurn({ hostToolSurface: () => injection })
    const start = events.find(event => event.type === 'tool-call-start') as
      { toolCallId: string; toolName: string }

    expect(isCollabSendCall(start.toolName)).toBe(true)

    // 端到端一点:把归一化后的名字喂给真的 tracker,灯该亮。
    const tracker = createCollabTypingTracker({ roomSessionId: 'room-1' })
    expect(tracker.observe({
      type: 'tool:input-start',
      toolCallId: start.toolCallId,
      toolName: start.toolName,
    })).toBe(true)
    expect(tracker.observe({
      type: 'tool:input-end',
      toolCallId: start.toolCallId,
    })).toBe(false)
  })
})
