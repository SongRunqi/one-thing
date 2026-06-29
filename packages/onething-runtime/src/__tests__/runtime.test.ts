import { EventBus, StreamChannel } from '@onething/core/events'
import { describe, expect, it, vi } from 'vitest'
import { createOnethingRuntime } from '../runtime.js'

interface TestSettings {
  ai: {
    provider: string
    providers: Record<string, TestProviderConfig>
  }
  skills?: { enableSkills?: boolean }
  chat?: {
    contextCompactEnabled?: boolean
    maxTokens?: number
  }
  tools?: Record<string, unknown>
}

interface TestMessage {
  id: string
  role: string
  content: string
  timestamp: number
  attachments?: TestAttachment[]
  contentParts?: string[]
  source?: string
  model?: string
  provider?: string
  isStreaming?: boolean
  thinkingStartTime?: number
  toolCalls?: unknown[]
}

interface TestSession {
  id: string
  name: string
  createdAt: number
  messages: TestMessage[]
  workingDirectory?: string
}

interface TestProviderConfig {
  model: string
  selectedModels?: string[]
}

interface TestAuth {
  kind: 'api-key'
  apiKey: string
}

interface TestAttachment {
  fileName: string
  mimeType: string
}

interface TestChunk {
  type: 'text-delta'
  text: string
}

interface TestEvent {
  type: string
  [key: string]: unknown
}

function createHarness() {
  const eventBus = new EventBus<TestEvent, TestEvent>()
  const streamChannel = new StreamChannel<TestChunk>()
  const settings: TestSettings = {
    ai: {
      provider: 'test-provider',
      providers: {
        'test-provider': { model: 'test-model' },
      },
    },
    skills: { enableSkills: true },
    chat: { contextCompactEnabled: false, maxTokens: 1024 },
    tools: {},
  }
  const session: TestSession = {
    id: 'session-1',
    name: 'Existing session',
    createdAt: 1000,
    workingDirectory: '/repo',
    messages: [],
  }
  let nextId = 0
  let now = 1000

  const executeMessageStream = vi.fn(async (options: Record<string, unknown>) => {
    streamChannel.push(options.sessionId as string, {
      type: 'text-delta',
      text: `stream:${options.messageContent as string}`,
    })
  })

  const runtime = createOnethingRuntime<
    TestSettings,
    TestMessage,
    TestSession,
    TestProviderConfig,
    TestAuth,
    string,
    string,
    TestAttachment,
    TestMessage,
    void,
    { success: boolean },
    EventBus<TestEvent, TestEvent>,
    never,
    TestChunk
  >({
    eventBus,
    streamChannel,
    ids: {
      createId: () => `msg-${++nextId}`,
    },
    clock: {
      now: () => ++now,
    },
    store: {
      getSettings: () => settings,
      getSession: id => id === session.id ? session : undefined,
      addMessage: (_id, message) => {
        session.messages.push(message)
      },
      renameSession: (_id, name) => {
        session.name = name
      },
      updateMessageAndTruncate: () => false,
      deleteMessageAndTruncate: () => false,
      deleteMessage: () => false,
    },
    permission: {
      clearSession: vi.fn(),
    },
    skills: {
      getForSession: workingDirectory => workingDirectory ? ['repo-skill'] : [],
    },
    prompts: {
      resolveReferences: (content, options) => ({
        modelContent: `${content}:${options.skills.join(',')}`,
        displayContent: content,
        contentParts: [`display:${content}`],
      }),
    },
    media: {
      ingestMessageAttachments: vi.fn(),
    },
    provider: {
      getEffectiveConfig: () => ({
        providerId: 'test-provider',
        providerConfig: { model: 'test-model' },
        model: 'test-model',
      }),
      resolveAuth: async () => ({ kind: 'api-key', apiKey: 'test-key' }),
      getApiType: () => 'chat',
      isSupported: () => true,
      requiresOAuth: () => false,
      generateTitle: async () => 'Generated title',
    },
    models: {
      getModelContextLength: async () => 128000,
      getModelMaxOutputTokens: async () => 4096,
    },
    history: {
      buildMessages: messages => [...messages],
      buildResumeAfterToolConfirmation: historyMessages => historyMessages,
    },
    streams: {
      executeMessageStream,
      executeAgentLoopStreamGeneration: async () => undefined,
    },
    compaction: {
      compactSessionContext: async () => ({ success: true }),
      getContextCompactReason: () => null,
      shouldSkipAutoCompactForProviderUsageMismatch: () => false,
    },
  })

  return {
    eventBus,
    executeMessageStream,
    runtime,
    session,
  }
}

describe('createOnethingRuntime', () => {
  it('wires gateway conversation messages into the shared onething stream engine', async () => {
    const { executeMessageStream, runtime, session } = createHarness()
    const chunks: TestChunk[] = []
    const unsubscribe = runtime.conversationRuntime.streamChannel.subscribe(session.id, chunk => {
      chunks.push(chunk)
    })

    await runtime.conversationRuntime.sendMessage({
      sessionId: session.id,
      content: 'hello',
      channel: 'wechat',
      source: 'gateway',
    })
    unsubscribe()

    expect(session.messages).toHaveLength(2)
    expect(session.messages[0]).toMatchObject({
      role: 'user',
      content: 'hello:repo-skill',
      source: 'gateway',
      contentParts: ['display:hello'],
    })
    expect(session.messages[1]).toMatchObject({
      role: 'assistant',
      provider: 'test-provider',
      model: 'test-model',
      isStreaming: true,
    })
    expect(executeMessageStream).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: session.id,
      messageContent: 'hello:repo-skill',
      providerId: 'test-provider',
    }))
    expect(chunks).toEqual([
      { type: 'text-delta', text: 'stream:hello:repo-skill' },
    ])
  })

  it('binds the supplied event bus for command-driven hosts', async () => {
    const { eventBus, executeMessageStream, runtime, session } = createHarness()

    runtime.engine.bindStatic(runtime.sender)
    await eventBus.emit(session.id, {
      type: 'command:send-message',
      content: 'from-event-bus',
      source: 'ipc',
    })
    await waitForCall(() => executeMessageStream.mock.calls.length > 0)

    expect(executeMessageStream).toHaveBeenCalledWith(expect.objectContaining({
      messageContent: 'from-event-bus:repo-skill',
    }))
  })
})

async function waitForCall(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}
