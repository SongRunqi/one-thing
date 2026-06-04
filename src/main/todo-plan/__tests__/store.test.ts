import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let root: string

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
  shell: {
    openPath: vi.fn(),
  },
}))

vi.mock('../../stores/settings.js', () => ({
  getSettings: () => ({
    general: {
      todoPlan: {
        directory: root,
      },
    },
  }),
}))

vi.mock('../../stores/paths.js', () => ({
  getStorePath: () => root,
}))

async function pathExists(filePath: string): Promise<boolean> {
  return Boolean(await stat(filePath).catch(() => null))
}

describe('todo-plan store', () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'todo-plan-store-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('does not create workspace AI todo while reading a snapshot', async () => {
    const { readTodoPlanSnapshot } = await import('../store.js')

    const snapshot = await readTodoPlanSnapshot({ workingDirectory: '/repo/project-a' })

    expect(snapshot.workspaceAiTodo).toBeUndefined()
    expect(await pathExists(path.join(root, 'workspaces'))).toBe(false)
    expect(snapshot.userNotes).toHaveLength(1)
  })

  it('rejects empty workspace AI todo creation', async () => {
    const { updateTodoPlanDocument } = await import('../store.js')

    await expect(updateTodoPlanDocument({
      scope: 'workspace-ai-todo',
      workingDirectory: '/repo/project-a',
      content: '# AI Todo\n\n## Now\n\n',
    })).rejects.toThrow('workspace-ai-todo content is empty')

    expect(await pathExists(path.join(root, 'workspaces'))).toBe(false)
  })

  it('creates workspace AI todo only when it is written with content', async () => {
    const { readTodoPlanSnapshot, updateTodoPlanDocument } = await import('../store.js')

    const document = await updateTodoPlanDocument({
      scope: 'workspace-ai-todo',
      workingDirectory: '/repo/project-a',
      content: '# AI Todo\n\n## Now\n- [ ] Real work\n',
    })

    expect(document.scope).toBe('workspace-ai-todo')
    expect(await readFile(document.filePath, 'utf-8')).toContain('Real work')

    const snapshot = await readTodoPlanSnapshot({ workingDirectory: '/repo/project-a' })
    expect(snapshot.workspaceAiTodo?.content).toContain('Real work')
  })
})
