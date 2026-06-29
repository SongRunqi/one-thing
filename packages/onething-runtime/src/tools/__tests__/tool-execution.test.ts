import { describe, expect, it, vi } from 'vitest'
import { executeOnethingToolAndUpdate } from '../tool-execution.js'

describe('onething tool execution update orchestration', () => {
  it('owns tool execution update defaults over the core algorithm', async () => {
    const toolCall = {
      id: 'tool-call-1',
      toolName: 'read',
    }
    const allToolCalls = [toolCall]
    const message = {
      id: 'assistant-1',
      steps: [] as Array<Record<string, unknown>>,
    }
    const session = {
      messages: [message],
      workingDirectory: '/workspace',
      workingDirectoryRoots: ['/workspace'],
    }
    const stepUpdates: Array<{ id: string; update: unknown }> = []
    const executionEnds: unknown[] = []
    const directContexts: unknown[] = []
    const store = {
      getSession: vi.fn(() => session),
      updateMessageToolCalls: vi.fn(),
    }
    const emitter = {
      sendSkillActivated: vi.fn(),
      sendStepAdded: vi.fn((step: any) => {
        message.steps.push(step)
      }),
      sendStepUpdated: vi.fn((id: string, update: any) => {
        stepUpdates.push({ id, update })
        const step = message.steps.find(item => item.id === id)
        if (step) Object.assign(step, update)
      }),
      sendToolExecutionStart: vi.fn(),
      sendToolExecutionUpdate: vi.fn(),
      sendToolExecutionEnd: vi.fn((_toolCallId, _stepId, result) => {
        executionEnds.push(result)
      }),
      sendToolCall: vi.fn(),
      sendToolResult: vi.fn(),
    }

    await executeOnethingToolAndUpdate({
      ctx: {
        sessionId: 'session-1',
        assistantMessageId: 'assistant-1',
      },
      toolCall,
      toolCallData: {
        toolName: 'read',
        args: { path: 'a.txt' },
      },
      allToolCalls,
      store,
      emitter,
      executeToolDirectly: async (_toolName, _args, context) => {
        directContexts.push(context)
        context.onMetadata?.({
          title: 'Reading file',
          metadata: { path: 'a.txt' },
        })
        context.onPartialResult?.({
          content: [{ type: 'text', text: 'partial' }],
          details: { phase: 'read' },
        })
        return {
          success: true,
          data: {
            title: 'Read complete',
            content: [{ type: 'text', text: 'done' }],
          },
        }
      },
      createStep: (call, _skillName, turnIndex) => ({
        id: 'step-1',
        title: 'Read',
        status: 'running',
        toolCallId: call.id,
        toolCall: call,
        turnIndex,
      }),
    })

    expect(directContexts[0]).toMatchObject({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      toolCallId: 'tool-call-1',
      workingDirectory: '/workspace',
      workingDirectoryRoots: ['/workspace'],
    })
    expect(toolCall).toMatchObject({
      status: 'completed',
      result: {
        title: 'Read complete',
        content: [{ type: 'text', text: 'done' }],
      },
    })
    expect(stepUpdates.some(({ update }) => {
      return Boolean((update as { title?: unknown }).title === 'Reading file')
    })).toBe(true)
    expect(emitter.sendToolExecutionUpdate).toHaveBeenCalledWith(
      'tool-call-1',
      'step-1',
      expect.objectContaining({
        content: [{ type: 'text', text: 'partial' }],
      }),
    )
    expect(executionEnds.length).toBe(1)
    expect(store.updateMessageToolCalls).toHaveBeenCalledWith(
      'session-1',
      'assistant-1',
      allToolCalls,
    )
    expect(emitter.sendToolResult).toHaveBeenCalledWith(toolCall)
  })
})
