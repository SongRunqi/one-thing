// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatWindow from '../ChatWindow.vue'

const mocks = vi.hoisted(() => {
  const isPathInsideRoot = (filePath: string, root: string) => {
    const cleanPath = filePath.replace(/\/+$/, '')
    const cleanRoot = root.replace(/\/+$/, '')
    return cleanPath === cleanRoot || cleanPath.startsWith(`${cleanRoot}/`)
  }

  return {
    chatPanelSave: vi.fn(),
    chatPanelRestore: vi.fn().mockResolvedValue(true),
    chatPanelScrollToMessage: vi.fn().mockResolvedValue(true),
    editorWorkspace: {
      workspace: {
        activePath: '',
        buffers: new Map<string, { dirty: boolean }>(),
      },
      isPathInsideRoot: vi.fn(isPathInsideRoot),
      getDirtyBuffersForRoot: vi.fn(() => []),
      closeWorkspace: vi.fn(),
      closeFile: vi.fn(),
      saveWorkspace: vi.fn().mockResolvedValue(true),
      saveFile: vi.fn().mockResolvedValue(true),
    },
    sessionsStore: {
      currentSessionId: 'session-1',
      sessions: [
        {
          id: 'session-1',
          name: 'Project chat',
          workingDirectory: '/repo',
        },
      ],
      switchSession: vi.fn(),
    },
    settingsStore: {
      settings: {
        general: {
          maxFilePreviewKB: 256,
        },
      },
    },
  }
})

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => mocks.settingsStore,
}))

vi.mock('@/composables/useEditorWorkspace', () => ({
  useEditorWorkspace: () => mocks.editorWorkspace,
}))

vi.mock('../TabBar.vue', () => ({
  default: {
    name: 'TabBar',
    props: ['tabs', 'activeTabId'],
    emits: ['selectTab', 'closeTab'],
    template: `
      <div class="mock-tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-button"
          :data-type="tab.type"
          :data-active="tab.id === activeTabId"
          @click="$emit('selectTab', tab.id)"
        >
          {{ tab.type }}
        </button>
      </div>
    `,
  },
}))

vi.mock('../ChatPanel.vue', () => ({
  default: {
    name: 'ChatPanel',
    props: ['sessionId'],
    emits: ['splitWithBranch', 'openFile'],
    setup(_props: unknown, { expose }: { expose: (exposed: Record<string, unknown>) => void }) {
      expose({
        focusInput: vi.fn(),
        saveSnapshotForCurrentSession: mocks.chatPanelSave,
        restoreSnapshotForCurrentSession: mocks.chatPanelRestore,
        scrollToMessage: mocks.chatPanelScrollToMessage,
      })
      return {}
    },
    template: `
      <div class="mock-chat-panel">
        <button class="open-file" @click="$emit('openFile', '/repo/src/a.ts')">open file</button>
      </div>
    `,
  },
}))

vi.mock('../FilePanel.vue', () => ({
  default: {
    name: 'FilePanel',
    props: ['filePath', 'workspaceRoot', 'active'],
    template: '<div class="mock-file-panel">{{ filePath }} {{ workspaceRoot }} {{ active }}</div>',
  },
}))

vi.mock('../FileUnsavedDialog.vue', () => ({
  default: {
    name: 'FileUnsavedDialog',
    props: ['visible', 'filePath'],
    template: '<div v-if="visible" class="mock-unsaved-dialog">{{ filePath }}</div>',
  },
}))

vi.mock('../../SettingsPanel.vue', () => ({
  default: {
    name: 'SettingsPanel',
    template: '<div class="mock-settings-panel" />',
  },
}))

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function installElectronAPI(activeTabIndex = 0) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      getAppState: vi.fn().mockResolvedValue({
        openTabs: [
          { type: 'chat', sessionId: 'session-1' },
          {
            type: 'workbench',
            workspaceRoot: '/repo',
            initialFilePath: '/repo/src/a.ts',
            activeFilePath: '/repo/src/a.ts',
            title: 'repo',
          },
        ],
        activeTabIndex,
      }),
      saveUIState: vi.fn().mockResolvedValue({ success: true }),
    },
  })
}

describe('ChatWindow tab switching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.editorWorkspace.workspace.activePath = ''
    mocks.editorWorkspace.workspace.buffers.clear()
    installElectronAPI()
  })

  it('saves chat state before switching to workbench and restores it when switching back', async () => {
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    const buttons = wrapper.findAll('.tab-button')
    expect(buttons.map(button => button.attributes('data-type'))).toEqual(['chat', 'workbench'])

    await buttons[1].trigger('click')
    await settle()

    expect(mocks.chatPanelSave).toHaveBeenCalledTimes(1)
    expect(mocks.chatPanelRestore).not.toHaveBeenCalled()

    await buttons[0].trigger('click')
    await settle()

    expect(mocks.chatPanelRestore).toHaveBeenCalledTimes(1)
  })

  it('saves chat state before opening a workbench from chat', async () => {
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    await wrapper.find('.open-file').trigger('click')
    await settle()

    expect(mocks.chatPanelSave).toHaveBeenCalledTimes(1)
    expect(mocks.chatPanelRestore).not.toHaveBeenCalled()
  })

  it('restores chat state before scrolling to a target message from a non-chat tab', async () => {
    installElectronAPI(1)
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    const result = await (wrapper.vm as unknown as { scrollToMessage: (messageId: string) => Promise<boolean> })
      .scrollToMessage('message-1')
    await settle()

    expect(result).toBe(true)
    expect(mocks.chatPanelRestore.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.chatPanelScrollToMessage.mock.invocationCallOrder[0])
    expect(mocks.chatPanelScrollToMessage).toHaveBeenCalledWith('message-1')
  })
})
