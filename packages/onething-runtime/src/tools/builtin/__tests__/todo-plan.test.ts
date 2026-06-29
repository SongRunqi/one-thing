import { describe, expect, it, vi } from 'vitest'
import {
  createTodoPlanTool,
  type RuntimeTodoPlanDocument,
  type RuntimeTodoPlanUpdateRequest,
} from '../todo-plan.js'

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    workingDirectory: '/repo/app',
    metadata: vi.fn(),
    updateResult: vi.fn(),
  } as any
}

function document(overrides: Partial<RuntimeTodoPlanDocument>): RuntimeTodoPlanDocument {
  return {
    id: 'note-1',
    scope: 'user-note',
    title: 'User Todo',
    content: '# User Todo\n\n- [ ] Item',
    totalTasks: 1,
    ...overrides,
  }
}

function createAdapters() {
  return {
    readSnapshot: vi.fn(async () => ({
      directory: '/todos',
      userNotes: [
        document({
          id: 'user-todo',
          title: 'User Todo',
          content: '# User Todo\n\n- [ ] Buy milk',
          totalTasks: 1,
        }),
      ],
      workspaceAiTodo: document({
        id: 'workspace-ai-todo',
        scope: 'workspace-ai-todo',
        title: 'AI Todo',
        content: '# AI Todo\n\n- [x] Inspect code',
        totalTasks: 1,
      }),
    })),
    createUserNote: vi.fn(async (title: string, content?: string) => document({
      id: 'created-note',
      title,
      content: content ?? `# ${title}\n`,
    })),
    updateDocument: vi.fn(async (request: RuntimeTodoPlanUpdateRequest) => document({
      id: request.scope === 'workspace-ai-todo' ? 'workspace-ai-todo' : request.id ?? 'note-1',
      scope: request.scope,
      title: request.scope === 'workspace-ai-todo' ? 'AI Todo' : 'User Todo',
      content: request.content,
    })),
    renameUserNote: vi.fn(async (id: string, title: string) => document({ id, title })),
    deleteUserNote: vi.fn(async () => undefined),
  }
}

describe('runtime todo tool', () => {
  it('lists user notes and workspace AI todo through injected adapters', async () => {
    const adapters = createAdapters()
    const tool = createTodoPlanTool(adapters)
    const ctx = createContext()

    const result = await tool.execute({ action: 'list' }, ctx)

    expect(adapters.readSnapshot).toHaveBeenCalledWith({
      sessionId: 'session-1',
      workingDirectory: '/repo/app',
    })
    expect(result.title).toBe('Todo')
    expect(result.output).toContain('# User Notes')
    expect(result.output).toContain('## User Todo')
    expect(result.output).toContain('# Workspace AI Todo')
    expect(result.metadata).toMatchObject({
      directory: '/todos',
      userNoteCount: 1,
    })
    expect(ctx.metadata).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Listed todo',
    }))
    expect(ctx.updateResult).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ phase: 'running', action: 'list' }),
    }))
  })

  it('updates workspace AI todo with session context', async () => {
    const adapters = createAdapters()
    const tool = createTodoPlanTool(adapters)

    const result = await tool.execute({
      action: 'update',
      scope: 'workspace-ai-todo',
      content: '# AI Todo\n\n- [ ] Continue migration',
    }, createContext())

    expect(adapters.updateDocument).toHaveBeenCalledWith({
      scope: 'workspace-ai-todo',
      id: undefined,
      content: '# AI Todo\n\n- [ ] Continue migration',
      sessionId: 'session-1',
      workingDirectory: '/repo/app',
    })
    expect(result).toMatchObject({
      title: 'Updated AI Todo',
      metadata: {
        id: 'workspace-ai-todo',
        scope: 'workspace-ai-todo',
      },
    })
  })

  it('keeps todo validation guidance in the runtime-owned tool', () => {
    const tool = createTodoPlanTool(createAdapters())
    const parsed = tool.parameters.safeParse({
      scope: 'workspace-ai-todo',
      content: '# AI Todo\n',
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const message = tool.formatValidationError!(parsed.error)
      expect(message).toContain('Usage: todo({')
      expect(message).toContain('action is always required')
      expect(message).toContain('action="update"')
    }
  })
})
