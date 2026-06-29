import { describe, expect, it, vi } from 'vitest'
import {
  createProjectDirsTool,
  type RuntimeProjectDirRecord,
} from '../project-dirs.js'

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    metadata: vi.fn(),
    updateResult: vi.fn(),
  } as any
}

function project(path: string, description = ''): RuntimeProjectDirRecord {
  return {
    path,
    description,
    addedAt: Date.parse('2026-01-01T00:00:00.000Z'),
    lastUsedAt: Date.parse('2026-01-02T00:00:00.000Z'),
  }
}

function createStore() {
  const projects = new Map<string, RuntimeProjectDirRecord>([
    ['/repo/app', project('/repo/app', 'Main app')],
  ])
  return {
    list: vi.fn(() => Array.from(projects.values()).map(item => ({
      path: item.path,
      description: item.description,
      lastUsedAt: item.lastUsedAt,
    }))),
    get: vi.fn((path: string) => projects.get(path) ?? null),
    add: vi.fn((input: { path: string; description?: string }) => {
      const next = project(input.path, input.description ?? '')
      projects.set(input.path, next)
      return next
    }),
    update: vi.fn((path: string, patch: { description: string }) => {
      const existing = projects.get(path)
      if (!existing) return null
      const next = { ...existing, description: patch.description }
      projects.set(path, next)
      return next
    }),
    remove: vi.fn((path: string) => projects.delete(path)),
  }
}

describe('runtime project_dirs tool', () => {
  it('lists projects through the injected store', async () => {
    const store = createStore()
    const tool = createProjectDirsTool({ getStore: () => store })
    const ctx = createContext()

    const result = await tool.execute({ action: 'list' }, ctx)

    expect(store.list).toHaveBeenCalled()
    expect(store.get).toHaveBeenCalledWith('/repo/app')
    expect(result.title).toBe('Listed projects')
    expect(result.output).toContain('/repo/app')
    expect(result.output).toContain('Main app')
    expect(result.metadata).toMatchObject({
      action: 'list',
      count: 1,
    })
    expect(ctx.updateResult).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ phase: 'ready', action: 'list' }),
    }))
  })

  it('adds a project and returns rendered record metadata', async () => {
    const store = createStore()
    const tool = createProjectDirsTool({ getStore: () => store })

    const result = await tool.execute({
      action: 'add',
      path: '/repo/runtime',
      description: 'Runtime package',
    }, createContext())

    expect(store.add).toHaveBeenCalledWith({
      path: '/repo/runtime',
      description: 'Runtime package',
    })
    expect(result.title).toBe('Added project /repo/runtime')
    expect(result.output).toContain('path: /repo/runtime')
    expect(result.metadata).toMatchObject({
      action: 'add',
      path: '/repo/runtime',
      count: 2,
    })
  })

  it('reports missing projects on update/remove as not found errors', async () => {
    const store = createStore()
    const tool = createProjectDirsTool({ getStore: () => store })

    await expect(tool.execute({
      action: 'update',
      path: '/missing',
      description: 'Missing',
    }, createContext())).rejects.toThrow('[NOT_FOUND] No project for path "/missing"')

    await expect(tool.execute({
      action: 'remove',
      path: '/missing',
    }, createContext())).rejects.toThrow('[NOT_FOUND] No project for path "/missing"')
  })
})
