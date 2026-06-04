import { describe, expect, it, vi } from 'vitest'
import { ReadTool } from '../read'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp'), getName: vi.fn(() => 'onething'), isReady: vi.fn(() => true) },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock('../../todo-plan/store.js', () => ({
  createUserTodoNote: vi.fn(),
  deleteUserTodoNote: vi.fn(),
  readTodoPlanSnapshot: vi.fn(),
  renameUserTodoNote: vi.fn(),
  updateTodoPlanDocument: vi.fn(),
}))

describe('tool validation guidance', () => {
  it('read validation tells the model to use required path', () => {
    const parsed = ReadTool.parameters.safeParse({})
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const message = ReadTool.formatValidationError!(parsed.error)
      expect(message).toContain('Usage: read({ path: string')
      expect(message).toContain('The path field is required')
    }
  })

  it('todo_plan validation tells the model action is required', async () => {
    const { TodoPlanTool } = await import('../todo-plan')
    const parsed = TodoPlanTool.parameters.safeParse({
      scope: 'workspace-ai-todo',
      content: '# AI Todo\n',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const message = TodoPlanTool.formatValidationError!(parsed.error)
      expect(message).toContain('action is always required')
      expect(message).toContain('action="update"')
    }
  })
})
