import { describe, expect, it, vi } from 'vitest'
import {
  CLAUDE_CODE_AGENT_CONNECTOR_ID,
  createClaudeCodeConnector,
} from '../claude-code-connector.js'
import type { ClaudeCodeQueryOptions, ClaudeCodeSdkMessage } from '../claude-code-connector.js'
import type {
  ExternalAgentEvent,
  ExternalAgentPermissionAsk,
  ExternalAgentPermissionDecision,
} from '../types.js'

async function* replay(messages: ClaudeCodeSdkMessage[]): AsyncGenerator<ClaudeCodeSdkMessage, void, void> {
  for (const message of messages) yield message
}

async function collect(events: AsyncIterable<ExternalAgentEvent>): Promise<ExternalAgentEvent[]> {
  const out: ExternalAgentEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

const initMessage: ClaudeCodeSdkMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'claude-session-1',
}

const fullTurnFixture: ClaudeCodeSdkMessage[] = [
  initMessage,
  {
    type: 'stream_event',
    session_id: 'claude-session-1',
    parent_tool_use_id: null,
    event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm ' } },
  },
  {
    type: 'stream_event',
    session_id: 'claude-session-1',
    parent_tool_use_id: null,
    event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Listing files. ' } },
  },
  {
    type: 'stream_event',
    session_id: 'claude-session-1',
    parent_tool_use_id: null,
    event: {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'Bash' },
    },
  },
  {
    type: 'stream_event',
    session_id: 'claude-session-1',
    parent_tool_use_id: null,
    event: { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"command":"ls"}' } },
  },
  {
    type: 'stream_event',
    session_id: 'claude-session-1',
    parent_tool_use_id: null,
    event: { type: 'content_block_stop', index: 2 },
  },
  {
    type: 'user',
    session_id: 'claude-session-1',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file-a\nfile-b' }],
    },
  },
  {
    type: 'stream_event',
    session_id: 'claude-session-1',
    parent_tool_use_id: null,
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done.' } },
  },
  {
    type: 'result',
    subtype: 'success',
    session_id: 'claude-session-1',
    result: 'Done.',
    total_cost_usd: 0.0123,
    usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 80 },
  },
]

