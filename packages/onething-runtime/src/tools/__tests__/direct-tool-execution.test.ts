import { describe, expect, it, vi } from 'vitest'
import { executeOnethingDirectTool } from '../direct-tool-execution.js'

describe('onething direct tool execution', () => {
  it('owns direct built-in tool context assembly and permission handoff', async () => {
    const metadataUpdates: unknown[] = []
    const enforcePermission = vi.fn(async () => undefined)
    const analyzeTool = vi.fn(async (
      _toolName: string,
      _args: Record<string, unknown>,
      context: unknown,
    ) => {
      const runtimeContext = context as {
        sessionId: string
        messageId: string
        toolCallId?: string
        workingDirectory?: string
      }
      expect(runtimeContext).toMatchObject({
        sessionId: 'session-1',
        messageId: 'message-1',
        toolCallId: 'tool-call-1',
        workingDirectory: '/workspace',
      })
      return {
        success: true,
        effects: [{ type: 'write' }],
        preview: {
          title: 'Write file',
          path: '/workspace/a.txt',
        },
      }
    })
    const executeTool = vi.fn(async (
      _toolName: string,
      _args: Record<string, unknown>,
      context: unknown,
    ) => {
      const runtimeContext = context as {
        approvedAnalysis?: unknown
      }
      expect(runtimeContext.approvedAnalysis).toEqual({
        effects: [{ type: 'write' }],
        preview: {
          title: 'Write file',
          path: '/workspace/a.txt',
        },
      })
      return { success: true, data: 'ok' }
    })

    await expect(executeOnethingDirectTool({
      toolName: 'write',
      args: { path: 'a.txt' },
      context: {
        sessionId: 'session-1',
        messageId: 'message-1',
        toolCallId: 'tool-call-1',
        workingDirectory: '/workspace',
        onMetadata: update => metadataUpdates.push(update),
      },
      isMCPTool: () => false,
      executeMCPTool: vi.fn(),
      analyzeTool,
      executeTool,
      enforcePermission,
      formatFailure: failure => failure.error ?? 'failed',
    })).resolves.toEqual({ success: true, data: 'ok' })

    expect(metadataUpdates).toEqual([{
      title: 'Write file',
      metadata: { path: '/workspace/a.txt' },
    }])
    expect(enforcePermission).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      messageId: 'message-1',
      toolCallId: 'tool-call-1',
      toolName: 'write',
      workspaceRoot: '/workspace',
    }))
  })

  it('owns direct MCP tool permission and partial-result wiring', async () => {
    const partialResults: unknown[] = []
    const executeMCPTool = vi.fn(async (
      _toolName: string,
      _args: Record<string, unknown>,
      _options: unknown,
    ) => ({ ok: true }))
    const enforcePermission = vi.fn(async () => undefined)

    const result = await executeOnethingDirectTool({
      toolName: 'mcp__server__tool',
      args: { command: 'echo hello' },
      context: {
        sessionId: 'session-1',
        messageId: 'message-1',
        workingDirectory: '/workspace',
        onPartialResult: update => partialResults.push(update),
      },
      isMCPTool: () => true,
      executeMCPTool: async (toolName, args, options) => {
        options.onPartialResult?.('hello', 'stdout')
        return executeMCPTool(toolName, args, options)
      },
      analyzeTool: vi.fn(),
      executeTool: vi.fn(),
      enforcePermission,
      formatFailure: failure => failure.error ?? 'failed',
    })

    expect(result).toEqual({ success: true, data: { ok: true } })
    expect(partialResults).toEqual([{
      content: [{ type: 'text', text: 'hello' }],
      details: {
        functionName: undefined,
        phase: 'stdout',
        toolName: 'mcp__server__tool',
      },
    }])
  })
})
