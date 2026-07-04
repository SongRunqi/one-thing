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

const settingsStore = vi.hoisted(() => {
  const makeSettings = () => ({
    theme: 'dark',
    general: {
      soulMemory: {
        dreaming: {
          enabled: true,
          frequency: '0 3 * * *',
          timezone: '',
          model: '',
          sources: ['daily'],
          lookbackDays: 30,
          maxSourceFiles: 12,
          maxSessions: 12,
          maxMessagesPerSession: 24,
          maxInputChars: 48000,
          maxPromotions: 10,
          minScore: 0.78,
          minRecallCount: 1,
          minUniqueSources: 1,
          timeoutMs: 60000,
        },
      },
    },
    chat: {},
    ai: {
      provider: 'openai',
      providers: {},
      customProviders: [],
    },
    tools: {
      enableToolCalls: true,
      tools: {},
    },
  })
  const store = {
    settings: makeSettings(),
    makeSettings,
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
  }
  return store
})

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => settingsStore,
}))

describe('SchedulerPanelContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    agentsStore.loadAgents.mockResolvedValue(agentsStore.agents)
    settingsStore.settings = settingsStore.makeSettings()
    settingsStore.loadSettings.mockResolvedValue(undefined)
    settingsStore.saveSettings.mockImplementation(async (nextSettings: any) => {
      settingsStore.settings = nextSettings
    })
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
              tags: ['soul-memory', 'dreaming'],
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
        runSchedulerTaskNow: vi.fn().mockResolvedValue({ success: true }),
        setSchedulerTaskEnabled: vi.fn().mockResolvedValue({ success: true }),
        createSchedulerTask: vi.fn().mockResolvedValue({
          success: true,
          task: {
            id: 'user:new-task',
            name: 'Morning digest',
            kind: 'agent',
            source: 'user',
            readonly: false,
            enabled: true,
            tags: ['agent'],
            inFlight: false,
            runCount: 0,
            successCount: 0,
            failureCount: 0,
          },
        }),
        updateSchedulerTask: vi.fn().mockResolvedValue({
          success: true,
          task: {
            id: 'user:task-1',
            name: 'Morning news updated',
            kind: 'agent',
            source: 'user',
            readonly: false,
            enabled: true,
            tags: ['agent'],
            inFlight: false,
            runCount: 1,
            successCount: 1,
            failureCount: 0,
          },
        }),
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

    expect(wrapper.find('.task-list-title').text()).toBe('All Tasks')
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

  it('loads tasks when a lazily mounted panel becomes active', async () => {
    const wrapper = mount(SchedulerPanelContent, {
      props: { active: false },
    })

    await vi.waitFor(() => {
      expect(settingsStore.loadSettings).toHaveBeenCalled()
    })
    expect(window.electronAPI.listSchedulerTasks).not.toHaveBeenCalled()

    await wrapper.setProps({ active: true })
    await vi.waitFor(() => {
      expect(window.electronAPI.listSchedulerTasks).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Memory Dreaming Promotion')
    })
  })

  it('keeps task creation in a drawer instead of the main page hierarchy', async () => {
    const wrapper = mount(SchedulerPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Morning news')
    })

    expect(wrapper.find('.editor-section').exists()).toBe(false)
    expect(wrapper.find('.task-editor-dialog').exists()).toBe(false)

    await wrapper.findAll('button').find(button => button.text().includes('New Task'))!.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.find('.task-editor-dialog').exists()).toBe(true)
    })
    expect(wrapper.find('.tasks-layout').exists()).toBe(true)
    expect(wrapper.find('.editor-section').exists()).toBe(false)

    await wrapper.find('.task-editor-dialog button[title="Close"]').trigger('click')
    expect(wrapper.find('.task-editor-dialog').exists()).toBe(false)

    await wrapper.findAll('button').find(button => button.text().includes('New Task'))!.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.find('.task-editor-dialog').exists()).toBe(true)
    })

    await wrapper.find('input[aria-label="Task name"]').setValue('Morning digest')
    await wrapper.find('textarea[aria-label="Task prompt"]').setValue('Summarize the day ahead.')
    await wrapper.findAll('.task-editor-dialog .primary-btn').find(button => button.text().includes('Create Task'))!.trigger('click')

    await vi.waitFor(() => {
      expect(window.electronAPI.createSchedulerTask).toHaveBeenCalled()
    })
    expect(window.electronAPI.createSchedulerTask).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'default',
      enabled: true,
      name: 'Morning digest',
      prompt: 'Summarize the day ahead.',
      schedule: expect.objectContaining({
        expr: '0 9 * * *',
        kind: 'cron',
      }),
    }))
  })

  it('edits an existing user task in the same drawer flow', async () => {
    const wrapper = mount(SchedulerPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Morning news')
    })

    await wrapper.find('button[title="Edit"]').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.find('.task-editor-dialog').exists()).toBe(true)
    })
    expect(wrapper.find('.editor-section').exists()).toBe(false)
    expect(wrapper.find('.task-editor-dialog').text()).toContain('Edit task')

    await wrapper.find('input[aria-label="Task name"]').setValue('Morning news updated')
    await wrapper.findAll('.task-editor-dialog .primary-btn').find(button => button.text().includes('Save Changes'))!.trigger('click')

    await vi.waitFor(() => {
      expect(window.electronAPI.updateSchedulerTask).toHaveBeenCalled()
    })
    expect(window.electronAPI.updateSchedulerTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user:task-1',
      name: 'Morning news updated',
      prompt: 'Check the news',
      schedule: expect.objectContaining({
        expr: '0 9 * * *',
        kind: 'cron',
      }),
    }))
  })

  it('uses row switches for enablement without adding the task count to the list heading', async () => {
    const wrapper = mount(SchedulerPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Morning news')
    })

    expect(wrapper.find('.task-list-title').text()).toBe('All Tasks')

    const morningRow = wrapper.findAll('.task-row').find(row => row.text().includes('Morning news'))!
    expect(morningRow.exists()).toBe(true)
    const morningSwitch = morningRow.find('[role="switch"]')
    expect(morningSwitch.exists()).toBe(true)

    await morningSwitch.trigger('click')
    await vi.waitFor(() => {
      expect(window.electronAPI.setSchedulerTaskEnabled).toHaveBeenCalledWith({
        id: 'user:task-1',
        enabled: false,
      })
    })
  })

  it('manages Memory Dreaming task settings and uses scheduler actions', async () => {
    const wrapper = mount(SchedulerPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Memory Dreaming Promotion')
    })

    await wrapper.findAll('.task-row').find(row => row.text().includes('Memory Dreaming Promotion'))!.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Memory Dreaming')
      expect(wrapper.find('input[aria-label="Dreaming cron"]').exists()).toBe(true)
    })

    const detailText = wrapper.find('.task-detail').text()
    const expectedLabels = [
      'Memory Dreaming Promotion',
      'Run Now',
      'Status',
      'Healthy',
      'Runtime',
      'Run history',
      'Configuration',
      'Basic',
      'Limits',
      'Scoring',
    ]
    for (const label of expectedLabels) {
      expect(detailText).toContain(label)
    }
    expect(detailText).not.toContain('All clear')
    expect(wrapper.find('.config-disclosure-head').exists()).toBe(false)
    expect(wrapper.findAll('.config-section-head').map(section => section.text())).toEqual([
      'Basic',
      'Limits',
      'Scoring',
    ])

    await wrapper.find('button[title="Run now"]').trigger('click')
    expect(window.electronAPI.runSchedulerTaskNow).toHaveBeenCalledWith({
      id: 'plugin:soul-memory:memory-dreaming-promotion',
      force: true,
    })

    await wrapper.find('input[aria-label="Dreaming cron"]').setValue('30 2 * * *')
    await wrapper.find('input[aria-label="Dreaming source files"]').setValue('20')
    await wrapper.findAll('.managed-section .primary-btn').find(button => button.text().includes('Save Changes'))!.trigger('click')

    await vi.waitFor(() => {
      expect(settingsStore.saveSettings).toHaveBeenCalled()
    })
    const nextSettings = settingsStore.saveSettings.mock.calls.at(-1)![0]
    expect(nextSettings.general.soulMemory.dreaming.frequency).toBe('30 2 * * *')
    expect(nextSettings.general.soulMemory.dreaming.sources).toEqual(['daily'])
    expect(nextSettings.general.soulMemory.dreaming.maxSourceFiles).toBe(20)
    expect(nextSettings.general.soulMemory.dreaming.enabled).toBe(true)
    expect(window.electronAPI.setSchedulerTaskEnabled).toHaveBeenCalledWith({
      id: 'plugin:soul-memory:memory-dreaming-promotion',
      enabled: true,
    })
    expect(window.electronAPI.listSchedulerTasks).toHaveBeenCalledTimes(3)
  })
})