describe('ClaudeCodeConnector', () => {
  it('maps the SDK stream to normalized events with externally-executed tools', async () => {
    const captured: { prompt: string; options: ClaudeCodeQueryOptions }[] = []
    const connector = createClaudeCodeConnector({
      executablePath: '/usr/local/bin/claude',
      permissionHandler: async () => ({ behavior: 'allow' as const }),
      queryFn: params => {
        captured.push(params)
        return replay(fullTurnFixture)
      },
      now: () => 1000,
    })

    const events = await collect(connector.streamTurn({
      localSessionId: 'session-1',
      messageId: 'msg-1',
      prompt: 'list files',
      cwd: '/tmp/project',
      turn: 1,
    }))

    expect(captured[0].prompt).toBe('list files')
    expect(captured[0].options).toMatchObject({
      cwd: '/tmp/project',
      pathToClaudeCodeExecutable: '/usr/local/bin/claude',
      includePartialMessages: true,
      permissionMode: 'default',
    })

    expect(events[0]).toEqual({
      type: 'session-established',
      link: {
        localSessionId: 'session-1',
        connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
        externalSessionId: 'claude-session-1',
        cwd: '/tmp/project',
        createdAt: 1000,
        lastUsedAt: 1000,
      },
    })
    expect(events.slice(1).map(event => event.type)).toEqual([
      'reasoning-delta',
      'text-delta',
      'tool-call-start',
      'tool-call-delta',
      'tool-call-done',
      'tool-result',
      // F4:工具结果到齐、下一段正文开始 = 新的一轮。这条 finish(tool_calls) 与
      // 本地 provider 的 turn 分界逐字相同,执行器据它给下一轮另开一个
      // `data-steps` 锚点 —— 少了它,后面的工具卡会全部塌回第一个锚点。
      'finish',
      'text-delta',
      'provider-data',
      'finish',
    ])
    expect(events.filter(event => event.type === 'finish').map(event => (
      (event as { finishReason: string }).finishReason
    ))).toEqual(['tool_calls', 'stop'])
    const done = events.find(event => event.type === 'tool-call-done')
    expect(done).toMatchObject({
      toolCall: { id: 'toolu_1', name: 'Bash', arguments: '{"command":"ls"}', externallyExecuted: true },
    })
    const result = events.find(event => event.type === 'tool-result')
    expect(result).toMatchObject({ result: { content: 'file-a\nfile-b' } })
    const finish = events.at(-1)
    expect(finish).toMatchObject({
      type: 'finish',
      finishReason: 'stop',
      usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140, cacheReadTokens: 80 },
    })
    const cost = events.find(event => event.type === 'provider-data')
    expect(cost).toMatchObject({ providerData: { type: 'cost', costUSD: 0.0123 } })
  })

  it('routes canUseTool through the permission handler and denies on deny/throw/missing', async () => {
    const asks: ExternalAgentPermissionAsk[] = []
    let verdict: ExternalAgentPermissionDecision | Error = { behavior: 'allow' }
    const handler = async (ask: ExternalAgentPermissionAsk) => {
      asks.push(ask)
      if (verdict instanceof Error) throw verdict
      return verdict
    }

    let canUseTool: NonNullable<ClaudeCodeQueryOptions['canUseTool']> | undefined
    const capture = createClaudeCodeConnector({
      permissionHandler: handler,
      queryFn: params => {
        canUseTool = params.options.canUseTool
        return replay([initMessage, { type: 'result', subtype: 'success', session_id: 'claude-session-1' }])
      },
    })
    await collect(capture.streamTurn({
      localSessionId: 'session-1',
      messageId: 'msg-7',
      prompt: 'hi',
      cwd: '/tmp/p',
      turn: 1,
    }))
    if (!canUseTool) throw new Error('canUseTool was not passed to the SDK')
    const signal = new AbortController().signal

    await expect(
      canUseTool('Bash', { command: 'ls' }, { signal, toolUseID: 'toolu_01' }),
    ).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { command: 'ls' },
    })
    expect(asks.at(-1)).toEqual({
      connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
      localSessionId: 'session-1',
      messageId: 'msg-7',
      cwd: '/tmp/p',
      toolName: 'Bash',
      input: { command: 'ls' },
      // G1:SDK 给的 toolUseID 必须原样过桥,否则卡片永远匹配不上 toolCall。
      toolCallId: 'toolu_01',
    })

    verdict = { behavior: 'deny', message: '无人响应,权限请求在 120 秒后自动拒绝' }
    await expect(canUseTool('Bash', {}, { signal, toolUseID: 't2' })).resolves.toEqual({
      behavior: 'deny',
      message: '无人响应,权限请求在 120 秒后自动拒绝',
    })

    verdict = new Error('boom')
    await expect(canUseTool('Bash', {}, { signal, toolUseID: 't3' })).resolves.toMatchObject({
      behavior: 'deny',
      message: expect.stringContaining('boom'),
    })

    // Connector without a handler must fail closed.
    let noHandlerCanUse: NonNullable<ClaudeCodeQueryOptions['canUseTool']> | undefined
    const noHandler = createClaudeCodeConnector({
      queryFn: params => {
        noHandlerCanUse = params.options.canUseTool
        return replay([{ type: 'result', subtype: 'success' }])
      },
    })
    await collect(noHandler.streamTurn({
      localSessionId: 's', prompt: 'x', cwd: '/tmp', turn: 1,
    }))
    await expect(
      noHandlerCanUse!('Bash', {}, { signal, toolUseID: 't4' }),
    ).resolves.toMatchObject({ behavior: 'deny' })
  })

  it('skips subagent-nested messages and settles unreported tool calls at result', async () => {
    const connector = createClaudeCodeConnector({
      queryFn: () => replay([
        initMessage,
        // Nested under a Task subagent — must be ignored entirely.
        {
          type: 'stream_event',
          session_id: 'claude-session-1',
          parent_tool_use_id: 'toolu_parent',
          event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'NESTED' } },
        },
        // Backfill path: assistant message declares a tool call with no prior stream events.
        {
          type: 'assistant',
          session_id: 'claude-session-1',
          parent_tool_use_id: null,
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: 'a.ts' } }],
          },
        },
        { type: 'result', subtype: 'error_max_turns', session_id: 'claude-session-1' },
      ]),
    })

    const events = await collect(connector.streamTurn({
      localSessionId: 'session-1',
      prompt: 'read',
      cwd: '/tmp',
      turn: 1,
    }))

    // 嵌套在 Task 子 agent 下的那段正文一个字都不该冒出来。
    expect(events.some(event => event.type === 'text-delta' && event.delta.includes('NESTED')))
      .toBe(false)
    expect(events.map(event => event.type)).toEqual([
      'session-established',
      'tool-call-start',
      'tool-call-done',
      'tool-result',
      // 失败 result 现在先补一条可见正文(止血 1),再收 finish。
      'text-delta',
      'finish',
    ])
    const done = events.find(event => event.type === 'tool-call-done')
    expect(done).toMatchObject({
      toolCall: { id: 'toolu_2', name: 'Read', arguments: '{"file_path":"a.ts"}', externallyExecuted: true },
    })
    expect(events.at(-1)).toMatchObject({ type: 'finish', finishReason: 'error' })
  })

  /**
   * 止血 1(2026-08-11):失败要说人话。限流 / 额度用尽 / 登录过期 / resume 失效
   * 在此之前一律表现为「回合突然结束什么都没说」,原文只进 console.warn。
   */
  it('surfaces the SDK failure text as visible content before finishing with error', async () => {
    const warned: string[] = []
    const connector = createClaudeCodeConnector({
      logger: { log: () => {}, warn: (line: string) => warned.push(line) },
      queryFn: () => replay([
        initMessage,
        {
          type: 'result',
          subtype: 'error_during_execution',
          session_id: 'claude-session-1',
          is_error: true,
          result: 'Claude AI usage limit reached|1754899200',
        },
      ]),
    })

    const events = await collect(connector.streamTurn({
      localSessionId: 'session-1',
      prompt: 'go',
      cwd: '/tmp',
      turn: 1,
    }))

    const notice = events.find(event => event.type === 'text-delta')
    expect(notice).toBeDefined()
    // 原文一字不改地带出来,subtype 同屏 —— 排障时这两个是两个不同的结论。
    expect((notice as { delta: string }).delta).toContain('Claude AI usage limit reached|1754899200')
    expect((notice as { delta: string }).delta).toContain('error_during_execution')
    // 正文在 finish 之前,否则回合已经收了才补文本,面上还是什么都不显示。
    expect(events.map(event => event.type)).toEqual(['session-established', 'text-delta', 'finish'])
    expect(events.at(-1)).toMatchObject({ type: 'finish', finishReason: 'error' })
    // 日志那条保留(排障要全量 JSON),但它不再是唯一的出口。
    expect(warned).toHaveLength(1)
  })

  it('still says something when the failed result carries no text at all', async () => {
    const connector = createClaudeCodeConnector({
      queryFn: () => replay([{ type: 'result', subtype: 'error_max_turns', session_id: 's' }]),
    })
    const events = await collect(connector.streamTurn({
      localSessionId: 'session-1',
      prompt: 'go',
      cwd: '/tmp',
      turn: 1,
    }))
    const notice = events.find(event => event.type === 'text-delta') as { delta: string } | undefined
    expect(notice?.delta).toContain('error_max_turns')
    expect(notice?.delta.length).toBeGreaterThan(10)
  })

  it('says nothing extra on a successful result', async () => {
    const connector = createClaudeCodeConnector({
      queryFn: () => replay([{ type: 'result', subtype: 'success', session_id: 's', result: 'Done.' }]),
    })
    const events = await collect(connector.streamTurn({
      localSessionId: 'session-1',
      prompt: 'go',
      cwd: '/tmp',
      turn: 1,
    }))
    expect(events.map(event => event.type)).toEqual(['session-established', 'finish'])
  })

  it('injects the host-resolved spawn env (proxy) into the SDK options', async () => {
    const captured: ClaudeCodeQueryOptions[] = []
    const connector = createClaudeCodeConnector({
      resolveSpawnEnv: () => ({ PATH: '/usr/bin', HTTPS_PROXY: 'http://127.0.0.1:7890' }),
      queryFn: params => {
        captured.push(params.options)
        return replay([{ type: 'result', subtype: 'success', session_id: 's1' }])
      },
    })
    await collect(connector.streamTurn({ localSessionId: 's', prompt: 'x', cwd: '/tmp', turn: 1 }))
    expect(captured[0].env).toEqual({ PATH: '/usr/bin', HTTPS_PROXY: 'http://127.0.0.1:7890' })

    // Without a resolver the option is omitted so the SDK inherits process env.
    const bare = createClaudeCodeConnector({
      queryFn: params => {
        captured.push(params.options)
        return replay([{ type: 'result', subtype: 'success', session_id: 's2' }])
      },
    })
    await collect(bare.streamTurn({ localSessionId: 's', prompt: 'x', cwd: '/tmp', turn: 1 }))
    expect('env' in captured[1]).toBe(false)
  })

  it('synthesizes a diff metadata event for Edit/Write calls so the app renders the diff UI', async () => {
    const connector = createClaudeCodeConnector({
      queryFn: () => replay([
        initMessage,
        {
          type: 'assistant',
          session_id: 'claude-session-1',
          parent_tool_use_id: null,
          message: {
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: 'toolu_edit',
              name: 'Edit',
              input: {
                file_path: '/tmp/a.swift',
                old_string: 'let a = 1',
                new_string: 'let a = 2',
              },
            }],
          },
        },
        { type: 'result', subtype: 'success', session_id: 'claude-session-1' },
      ]),
    })

    const events = await collect(connector.streamTurn({
      localSessionId: 's', prompt: 'edit it', cwd: '/tmp', turn: 1,
    }))
    const metadata = events.find(event => event.type === 'tool-metadata')
    expect(metadata).toMatchObject({
      toolCall: { id: 'toolu_edit', externallyExecuted: true },
      update: {
        metadata: {
          path: '/tmp/a.swift',
          additions: 1,
          deletions: 1,
        },
      },
    })
    const diff = (metadata as unknown as { update: { metadata: { diff: string } } }).update.metadata.diff
    expect(diff).toContain('-let a = 1')
    expect(diff).toContain('+let a = 2')

    // Bash calls stay diff-free.
    const bash = createClaudeCodeConnector({
      queryFn: () => replay([
        initMessage,
        {
          type: 'assistant',
          session_id: 'claude-session-1',
          parent_tool_use_id: null,
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_b', name: 'Bash', input: { command: 'ls' } }],
          },
        },
        { type: 'result', subtype: 'success', session_id: 'claude-session-1' },
      ]),
    })
    const bashEvents = await collect(bash.streamTurn({
      localSessionId: 's', prompt: 'x', cwd: '/tmp', turn: 1,
    }))
    expect(bashEvents.some(event => event.type === 'tool-metadata')).toBe(false)
  })

  it('maps thinking/effort onto SDK options with claude family semantics', async () => {
    const captured: ClaudeCodeQueryOptions[] = []
    const connector = createClaudeCodeConnector({
      queryFn: params => {
        captured.push(params.options)
        return replay([{ type: 'result', subtype: 'success', session_id: 's' }])
      },
    })
    const run = (input: { model?: string; thinking?: 'enabled' | 'disabled'; reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' }) =>
      collect(connector.streamTurn({
        localSessionId: 's', prompt: 'x', cwd: '/tmp', turn: 1, ...input,
      }))

    await run({ thinking: 'enabled', reasoningEffort: 'xhigh', model: 'claude-fable-5' })
    expect(captured.at(-1)).toMatchObject({ effort: 'xhigh' })
    expect(captured.at(-1)?.thinking).toBeUndefined()

    // minimal collapses to the CLI's lowest tier.
    await run({ thinking: 'enabled', reasoningEffort: 'minimal' })
    expect(captured.at(-1)).toMatchObject({ effort: 'low' })

    // Explicit off is only sent to families that accept the param.
    await run({ thinking: 'disabled', model: 'claude-sonnet-5' })
    expect(captured.at(-1)?.thinking).toEqual({ type: 'disabled' })

    await run({ thinking: 'disabled', model: 'claude-fable-5' })
    expect(captured.at(-1)?.thinking).toBeUndefined()

    // Unknown model (CLI default): never override.
    await run({ thinking: 'disabled' })
    expect(captured.at(-1)?.thinking).toBeUndefined()
    expect(captured.at(-1)?.effort).toBeUndefined()
  })

  it('resumes with the persisted external session id and aborts via interrupt', async () => {
    const captured: ClaudeCodeQueryOptions[] = []
    const connector = createClaudeCodeConnector({
      queryFn: params => {
        captured.push(params.options)
        return replay([{ type: 'result', subtype: 'success', session_id: 'claude-session-9' }])
      },
    })

    const iteration = collect(connector.streamTurn({
      localSessionId: 'session-1',
      prompt: 'continue',
      cwd: '/tmp/project',
      turn: 1,
      resume: {
        localSessionId: 'session-1',
        connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
        externalSessionId: 'claude-session-9',
        cwd: '/tmp/project',
        createdAt: 1,
        lastUsedAt: 2,
      },
    }))
    await iteration
    expect(captured[0].resume).toBe('claude-session-9')

    // interrupt aborts the per-session controller passed to the SDK.
    const abortSeen = vi.fn()
    const slow = createClaudeCodeConnector({
      queryFn: params => {
        params.options.abortController?.signal.addEventListener('abort', abortSeen)
        return (async function* () {
          yield { type: 'system', subtype: 'init', session_id: 's' } as ClaudeCodeSdkMessage
          await new Promise(resolve => setTimeout(resolve, 5))
          yield { type: 'result', subtype: 'success' } as ClaudeCodeSdkMessage
        })()
      },
    })
    const run = collect(slow.streamTurn({ localSessionId: 'session-2', prompt: 'x', cwd: '/tmp', turn: 1 }))
    await slow.interrupt('session-2')
    await run
    expect(abortSeen).toHaveBeenCalled()
  })
})
