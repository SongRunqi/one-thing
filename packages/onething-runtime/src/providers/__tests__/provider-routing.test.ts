import { describe, expect, it, vi } from 'vitest'
import {
  buildOnethingChatTitleGenerationRequest,
  cleanOnethingGeneratedChatTitle,
  fallbackOnethingACPChatTitle,
  formatOnethingACPPlan,
  formatOnethingACPTool,
  generateOnethingChatResponseWithReasoning,
  generateOnethingProviderChatTitle,
  generateOnethingTextChatResponse,
  getLatestOnethingUserMessageText,
  isOnethingProviderDeepSeekThinkingModel,
  mapOnethingACPStopReason,
  mergeOnethingSystemMessagesForGenerateIfNeeded,
  normalizeOnethingDeepSeekAgentReasoningEffort,
  normalizeOnethingAgentReasoningEffort,
  projectOnethingACPPromptStreamEvent,
  resolveOnethingDeepSeekAgentThinking,
  resolveOnethingAgentThinking,
  streamOnethingACPChatResponseWithTools,
  streamOnethingChatResponseWithReasoning,
  streamOnethingChatResponseWithTools,
  streamOnethingTextChatResponse,
} from '../provider-routing.js'

describe('onething provider routing helpers', () => {
  it('normalizes generic and DeepSeek reasoning controls', () => {
    expect(isOnethingProviderDeepSeekThinkingModel('deepseek-v4-pro')).toBe(true)
    expect(isOnethingProviderDeepSeekThinkingModel('deepseek-chat')).toBe(false)
    expect(resolveOnethingDeepSeekAgentThinking('deepseek-reasoner', {})).toBe('enabled')
    expect(resolveOnethingDeepSeekAgentThinking('deepseek-reasoner', { thinking: false })).toBe('disabled')
    expect(normalizeOnethingDeepSeekAgentReasoningEffort('xhigh')).toBe('max')
    expect(normalizeOnethingDeepSeekAgentReasoningEffort('medium')).toBe('high')
    expect(normalizeOnethingAgentReasoningEffort('xhigh')).toBe('max')
    expect(normalizeOnethingAgentReasoningEffort('low')).toBe('high')
    expect(resolveOnethingAgentThinking({ thinking: true })).toBe('enabled')
    expect(resolveOnethingAgentThinking({ thinking: false })).toBe('disabled')
  })

  it('extracts the latest non-empty user message text', () => {
    expect(getLatestOnethingUserMessageText([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: [{ type: 'text', text: ' latest ' }] },
    ])).toBe('latest')
  })

  it('merges system messages into the first user message for providers that require it', () => {
    expect(mergeOnethingSystemMessagesForGenerateIfNeeded(false, [
      { role: 'system', content: 'Rules' },
      { role: 'user', content: 'Hello' },
    ])).toEqual([
      { role: 'system', content: 'Rules' },
      { role: 'user', content: 'Hello' },
    ])

    expect(mergeOnethingSystemMessagesForGenerateIfNeeded(true, [
      { role: 'system', content: 'Rules A' },
      { role: 'system', content: [{ type: 'text', text: 'Rules B' }] },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ])).toEqual([
      {
        role: 'user',
        content: '[System Instructions]\nRules A\n\nRules B\n\n[User Message]\nHello',
      },
      { role: 'assistant', content: 'Hi' },
    ])

    expect(mergeOnethingSystemMessagesForGenerateIfNeeded(true, [
      { role: 'system', content: 'Rules' },
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ])).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '[System Instructions]\nRules\n\n[User Message]\n' },
          { type: 'text', text: 'Hello' },
        ],
      },
    ])
  })

  it('formats ACP updates for stream reasoning chunks', () => {
    expect(formatOnethingACPPlan({
      entries: [
        { status: 'pending', title: 'Read files' },
        { content: 'Summarize result' },
      ],
    })).toBe('ACP plan:\n- [pending] Read files\n- Summarize result')

    expect(formatOnethingACPPlan({})).toBe('ACP agent updated its plan.')
    expect(formatOnethingACPTool({ title: 'read', status: 'running' })).toBe('ACP read (running)')
    expect(mapOnethingACPStopReason('end_turn')).toBe('stop')
    expect(mapOnethingACPStopReason('max_tokens')).toBe('length')
    expect(mapOnethingACPStopReason('refusal')).toBe('content-filter')
  })

  it('builds and cleans chat title requests in runtime', () => {
    expect(fallbackOnethingACPChatTitle('  ## “Long ACP request title with enough words to trim”  ')).toBe(
      'Long ACP request title with enough words',
    )
    expect(fallbackOnethingACPChatTitle('   ')).toBe('ACP Chat')

    const request = buildOnethingChatTitleGenerationRequest('帮我修复微信登录', {
      thinking: true,
      thinkingEffort: 'xhigh',
      serviceTier: 'fast',
      debugSessionId: 'session_1',
    })

    expect(request.messages[0]).toMatchObject({
      role: 'system',
    })
    expect(request.messages[0].content).toContain('Create a short topic title')
    expect(request.messages[1]).toEqual({ role: 'user', content: '帮我修复微信登录' })
    expect(request.options).toEqual({
      temperature: 0.2,
      maxTokens: 20,
      thinking: true,
      thinkingEffort: 'xhigh',
      serviceTier: 'fast',
      debugPurpose: 'chat-title',
      debugSessionId: 'session_1',
    })

    expect(cleanOnethingGeneratedChatTitle(' Title: “Fix WeChat Login” ')).toBe('Fix WeChat Login')
  })

  it('owns provider chat title orchestration behind host adapters', async () => {
    const generateChatResponse = vi.fn(async () => ' Title: “Runtime-Owned Title” ')

    await expect(generateOnethingProviderChatTitle({
      providerId: 'acp',
      config: { model: 'agent-1' },
      userMessage: '  ## ACP title from prompt  ',
      isACPProvider: providerId => providerId === 'acp',
      generateChatResponse,
    })).resolves.toBe('ACP title from prompt')
    expect(generateChatResponse).not.toHaveBeenCalled()

    await expect(generateOnethingProviderChatTitle({
      providerId: 'openai',
      config: { model: 'gpt-test' },
      userMessage: 'Please create a title',
      options: {
        thinking: true,
        thinkingEffort: 'high',
        debugSessionId: 'session-1',
      },
      isACPProvider: () => false,
      generateChatResponse,
    })).resolves.toBe('Runtime-Owned Title')

    expect(generateChatResponse).toHaveBeenCalledWith(
      'openai',
      { model: 'gpt-test' },
      expect.arrayContaining([
        { role: 'user', content: 'Please create a title' },
      ]),
      expect.objectContaining({
        debugPurpose: 'chat-title',
        thinking: true,
        thinkingEffort: 'high',
        debugSessionId: 'session-1',
      }),
    )
  })

  it('owns text-only response projection over reasoning-capable adapters', async () => {
    const generateWithReasoning = vi.fn(async () => ({
      text: 'plain response',
      reasoning: 'hidden chain',
    }))

    await expect(generateOnethingTextChatResponse({
      providerId: 'openai',
      config: { model: 'gpt-test' },
      messages: [{ role: 'user', content: 'hello' }],
      options: { temperature: 0.2 },
      generateWithReasoning,
    })).resolves.toBe('plain response')

    expect(generateWithReasoning).toHaveBeenCalledWith(
      'openai',
      { model: 'gpt-test' },
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
    )
  })

  it('owns ACP generate-with-reasoning aggregation behind host adapters', async () => {
    const abortSignal = new AbortController().signal
    const config = { model: 'acp-agent', baseUrl: '/workspace/project' }
    const messages = [{ role: 'user', content: 'run the task' }]
    const streamACPResponse = vi.fn(() => (async function* () {
      yield { type: 'reasoning', reasoning: 'plan ' }
      yield { type: 'text', text: 'hello ' }
      yield { type: 'text', text: 'world' }
      yield { type: 'reasoning', reasoning: 'done' }
    })())
    const mergeMessagesForGenerate = vi.fn(inputMessages => inputMessages)

    await expect(generateOnethingChatResponseWithReasoning({
      providerId: 'acp',
      config,
      messages,
      options: { abortSignal, debugSessionId: 'session-1' },
      streamACPResponse,
      mergeMessagesForGenerate,
      resolveRuntimeRoute: () => ({ kind: 'acp' }),
      generateWithDeepSeek: vi.fn(),
      runUtilityAgentTurn: vi.fn(),
    })).resolves.toEqual({
      text: 'hello world',
      reasoning: 'plan done',
    })

    expect(streamACPResponse).toHaveBeenCalledWith(
      config,
      messages,
      {
        abortSignal,
        debugSessionId: 'session-1',
        workingDirectory: '/workspace/project',
      },
    )
    expect(mergeMessagesForGenerate).not.toHaveBeenCalled()
  })

  it('owns DeepSeek generate-with-reasoning route orchestration', async () => {
    const config = { model: 'deepseek-reasoner' }
    const messages = [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hello' }]
    const mergedMessages = [{ role: 'user', content: 'merged hello' }]
    const generateWithDeepSeek = vi.fn(async () => ({ text: 'deepseek response' }))
    const runUtilityAgentTurn = vi.fn()

    await expect(generateOnethingChatResponseWithReasoning({
      providerId: 'deepseek',
      config,
      messages,
      options: { temperature: 0.2 },
      streamACPResponse: vi.fn(),
      mergeMessagesForGenerate: vi.fn(() => mergedMessages),
      resolveRuntimeRoute: () => ({ kind: 'deepseek' }),
      generateWithDeepSeek,
      runUtilityAgentTurn,
    })).resolves.toEqual({ text: 'deepseek response' })

    expect(generateWithDeepSeek).toHaveBeenCalledWith(
      config,
      mergedMessages,
      { temperature: 0.2 },
    )
    expect(runUtilityAgentTurn).not.toHaveBeenCalled()
  })

  it('owns utility agent generate-with-reasoning route orchestration', async () => {
    const provider = { id: 'agent-provider' }
    const config = { model: 'agent-model' }
    const messages = [{ role: 'user', content: 'hello' }]
    const mergedMessages = [{ role: 'user', content: 'merged hello' }]
    const runUtilityAgentTurn = vi.fn(async () => ({ text: 'agent response' }))

    await expect(generateOnethingChatResponseWithReasoning({
      providerId: 'openai',
      config,
      messages,
      options: { maxTokens: 100 },
      streamACPResponse: vi.fn(),
      mergeMessagesForGenerate: vi.fn(() => mergedMessages),
      resolveRuntimeRoute: () => ({ kind: 'agent', provider }),
      generateWithDeepSeek: vi.fn(),
      runUtilityAgentTurn,
    })).resolves.toEqual({ text: 'agent response' })

    expect(runUtilityAgentTurn).toHaveBeenCalledWith(
      'openai',
      provider,
      config,
      mergedMessages,
      { maxTokens: 100 },
      'generate',
    )
  })

  it('fails unsupported generate-with-reasoning routes from runtime', async () => {
    await expect(generateOnethingChatResponseWithReasoning({
      providerId: 'unknown',
      config: { model: 'unknown' },
      messages: [{ role: 'user', content: 'hello' }],
      options: {},
      streamACPResponse: vi.fn(),
      mergeMessagesForGenerate: vi.fn(inputMessages => inputMessages),
      resolveRuntimeRoute: () => ({ kind: 'unsupported' }),
      generateWithDeepSeek: vi.fn(),
      runUtilityAgentTurn: vi.fn(),
    })).rejects.toThrow('Provider unknown does not have an AgentProvider runtime for generate.')
  })

  it('owns DeepSeek stream-with-reasoning chunk projection', async () => {
    const config = { model: 'deepseek-reasoner' }
    const messages = [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hello' }]
    const mergedMessages = [{ role: 'user', content: 'merged hello' }]
    const streamDeepSeekTurn = vi.fn(() => (async function* () {
      yield { type: 'reasoning', reasoning: 'think' }
      yield { type: 'text', text: 'answer' }
      yield {
        type: 'finish',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      }
    })())

    const chunks = []
    for await (const chunk of streamOnethingChatResponseWithReasoning({
      providerId: 'deepseek',
      config,
      messages,
      options: { temperature: 0.2 },
      mergeMessagesForGenerate: vi.fn(() => mergedMessages),
      resolveRuntimeRoute: () => ({ kind: 'deepseek' }),
      streamDeepSeekTurn,
      streamUtilityAgentTurn: vi.fn(),
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { type: 'text', text: '', reasoning: 'think' },
      { type: 'text', text: 'answer' },
      {
        type: 'finish',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ])
    expect(streamDeepSeekTurn).toHaveBeenCalledWith(
      config,
      mergedMessages,
      { temperature: 0.2 },
      'stream-reasoning',
    )
  })

  it('owns utility agent stream-with-reasoning route orchestration', async () => {
    const provider = { id: 'agent-provider' }
    const config = { model: 'agent-model' }
    const messages = [{ role: 'user', content: 'hello' }]
    const mergedMessages = [{ role: 'user', content: 'merged hello' }]
    const streamUtilityAgentTurn = vi.fn(() => (async function* () {
      yield { type: 'text' as const, text: 'agent answer' }
    })())

    const chunks = []
    for await (const chunk of streamOnethingChatResponseWithReasoning({
      providerId: 'openai',
      config,
      messages,
      options: { maxTokens: 100 },
      mergeMessagesForGenerate: vi.fn(() => mergedMessages),
      resolveRuntimeRoute: () => ({ kind: 'agent', provider }),
      streamDeepSeekTurn: vi.fn(),
      streamUtilityAgentTurn,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([{ type: 'text', text: 'agent answer' }])
    expect(streamUtilityAgentTurn).toHaveBeenCalledWith(
      'openai',
      provider,
      config,
      mergedMessages,
      { maxTokens: 100 },
      'stream-reasoning',
    )
  })

  it('fails unsupported stream-with-reasoning routes from runtime', async () => {
    async function collectUnsupported() {
      for await (const _chunk of streamOnethingChatResponseWithReasoning({
        providerId: 'unknown',
        config: { model: 'unknown' },
        messages: [{ role: 'user', content: 'hello' }],
        options: {},
        mergeMessagesForGenerate: vi.fn(inputMessages => inputMessages),
        resolveRuntimeRoute: () => ({ kind: 'unsupported' }),
        streamDeepSeekTurn: vi.fn(),
        streamUtilityAgentTurn: vi.fn(),
      })) {
        // Drain the generator to surface the error.
      }
    }

    await expect(collectUnsupported()).rejects.toThrow(
      'Provider unknown does not have an AgentProvider runtime for stream-reasoning.',
    )
  })

  it('owns ACP tool-stream route orchestration', async () => {
    const streamACPResponse = vi.fn(() => (async function* () {
      yield { type: 'text', text: 'acp answer' }
    })())
    const chunks = []

    for await (const chunk of streamOnethingChatResponseWithTools({
      providerId: 'acp',
      config: { model: 'acp-agent' },
      messages: [{ role: 'user', content: 'hello' }],
      tools: {},
      options: { workingDirectory: '/workspace/project' },
      mode: 'stream-tools',
      metadata: { originalMessageCount: 1 },
      resolveRuntimeRoute: () => ({ kind: 'acp' }),
      streamACPResponse,
      streamDeepSeekTurn: vi.fn(),
      streamAgentToolTurn: vi.fn(),
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([{ type: 'text', text: 'acp answer' }])
    expect(streamACPResponse).toHaveBeenCalledWith(
      { model: 'acp-agent' },
      [{ role: 'user', content: 'hello' }],
      { workingDirectory: '/workspace/project' },
    )
  })

  it('owns ACP prompt stream request assembly and event projection', async () => {
    const streamPrompt = vi.fn(() => (async function* () {
      yield {
        type: 'session_update',
        notification: {
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'hello ' },
          },
        },
      }
      yield {
        type: 'session_update',
        notification: {
          update: {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'thinking' },
          },
        },
      }
      yield {
        type: 'finish',
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      }
    })())

    const chunks = []
    for await (const chunk of streamOnethingACPChatResponseWithTools({
      config: { model: 'acp-agent', baseUrl: '/from-config' },
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: [{ type: 'text', text: ' latest prompt ' }] },
      ],
      options: {
        debugSessionId: 'session-1',
        workingDirectory: '/from-option',
      },
      defaultWorkingDirectory: '/default-cwd',
      streamPrompt,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'reasoning', reasoning: 'thinking' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ])
    expect(streamPrompt).toHaveBeenCalledWith(
      'acp-agent',
      expect.objectContaining({
        localSessionId: 'session-1',
        prompt: 'latest prompt',
        cwd: '/from-option',
      }),
    )
  })

  it('projects ACP warning, plan, and tool events in runtime', () => {
    expect(Array.from(projectOnethingACPPromptStreamEvent({
      type: 'warning',
      message: 'careful',
    }))).toEqual([{ type: 'reasoning', reasoning: 'careful' }])

    expect(Array.from(projectOnethingACPPromptStreamEvent({
      type: 'session_update',
      notification: {
        update: {
          sessionUpdate: 'plan',
          entries: [{ status: 'pending', title: 'Read files' }],
        },
      },
    }))).toEqual([{
      type: 'reasoning',
      reasoning: 'ACP plan:\n- [pending] Read files',
    }])

    expect(Array.from(projectOnethingACPPromptStreamEvent({
      type: 'session_update',
      notification: {
        update: {
          sessionUpdate: 'tool_call_update',
          title: 'grep',
          status: 'running',
        },
      },
    }))).toEqual([{ type: 'reasoning', reasoning: 'ACP grep (running)' }])
  })

  it('fails ACP prompt streams without a user prompt from runtime', async () => {
    async function collectEmptyPrompt() {
      for await (const _chunk of streamOnethingACPChatResponseWithTools({
        config: { model: 'acp-agent' },
        messages: [{ role: 'assistant', content: 'answer' }],
        defaultWorkingDirectory: '/default-cwd',
        streamPrompt: vi.fn(),
      })) {
        // Drain the generator to surface the error.
      }
    }

    await expect(collectEmptyPrompt()).rejects.toThrow('ACP prompt is empty')
  })

  it('owns DeepSeek tool-stream route orchestration', async () => {
    const streamDeepSeekTurn = vi.fn(() => (async function* () {
      yield { type: 'text', text: 'deepseek tool answer' }
    })())
    const metadata = { originalMessageCount: 2, convertedMessageCount: 2 }
    const chunks = []

    for await (const chunk of streamOnethingChatResponseWithTools({
      providerId: 'deepseek',
      config: { model: 'deepseek-chat' },
      messages: [{ role: 'user', content: 'hello' }],
      tools: { read: { description: 'read files' } },
      options: { debugTurn: 3 },
      mode: 'stream-tools',
      metadata,
      resolveRuntimeRoute: () => ({ kind: 'deepseek' }),
      streamACPResponse: vi.fn(),
      streamDeepSeekTurn,
      streamAgentToolTurn: vi.fn(),
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([{ type: 'text', text: 'deepseek tool answer' }])
    expect(streamDeepSeekTurn).toHaveBeenCalledWith(
      { model: 'deepseek-chat' },
      [{ role: 'user', content: 'hello' }],
      { read: { description: 'read files' } },
      { debugTurn: 3 },
      'stream-tools',
      metadata,
    )
  })

  it('owns agent UI-message tool-stream route orchestration', async () => {
    const provider = { id: 'agent-provider' }
    const streamAgentToolTurn = vi.fn(() => (async function* () {
      yield { type: 'text', text: 'agent ui answer' }
    })())
    const metadata = { uiMessageCount: 1, modelMessageCount: 2 }
    const chunks = []

    for await (const chunk of streamOnethingChatResponseWithTools({
      providerId: 'openai',
      config: { model: 'gpt-test' },
      messages: [{ role: 'user', content: 'hello' }],
      tools: {},
      options: { maxTokens: 100 },
      mode: 'stream-ui-messages',
      metadata,
      resolveRuntimeRoute: () => ({ kind: 'agent', provider }),
      streamDeepSeekTurn: vi.fn(),
      streamAgentToolTurn,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([{ type: 'text', text: 'agent ui answer' }])
    expect(streamAgentToolTurn).toHaveBeenCalledWith(
      'openai',
      provider,
      { model: 'gpt-test' },
      [{ role: 'user', content: 'hello' }],
      {},
      { maxTokens: 100 },
      'stream-ui-messages',
      metadata,
    )
  })

  it('fails unsupported tool-stream routes from runtime', async () => {
    async function collectUnsupported() {
      for await (const _chunk of streamOnethingChatResponseWithTools({
        providerId: 'unknown',
        config: { model: 'unknown' },
        messages: [{ role: 'user', content: 'hello' }],
        tools: {},
        options: {},
        mode: 'stream-ui-messages',
        resolveRuntimeRoute: () => ({ kind: 'unsupported' }),
        streamDeepSeekTurn: vi.fn(),
        streamAgentToolTurn: vi.fn(),
      })) {
        // Drain the generator to surface the error.
      }
    }

    await expect(collectUnsupported()).rejects.toThrow(
      'Provider unknown does not have an AgentProvider runtime for stream-ui-messages.',
    )
  })

  it('owns text stream projection over reasoning-capable adapters', async () => {
    async function* streamWithReasoning() {
      yield { type: 'text' as const, text: 'hello' }
      yield { type: 'text' as const, text: '', reasoning: 'thinking' }
      yield { type: 'finish' as const }
    }

    const chunks = []
    for await (const chunk of streamOnethingTextChatResponse({
      providerId: 'openai',
      config: {},
      messages: [{ role: 'user', content: 'hello' }],
      options: {},
      streamWithReasoning,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { text: 'hello', reasoning: undefined },
      { text: '', reasoning: 'thinking' },
    ])
  })
})
