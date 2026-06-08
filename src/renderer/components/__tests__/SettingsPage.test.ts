// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from '../SettingsPage.vue'

const mocks = vi.hoisted(() => ({
  settingsStore: null as any,
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => mocks.settingsStore,
}))

function appSettings() {
  return {
    theme: 'dark',
    general: {
      shortcuts: {},
      editor: {},
      dailyNotes: { enabled: true },
      todoPlan: { enabled: true },
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
    network: {
      proxy: {
        enabled: false,
        url: '',
        bypassRules: '',
      },
    },
    mcp: { enabled: true, servers: [] },
    skills: { enableSkills: true, skills: {} },
  }
}

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountSettingsPage() {
  return mount(SettingsPage, {
    global: {
      stubs: {
        GeneralSettingsTab: { template: '<div class="stub-general">general tab</div>' },
        EditorSettingsTab: { template: '<div class="stub-editor">editor tab</div>' },
        AIProviderTab: { template: '<div class="stub-providers">providers tab</div>' },
        ToolsSettingsTab: { template: '<div class="stub-tools">tools tab</div>' },
        NetworkSettingsTab: { template: '<div class="stub-network">network tab</div>' },
        ShortcutsSettingsTab: { template: '<div class="stub-shortcuts">shortcuts tab</div>' },
        MCPSettingsPanel: { template: '<div class="stub-mcp">mcp tab</div>' },
        SkillsSettingsPanel: { template: '<div class="stub-skills">skills tab</div>' },
        PromptsSettingsPanel: { template: '<div class="stub-prompts">prompts tab</div>' },
        PluginsSettingsTab: { template: '<div class="stub-plugins">plugins tab</div>' },
        MemorySettingsTab: { template: '<div class="stub-memory">memory tab</div>' },
        CustomProviderDialog: { template: '<div />' },
        UnsavedChangesDialog: { template: '<div />' },
      },
    },
  })
}

describe('SettingsPage shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settingsStore = reactive({
      settings: appSettings(),
      availableProviders: [],
      loadSettings: vi.fn().mockResolvedValue(undefined),
      loadProviders: vi.fn().mockResolvedValue(undefined),
      saveSettings: vi.fn().mockResolvedValue(undefined),
    })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getTools: vi.fn().mockResolvedValue({ success: true, tools: [] }),
      },
    })
    window.close = vi.fn()
  })

  it('renders the compact settings shell and switches tabs', async () => {
    const wrapper = mountSettingsPage()
    await settle()

    expect(wrapper.find('.titlebar-title').text()).toBe('Settings')
    expect(wrapper.find('.content-header h1').text()).toBe('General')

    await wrapper.findAll('.sidebar-item').find(item => item.text().includes('Prompts'))!.trigger('click')
    await settle()

    expect(wrapper.find('.content-header h1').text()).toBe('Prompts')
    expect(wrapper.find('.stub-prompts').exists()).toBe(true)

    await wrapper.findAll('.sidebar-item').find(item => item.text().includes('Memory'))!.trigger('click')
    await settle()

    expect(wrapper.find('.content-header h1').text()).toBe('Memory')
    expect(wrapper.find('.stub-memory').exists()).toBe(true)
  })

  it('filters navigation from the sidebar search', async () => {
    const wrapper = mountSettingsPage()
    await settle()

    await wrapper.find('.settings-search input').setValue('prompt')
    await settle()

    const labels = wrapper.findAll('.sidebar-label').map(label => label.text())
    expect(labels).toEqual(['Prompts'])
  })

  it('expands and collapses sidebar sections independently', async () => {
    const wrapper = mountSettingsPage()
    await settle()

    const subnavText = () => wrapper.findAll('.sidebar-subnav').map(nav => nav.text()).join(' ')
    const entryByLabel = (label: string) =>
      wrapper.findAll('.sidebar-entry').find(entry => entry.find('.sidebar-label').text() === label)!

    expect(subnavText()).not.toContain('Theme')
    expect(subnavText()).not.toContain('Text Editor')

    await entryByLabel('General').find('.sidebar-disclosure-button').trigger('click')
    await settle()

    expect(subnavText()).toContain('Theme')
    expect(subnavText()).not.toContain('Text Editor')

    await entryByLabel('Editor').find('.sidebar-disclosure-button').trigger('click')
    await settle()

    expect(wrapper.find('.content-header h1').text()).toBe('General')
    expect(subnavText()).toContain('Theme')
    expect(subnavText()).toContain('Text Editor')

    await entryByLabel('General').find('.sidebar-disclosure-button').trigger('click')
    await settle()

    expect(subnavText()).not.toContain('Theme')
    expect(subnavText()).toContain('Text Editor')
  })
})
