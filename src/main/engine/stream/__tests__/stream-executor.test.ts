import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StreamExecutionParams } from '../stream-executor.js'

const mocks = vi.hoisted(() => ({
  engine: {
    registerController: vi.fn(),
    removeController: vi.fn(),
    getSteeringQueue: vi.fn(() => ({ kind: 'steering-queue' })),
    getFollowUpQueue: vi.fn(() => ({ kind: 'follow-up-queue' })),
  },
  modelSupportsImageGeneration: vi.fn(async () => false),
  processImageGenerationStream: vi.fn(async () => true),
  executeStreamGeneration: vi.fn(async () => ({ pausedForConfirmation: false })),
  executeAgentLoopStreamGeneration: vi.fn(async () => ({ pausedForConfirmation: false })),
  shouldUseAgentLoopStream: vi.fn(() => false),
}))

vi.mock('../../../providers/model-registry.js', () => ({
  modelSupportsImageGeneration: mocks.modelSupportsImageGeneration,
}))

vi.mock('../image-stream.js', () => ({
  processImageGenerationStream: mocks.processImageGenerationStream,
}))

vi.mock('../tool-loop.js', () => ({
  executeStreamGeneration: mocks.executeStreamGeneration,
}))

vi.mock('../agent-loop-executor.js', () => ({
  executeAgentLoopStreamGeneration: mocks.executeAgentLoopStreamGeneration,
  shouldUseAgentLoopStream: mocks.shouldUseAgentLoopStream,
}))

vi.mock('../../index.js', () => ({
  getStreamEngine: () => mocks.engine,
}))

const { executeMessageStream } = await import('../stream-executor.js')

function params(overrides: Partial<StreamExecutionParams> = {}): StreamExecutionParams {
  return {
    sender: { isDestroyed: () => false, send: vi.fn() } as any,
    sessionId: 's1',
    assistantMessageId: 'm1',
    messageContent: 'hello',
    historyMessages: [{ role: 'user', content: 'hello' }],
    configWithApiKey: { apiKey: 'key', model: 'deepseek-v4-flash', selectedModels: ['deepseek-v4-flash'] } as any,
    providerId: 'deepseek',
    settings: { chat: {}, skills: {}, tools: {} } as any,
    toolSettings: { enableToolCalls: true } as any,
    sessionName: 'Session',
    ...overrides,
  }
}

describe('stream executor agent-loop routing', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('routes text streams through agent-loop when the opt-in predicate matches', async () => {
    mocks.shouldUseAgentLoopStream.mockReturnValue(true)
    const abortController = new AbortController()

    const result = await executeMessageStream(params({
      requestedOutputModalities: ['image'],
    }), abortController)

    expect(result).toEqual({
      handled: true,
      isImageGeneration: false,
      pausedForConfirmation: false,
    })
    expect(mocks.engine.registerController).toHaveBeenCalledWith('s1', abortController)
    expect(mocks.executeAgentLoopStreamGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        assistantMessageId: 'm1',
        providerId: 'deepseek',
        requestedOutputModalities: ['image'],
        steeringQueue: { kind: 'steering-queue' },
        followUpQueue: { kind: 'follow-up-queue' },
      }),
      [{ role: 'user', content: 'hello' }],
      'Session',
    )
    expect(mocks.executeStreamGeneration).not.toHaveBeenCalled()
    expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
  })

  it('keeps the controller registered when agent-loop pauses for confirmation', async () => {
    mocks.shouldUseAgentLoopStream.mockReturnValue(true)
    mocks.executeAgentLoopStreamGeneration.mockResolvedValueOnce({ pausedForConfirmation: true })

    const result = await executeMessageStream(params())

    expect(result.pausedForConfirmation).toBe(true)
    expect(mocks.executeAgentLoopStreamGeneration).toHaveBeenCalled()
    expect(mocks.engine.removeController).not.toHaveBeenCalled()
  })

  it('falls back to the existing tool loop when agent-loop is not selected', async () => {
    mocks.shouldUseAgentLoopStream.mockReturnValue(false)

    const result = await executeMessageStream(params({ providerId: 'openai' }))

    expect(result.pausedForConfirmation).toBe(false)
    expect(mocks.executeStreamGeneration).toHaveBeenCalled()
    expect(mocks.executeAgentLoopStreamGeneration).not.toHaveBeenCalled()
    expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
  })

  it('keeps image generation on the dedicated image path', async () => {
    mocks.modelSupportsImageGeneration.mockResolvedValueOnce(true)
    mocks.shouldUseAgentLoopStream.mockReturnValue(true)

    const result = await executeMessageStream(params({ messageContent: 'draw moon' }))

    expect(result).toEqual({
      handled: true,
      isImageGeneration: true,
      pausedForConfirmation: false,
    })
    expect(mocks.processImageGenerationStream).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'draw moon',
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
    }))
    expect(mocks.executeAgentLoopStreamGeneration).not.toHaveBeenCalled()
    expect(mocks.executeStreamGeneration).not.toHaveBeenCalled()
    expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
  })
})
