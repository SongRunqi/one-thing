import { describe, expect, it } from 'vitest'
import {
  UNBOUND_WORKING_DIRECTORY_NOTICE,
  createExternalAgentProvider,
} from '../provider.js'
import type {
  ExternalAgentConnector,
  ExternalAgentTurnRequest,
} from '../types.js'

function captureConnector(captured: ExternalAgentTurnRequest[]): ExternalAgentConnector {
  return {
    id: 'claude-code-agent',
    capabilities: {
      streamingText: true,
      thinking: true,
      toolSteps: true,
      permissionBridge: 'callback',
      resume: true,
      fork: true,
      steer: false,
      imagesIn: false,
      mcpInjection: 'in-process',
      concurrentSessions: 'per-process',
    },
    async *streamTurn(request) {
      captured.push(request)
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    },
    async interrupt() {},
    async dispose() {},
  }
}

describe('createExternalAgentProvider', () => {
  it('maps the pseudo-model to CLI default and forwards real models with thinking/effort', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'claude-code-agent',
      connector: captureConnector(captured),
      localSessionId: 'session-1',
      workingDirectory: '/tmp/project',
    })

    const drain = async (model: string) => {
      for await (const _event of provider.streamTurn!({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        thinking: 'enabled',
        reasoningEffort: 'xhigh',
        turn: 1,
      })) { /* drain */ }
    }

    await drain('claude-code-agent')
    expect(captured.at(-1)).toMatchObject({
      model: undefined,
      thinking: 'enabled',
      reasoningEffort: 'xhigh',
      cwd: '/tmp/project',
    })

    await drain('claude-opus-4-8')
    expect(captured.at(-1)).toMatchObject({ model: 'claude-opus-4-8' })
  })

  /**
   * G9:在 E4 之前这里只取最后一条 user 文本,system 位整个被丢掉 —— 房间回合的
   * system prompt **就是** persona(`app/engine/prompt/system-prompt.ts`),丢了它
   * 群里的 Iris 就不是 Iris。
   */
  it('forwards the whole system prompt so the persona reaches the external agent', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'claude-code-agent',
      connector: captureConnector(captured),
      localSessionId: 'session-1',
      workingDirectory: '/tmp/project',
    })
    for await (const _event of provider.streamTurn!({
      model: 'claude-code-agent',
      messages: [
        { role: 'system', content: '你是 Iris,一个眼光毒、嘴更毒的设计师。' },
        { role: 'system', content: '<context-variables>now=2026-08-05</context-variables>' },
        { role: 'user', content: '这版首页你怎么看?' },
      ],
      turn: 1,
    })) { /* drain */ }

    expect(captured.at(-1)?.systemPrompt).toBe(
      '你是 Iris,一个眼光毒、嘴更毒的设计师。\n\n<context-variables>now=2026-08-05</context-variables>',
    )
    // prompt 仍是最后一条 user 文本 —— 上下文归上下文,这一轮的问题归问题。
    expect(captured.at(-1)?.prompt).toBe('这版首页你怎么看?')
  })

  it('omits systemPrompt entirely when the turn carries no system message', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'claude-code-agent',
      connector: captureConnector(captured),
      localSessionId: 'session-1',
      workingDirectory: '/tmp/project',
    })
    for await (const _event of provider.streamTurn!({
      model: 'claude-code-agent',
      messages: [{ role: 'user', content: 'hi' }],
      turn: 1,
    })) { /* drain */ }
    expect(captured.at(-1)).not.toHaveProperty('systemPrompt')
  })

  /**
   * 止血 2(2026-08-11):以前这里兜底 `process.cwd()` —— 开发时那恰好是仓库根,
   * 打包后是 `/`,外部 agent 在空目录里摸索而界面上没有一个字。现在它**不开跑**,
   * 并且把「该做什么」说出来。
   */
  it.each([undefined, '', '   '])(
    'refuses to start and says why when the working directory is %p',
    async workingDirectory => {
      const captured: ExternalAgentTurnRequest[] = []
      const provider = createExternalAgentProvider({
        providerId: 'claude-code-agent',
        connector: captureConnector(captured),
        localSessionId: 'session-1',
        ...(workingDirectory === undefined ? {} : { workingDirectory }),
      })
      const events = []
      for await (const event of provider.streamTurn!({
        model: 'claude-code-agent',
        messages: [{ role: 'user', content: 'hi' }],
        turn: 1,
      })) events.push(event)

      // 连接器一次都没被调用 —— 拒绝发生在开跑之前。
      expect(captured).toHaveLength(0)
      expect(events).toEqual([
        { type: 'text-delta', turn: 1, delta: UNBOUND_WORKING_DIRECTORY_NOTICE },
        { type: 'finish', turn: 1, finishReason: 'error' },
      ])
      expect(UNBOUND_WORKING_DIRECTORY_NOTICE).toContain('/cd')
    },
  )
})
