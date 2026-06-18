// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TodoProgressPanel from '../TodoProgressPanel.vue'
import type { TodoPlanChangedPayload, TodoPlanDocument, TodoPlanSnapshot } from '@/types'

let changedCallback: ((data: TodoPlanChangedPayload) => void) | null = null
const cleanupChanged = vi.fn()

function createDocument(content: string): TodoPlanDocument {
  return {
    id: 'workspace-ai-todo',
    scope: 'workspace-ai-todo',
    title: 'AI Todo',
    role: 'assistant',
    filePath: '/repo/.onething/AI_TODO.md',
    content,
    updatedAt: Date.now(),
    totalTasks: 0,
  }
}

function createSnapshot(document?: TodoPlanDocument): TodoPlanSnapshot {
  return {
    directory: '/todo',
    userNotes: [],
    workspaceAiTodo: document,
  }
}

function installElectronAPI(snapshot: TodoPlanSnapshot) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      getTodoPlan: vi.fn().mockResolvedValue({ success: true, snapshot }),
      onTodoPlanChanged: vi.fn((callback: (data: TodoPlanChangedPayload) => void) => {
        changedCallback = callback
        return cleanupChanged
      }),
    },
  })
}

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('TodoProgressPanel', () => {
  beforeEach(() => {
    changedCallback = null
    cleanupChanged.mockClear()
  })

  it('shows an empty read-only state when no AI todo exists', async () => {
    installElectronAPI(createSnapshot())

    const wrapper = mount(TodoProgressPanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })
    await settle()

    expect(wrapper.find('.todo-progress-empty').text()).toBe('No AI todo yet')
    expect(wrapper.text()).not.toContain('Create')
    expect(wrapper.text()).not.toContain('Delete')
  })

  it('summarizes partial progress and the first unfinished task', async () => {
    installElectronAPI(createSnapshot(createDocument(`# Project plan
## Setup
- [x] Inspect current layout
- [ ] Wire side panel
## Verify
- [ ] Run tests
`)))

    const wrapper = mount(TodoProgressPanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })
    await settle()

    expect(wrapper.find('.todo-progress-count').text()).toBe('1/3')
    expect(wrapper.find('.todo-progress-current-text').text()).toBe('Wire side panel')
    expect(wrapper.text()).toContain('Setup')
    expect(wrapper.text()).toContain('1/2')
    expect(wrapper.findAll('.todo-progress-task.done')).toHaveLength(1)
  })

  it('shows the complete state when every task is done', async () => {
    installElectronAPI(createSnapshot(createDocument(`# Project plan
## Done
- [x] Move nav
- [X] Add progress panel
`)))

    const wrapper = mount(TodoProgressPanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })
    await settle()

    expect(wrapper.find('.todo-progress-count').text()).toBe('2/2')
    expect(wrapper.find('.todo-progress-current').text()).toContain('All tasks complete')
  })

  it('refreshes from onTodoPlanChanged for the active workspace AI todo', async () => {
    installElectronAPI(createSnapshot(createDocument(`# Project plan
## Setup
- [ ] Wire side panel
`)))

    const wrapper = mount(TodoProgressPanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })
    await settle()

    changedCallback?.({
      scope: 'workspace-ai-todo',
      sessionId: 'session-1',
      workingDirectory: '/repo',
      document: createDocument(`# Project plan
## Setup
- [x] Wire side panel
- [ ] Add tests
`),
    })
    await settle()

    expect(wrapper.find('.todo-progress-count').text()).toBe('1/2')
    expect(wrapper.find('.todo-progress-current-text').text()).toBe('Add tests')
  })
})
