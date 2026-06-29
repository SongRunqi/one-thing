import { describe, expect, it, vi } from 'vitest'
import {
  resumeOnethingAfterToolConfirmation,
  resumeOnethingAfterToolConfirmationForIpc,
} from '../tool-confirmation.js'

describe('resumeOnethingAfterToolConfirmation', () => {
  it('validates completed tool calls, emits continuation, and schedules resume', async () => {
    const emitEvent = vi.fn()
    const resume = vi.fn()
    let scheduled: (() => Promise<void> | void) | undefined

    await expect(resumeOnethingAfterToolConfirmation({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      getSession: () => ({
        messages: [{
          id: 'assistant-1',
          role: 'assistant',
          toolCalls: [
            { status: 'completed' },
            { status: 'failed' },
          ],
        }],
      }),
      emitEvent,
      resume,
      schedule: task => { scheduled = task },
    })).resolves.toEqual({ success: true })

    expect(emitEvent).toHaveBeenCalledWith('session-1', { type: 'content:continuation' })
    expect(resume).not.toHaveBeenCalled()

    await scheduled?.()
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('rejects resume when confirmation-gated tool calls are still pending', async () => {
    await expect(resumeOnethingAfterToolConfirmation({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      getSession: () => ({
        messages: [{
          id: 'assistant-1',
          role: 'assistant',
          toolCalls: [
            { status: 'completed' },
            { status: 'pending', requiresConfirmation: true },
          ],
        }],
      }),
      emitEvent: vi.fn(),
      resume: vi.fn(),
      schedule: vi.fn(),
    })).resolves.toEqual({
      success: false,
      error: 'Still have pending tool calls awaiting confirmation',
    })
  })

  it('emits stream errors when scheduled resume fails', async () => {
    const emitEvent = vi.fn()
    let scheduled: (() => Promise<void> | void) | undefined

    await resumeOnethingAfterToolConfirmation({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      getSession: () => ({
        messages: [{
          id: 'assistant-1',
          role: 'assistant',
          toolCalls: [{ status: 'completed' }],
        }],
      }),
      emitEvent,
      resume: async () => {
        throw new Error('boom')
      },
      schedule: task => { scheduled = task },
      errorMessage: error => error instanceof Error ? error.message : 'fallback',
      errorDetails: () => 'details',
    })

    await scheduled?.()

    expect(emitEvent).toHaveBeenLastCalledWith('session-1', {
      type: 'stream:error',
      data: {
        error: 'boom',
        errorDetails: 'details',
      },
    })
  })

  it('wraps resume-after-confirm for IPC with logging and default scheduling', async () => {
    const logger = { log: vi.fn(), error: vi.fn() }
    const emitEvent = vi.fn()
    const resume = vi.fn()

    await expect(resumeOnethingAfterToolConfirmationForIpc({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      getSession: () => ({
        messages: [{
          id: 'assistant-1',
          role: 'assistant',
          toolCalls: [{ status: 'completed' }],
        }],
      }),
      emitEvent,
      resume,
      logger,
    })).resolves.toEqual({ success: true })

    expect(logger.log).toHaveBeenCalledWith(
      '[OnethingRuntime] Resuming after tool confirm for session: session-1, message: assistant-1',
    )
    expect(emitEvent).toHaveBeenCalledWith('session-1', { type: 'content:continuation' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(resume).toHaveBeenCalledTimes(1)
  })
})
