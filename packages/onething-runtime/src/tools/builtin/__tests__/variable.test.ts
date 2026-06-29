import { describe, expect, it, vi } from 'vitest'
import {
  createVariableTool,
  type RuntimeContextVariable,
  type RuntimeVariableContext,
  type RuntimeVariableSetInput,
} from '../variable.js'

class FakeVariableError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'VariableError'
  }
}

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    toolCallId: 'tool-1',
    metadata: vi.fn(),
    updateResult: vi.fn(),
  } as any
}

function createRegistry(initial: RuntimeContextVariable[] = []) {
  const variables = [...initial]
  return {
    list: vi.fn(async (_ctx: RuntimeVariableContext) => variables),
    set: vi.fn(async (_ctx: RuntimeVariableContext, input: RuntimeVariableSetInput) => {
      const next = {
        name: input.name,
        value: input.value,
        scope: input.scope ?? 'session',
        description: input.description,
      } satisfies RuntimeContextVariable
      variables.splice(0, variables.length, next)
      return next
    }),
    append: vi.fn(async (_ctx: RuntimeVariableContext, input: RuntimeVariableSetInput) => {
      const next = {
        name: input.name,
        value: input.value,
        values: [input.value],
        scope: input.scope ?? 'session',
      } satisfies RuntimeContextVariable
      variables.splice(0, variables.length, next)
      return next
    }),
    remove: vi.fn(async (_ctx: RuntimeVariableContext, input: RuntimeVariableSetInput) => {
      variables.splice(0, variables.length, {
        name: input.name,
        value: '',
        values: [],
        scope: input.scope ?? 'session',
      })
      return variables[0]
    }),
    delete: vi.fn(async (_ctx: RuntimeVariableContext, name: string) => {
      const index = variables.findIndex(variable => variable.name === name)
      if (index >= 0) variables.splice(index, 1)
    }),
  }
}

describe('runtime variable tool', () => {
  it('sets variables through the injected registry and renders the snapshot', async () => {
    const registry = createRegistry()
    const tool = createVariableTool({
      getRegistry: () => registry,
      isVariableError: error => error instanceof FakeVariableError,
    })
    const ctx = createContext()

    const result = await tool.execute({
      action: 'set',
      name: 'project_hint',
      value: 'runtime-owned',
      scope: 'session',
      description: 'used by tests',
    }, ctx)

    expect(registry.set).toHaveBeenCalledWith({
      sessionId: 'session-1',
      messageId: 'message-1',
      toolCallId: 'tool-1',
    }, {
      name: 'project_hint',
      value: 'runtime-owned',
      scope: 'session',
      description: 'used by tests',
    })
    expect(result.title).toBe('Variable set')
    expect(result.output).toContain('project_hint = runtime-owned')
    expect(result.metadata.variables[0]).toMatchObject({
      name: 'project_hint',
      value: 'runtime-owned',
      scope: 'session',
      description: 'used by tests',
    })
    expect(ctx.metadata).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Set project_hint',
    }))
    expect(ctx.updateResult).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ phase: 'ready', action: 'set' }),
    }))
  })

  it('formats injected variable errors like the main registry error path', async () => {
    const registry = createRegistry()
    registry.set.mockRejectedValueOnce(new FakeVariableError('READONLY', 'Variable is read-only'))
    const tool = createVariableTool({
      getRegistry: () => registry,
      isVariableError: error => error instanceof FakeVariableError,
    })

    await expect(tool.execute({
      action: 'set',
      name: 'workdir',
      value: '/tmp',
    }, createContext())).rejects.toThrow('[READONLY] Variable is read-only')
  })
})
