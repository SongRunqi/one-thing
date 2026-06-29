import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnethingTodoPlanStore, type TodoPlanChangedPayload } from '../store.js'

let root: string
let changed: TodoPlanChangedPayload[]

function createStore() {
  return new OnethingTodoPlanStore({
    getConfiguredDirectory: () => root,
    getDefaultStorePath: () => root,
    notifyChanged: payload => changed.push(payload),
  })
}

async function pathExists(filePath: string): Promise<boolean> {
  return Boolean(await stat(filePath).catch(() => null))
}

describe('OnethingTodoPlanStore', () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'onething-todo-plan-store-'))
    changed = []
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('does not create workspace AI todo while reading a snapshot', async () => {
    const snapshot = await createStore().readSnapshot({ workingDirectory: '/repo/project-a' })

    expect(snapshot.workspaceAiTodo).toBeUndefined()
    expect(await pathExists(path.join(root, 'workspaces'))).toBe(false)
    expect(snapshot.userNotes).toHaveLength(1)
  })

  it('rejects empty workspace AI todo creation', async () => {
    await expect(createStore().updateDocument({
      scope: 'workspace-ai-todo',
      workingDirectory: '/repo/project-a',
      content: '# AI Todo\n\n## Now\n\n',
    })).rejects.toThrow('workspace-ai-todo content is empty')

    expect(await pathExists(path.join(root, 'workspaces'))).toBe(false)
  })

  it('creates workspace AI todo only when it is written with content', async () => {
    const store = createStore()

    const document = await store.updateDocument({
      scope: 'workspace-ai-todo',
      workingDirectory: '/repo/project-a',
      content: '# AI Todo\n\n## Now\n- [ ] Real work\n',
    })

    expect(document.scope).toBe('workspace-ai-todo')
    expect(await readFile(document.filePath, 'utf-8')).toContain('Real work')
    expect(changed).toEqual([
      expect.objectContaining({
        scope: 'workspace-ai-todo',
        workingDirectory: '/repo/project-a',
      }),
    ])

    const snapshot = await store.readSnapshot({ workingDirectory: '/repo/project-a' })
    expect(snapshot.workspaceAiTodo?.content).toContain('Real work')
  })
})
