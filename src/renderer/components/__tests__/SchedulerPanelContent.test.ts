// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SchedulerPanelContent from '../SchedulerPanelContent.vue'

const agentsStore = vi.hoisted(() => ({
  agents: [
    {
      id: 'default',
      name: 'Default Agent',
      systemPrompt: '',
      isDefault: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  defaultAgent: {
    id: 'default',
    name: 'Default Agent',
    systemPrompt: '',
    isDefault: true,
    createdAt: 1,
    updatedAt: 1,
  },
  loadAgents: vi.fn(),
}))

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => agentsStore,
}))

describe('SchedulerPanelContent', () => {
  beforeEach(() => {
    agentsStore.loadAgents.mockResolvedValue(agentsStore.agents)
    Object.defineProperty(window, 'electronAPI', {
      value: {
        listSchedulerTasks: vi.fn().mockResolvedValue({
          success: true,
          tasks: [
            {
              id: 'plugin:soul-memory:memory-dreaming-promotion',
              name: 'Memory Dreaming Promotion',
              pluginId: 'soul-memory',
              kind: 'plugin',
              source: 'plugin',
              readonly: true,
              enabled: true,
              tags: ['soul-memory'],
              inFlight: false,
              runCount: 1,
              successCount: 1,
              failureCount: 0,
            },
            {
              id: 'user:task-1',
              name: 'Morning news',
              kind: 'agent',
              source: 'user',
              readonly: false,
              agentId: 'default',
              prompt: 'Check the news',
              promptPreview: 'Check the news',
              enabled: true,
              schedule: { kind: 'cron', expr: '0 9 * * *' },
              tags: ['agent'],
              inFlight: false,
              runCount: 1,
              successCount: 1,
              failureCount: 0,
            },
          ],
        }),
        listSchedulerRuns: vi.fn().mockResolvedValue({
          success: true,
          runs: [
            {
              runId: 'run-1',
              taskId: 'user:task-1',
              reason: 'manual',
              scheduledFor: 1,
              startedAt: 1,
              finishedAt: 1001,
              durationMs: 1000,
              ok: true,
              status: 'succeeded',
              resultPreview: 'Done',
              timeline: [{ id: 't1', timestamp: 1, type: 'run:finish', title: 'Done' }],
            },
          ],
        }),
        runSchedulerTaskNow: vi.fn(),
        setSchedulerTaskEnabled: vi.fn(),
        createSchedulerTask: vi.fn(),
        updateSchedulerTask: vi.fn(),
        deleteSchedulerTask: vi.fn(),
        updateSessionArchived: vi.fn(),
        switchSession: vi.fn(),
      },
      configurable: true,
    })
  })

  it('shows tasks first and keeps run history folded until requested', async () => {
    const wrapper = mount(SchedulerPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Memory Dreaming Promotion')
      expect(wrapper.text()).toContain('Morning news')
    })

    expect(window.electronAPI.listSchedulerRuns).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Run detail')

    await wrapper.find('.history-toggle').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Recent runs')
      expect(wrapper.text()).toContain('succeeded')
    })

    await wrapper.find('.run-row').trigger('click')
    expect(wrapper.text()).toContain('Run detail')
  })
})
