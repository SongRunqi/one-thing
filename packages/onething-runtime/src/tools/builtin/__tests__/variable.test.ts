import { describe, expect, it, vi } from 'vitest'
import {
  VariableParameters,
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

/**
 * P1:没有精确读法,P0 的截断就是纯信息丢失 —— 模型没有任何办法把被截掉的
 * 捞回来(docs/design/agent-self-state-variables.md §3)。
 */
describe('variable tool read actions', () => {
  const SNAPSHOT: RuntimeContextVariable[] = [
    {
      name: 'zulu_notes',
      value: 'l'.repeat(900),
      scope: 'session',
      description: '很长的一段',
    },
    { name: 'alpha', value: '1', type: 'number', scope: 'agent' },
    { name: 'ai_note_dir', value: '~/.onething/memory', scope: 'global', readonly: true },
  ]

  function tool() {
    return createVariableTool({ getRegistry: () => createRegistry(SNAPSHOT) })
  }

  it('gets one variable by name, value untruncated', async () => {
    const result = await tool().execute({ action: 'get', name: 'zulu_notes' }, createContext())
    // 工具输出不进缓存前缀,所以这里可以给完整的 —— prompt 那两个通道才截断。
    expect(result.output).toContain('l'.repeat(900))
    expect(result.output).not.toContain('alpha')
    expect(result.output).not.toContain('…')
  })

  it('answers a miss with something the model can act on, not an exception', async () => {
    const result = await tool().execute({ action: 'get', name: 'nope' }, createContext())
    expect(result.output).toContain('No variable named "nope"')
    expect(result.output).toContain('action="keys"')
  })

  it('lists keys with metadata but never the values', async () => {
    const result = await tool().execute({ action: 'keys' }, createContext())
    const lines = result.output.split('\n')
    // 按名字排序 —— 这份清单的用处是被扫读。
    expect(lines[0]).toBe('ai_note_dir [global] [readonly]')
    expect(lines[1]).toBe('alpha [number] [agent]')
    expect(lines[2]).toBe('zulu_notes [session] - 很长的一段')
    expect(result.output).not.toContain('~/.onething/memory')
    expect(result.output).not.toContain('lll')
  })

  it('filters keys by scope', async () => {
    const result = await tool().execute({ action: 'keys', scope: 'agent' }, createContext())
    expect(result.output).toBe('alpha [number] [agent]')
  })

  it('never raises a capability-approval effect for a read', () => {
    // 能力变量的审批只该拦写:一次 get ai_note_dir 弹出"重指目录"的框是纯噪音。
    for (const action of ['list', 'get', 'keys'] as const) {
      expect(tool().analyze?.({ action, name: 'ai_note_dir' }, {} as never))
        .toEqual({ effects: [] })
    }
    expect(tool().analyze?.({ action: 'set', name: 'ai_note_dir', value: '/tmp/x' }, {} as never))
      .toMatchObject({ effects: [{ kind: 'capability_change' }] })
  })

  it('exposes state as a boolean — the three-way volatility enum is gone', () => {
    expect(VariableParameters.shape.state.unwrap().def.type).toBe('boolean')
    expect(VariableParameters.shape).not.toHaveProperty('volatility')
    expect(VariableParameters.shape.action.options)
      .toEqual(['list', 'get', 'keys', 'set', 'append', 'remove', 'delete'])
  })
})
