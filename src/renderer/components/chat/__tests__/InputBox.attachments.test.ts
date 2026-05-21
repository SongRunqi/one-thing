// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InputBox from '../InputBox.vue'

const mocks = vi.hoisted(() => ({
  settingsStore: null as any,
  sessionsStore: null as any,
  chatStore: null as any,
  promptsStore: null as any,
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => mocks.settingsStore,
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))

vi.mock('@/stores/chat', () => ({
  useChatStore: () => mocks.chatStore,
}))

vi.mock('@/stores/prompts', () => ({
  usePromptsStore: () => mocks.promptsStore,
}))

vi.mock('@/services/commands', () => ({
  findCommand: vi.fn(() => null),
  getCommands: vi.fn(() => [{
    id: 'compact',
    name: 'Compact Context',
    description: 'Compact context',
    usage: '/compact',
    execute: vi.fn(),
  }]),
  refreshPluginCommands: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/editor/TextEditor.vue', () => ({
  default: {
    name: 'TextEditor',
    props: ['modelValue'],
    emits: [
      'update:modelValue',
      'paste',
      'keydown',
      'focus',
      'blur',
      'heightChange',
      'selectionChange',
      'transaction',
      'compositionstart',
      'compositionend',
    ],
    template: '<textarea class="composer-input" :value="modelValue" @input="onInput" @paste="$emit(\'paste\', $event)" @keydown="$emit(\'keydown\', $event)" />',
    methods: {
      onInput(this: any, event: Event) {
        this.$emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
      },
      focus() {},
      scrollToTop() {},
      getSelection(this: any) {
        const length = String(this.modelValue ?? '').length
        return { from: length, to: length }
      },
      replaceRange() {},
      setValue(this: any, value: string) {
        this.$emit('update:modelValue', value)
      },
    },
  },
}))

function makePasteEvent(files: File[]): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      items: files.map(file => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
    },
  })
  return event
}

async function settle() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 25; i += 1) {
    await settle()
    if (predicate()) return
  }
  throw new Error('Timed out waiting for condition')
}

function dispatchKeydown(element: Element, key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  element.dispatchEvent(event)
  return event
}

function mountInputBox(props: Record<string, unknown> = {}) {
  return mount(InputBox, {
    attachTo: document.body,
    props: {
      sessionId: 'session-1',
      ...props,
    },
    global: {
      stubs: {
        QuotedContext: { template: '<div />' },
        CommandPicker: { template: '<div />' },
        SkillPicker: { template: '<div />' },
        FilePicker: { template: '<div />' },
        PathPicker: { template: '<div />' },
        ModelSelector: { template: '<div />' },
        ThinkToggle: { template: '<div />' },
        Transition: false,
        TransitionGroup: false,
      },
    },
  })
}

async function setComposerValue(wrapper: VueWrapper, value: string) {
  await wrapper.find('textarea').setValue(value)
  wrapper.findComponent({ name: 'TextEditor' }).vm.$emit('transaction', {
    value,
    selection: { from: value.length, to: value.length },
    docChanged: true,
    selectionChanged: true,
  })
  await settle()
}

describe('InputBox paste attachments', () => {
  beforeEach(() => {
    mocks.settingsStore = reactive({
      settings: {
        general: {
          editor: { composerMaxHeight: 200 },
          shortcuts: { sendMessage: { key: 'Enter' } },
          sendShortcut: 'enter',
        },
        ai: {
          provider: 'openai',
          providers: {
            openai: { model: 'gpt-vision' },
          },
        },
      },
      getCachedModels: vi.fn(() => [{
        id: 'gpt-vision',
        architecture: { input_modalities: ['text', 'image'] },
      }]),
    })
    mocks.sessionsStore = reactive({
      currentSessionId: 'session-1',
      sessionVariables: new Map(),
      sessions: [{ id: 'session-1', workingDirectory: '/repo' }],
    })
    mocks.chatStore = reactive({
      isSessionGenerating: vi.fn(() => false),
    })
    mocks.promptsStore = reactive({
      prompts: [],
      loadPrompts: vi.fn().mockResolvedValue([]),
    })

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('Image', class {
      width = 320
      height = 180
      onload: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    })
    vi.stubGlobal('window', Object.assign(window, {
      electronAPI: {
        getSkills: vi.fn().mockResolvedValue({ success: true, skills: [] }),
        listVariables: vi.fn().mockResolvedValue({ success: true, variables: [] }),
        listFiles: vi.fn().mockResolvedValue({ success: true, files: ['/repo/src/main.ts'] }),
        listDirs: vi.fn().mockResolvedValue({ success: true, dirs: ['/repo/src'] }),
      },
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('shows an attachment tray after pasting a file', async () => {
    const wrapper = mountInputBox()
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    wrapper.find('textarea').element.dispatchEvent(makePasteEvent([file]))
    await waitFor(() => wrapper.text().includes('notes.txt'))

    expect(wrapper.find('.attachment-tray').exists()).toBe(true)
    expect(wrapper.text()).toContain('notes.txt')
    expect(wrapper.find('.send-btn').attributes('disabled')).toBeUndefined()
  })

  it('allows sending an attachment-only message', async () => {
    const wrapper = mountInputBox()
    const file = new File(['pdf'], 'brief.pdf', { type: 'application/pdf' })

    wrapper.find('textarea').element.dispatchEvent(makePasteEvent([file]))
    await waitFor(() => wrapper.text().includes('brief.pdf'))
    await wrapper.find('.send-btn').trigger('click')
    await settle()

    const emitted = wrapper.emitted('sendMessage')?.[0]
    expect(emitted?.[0]).toBe('')
    expect(emitted?.[1]).toBe('send')
    expect(emitted?.[2]).toMatchObject([{
      fileName: 'brief.pdf',
      mimeType: 'application/pdf',
      mediaType: 'document',
    }])
    expect(wrapper.find('.attachment-tray').exists()).toBe(false)
  })

  it('removes a pasted attachment from the tray', async () => {
    const wrapper = mountInputBox()
    const file = new File(['hello'], 'remove-me.txt', { type: 'text/plain' })

    wrapper.find('textarea').element.dispatchEvent(makePasteEvent([file]))
    await waitFor(() => wrapper.text().includes('remove-me.txt'))
    await wrapper.find('.attachment-remove').trigger('click')
    await settle()

    expect(wrapper.find('.attachment-tray').exists()).toBe(false)
    expect(wrapper.find('.send-btn').attributes('disabled')).toBeDefined()
  })

  it('queues attachment messages during generation and flushes them afterwards', async () => {
    const wrapper = mountInputBox({ isLoading: true })
    const file = new File(['hello'], 'queued.txt', { type: 'text/plain' })

    wrapper.find('textarea').element.dispatchEvent(makePasteEvent([file]))
    await waitFor(() => wrapper.text().includes('queued.txt'))
    await wrapper.find('.send-btn').trigger('click')
    await settle()

    expect(wrapper.emitted('sendMessage')).toBeUndefined()
    expect(wrapper.text()).toContain('1 file attached')

    await wrapper.setProps({ isLoading: false })
    await settle()

    const emitted = wrapper.emitted('sendMessage')?.[0]
    expect(emitted?.[0]).toBe('')
    expect(emitted?.[1]).toBe('send')
    expect(emitted?.[2]).toMatchObject([{ fileName: 'queued.txt' }])
  })

  it('keeps Enter inside the active palette instead of sending the draft', async () => {
    const wrapper = mountInputBox()

    await setComposerValue(wrapper, '/c')
    dispatchKeydown(wrapper.find('textarea').element, 'Enter')
    await settle()

    expect(wrapper.emitted('sendMessage')).toBeUndefined()
  })

  it('keeps Enter inside the active file picker instead of sending the draft', async () => {
    const wrapper = mountInputBox()

    await setComposerValue(wrapper, '@')
    dispatchKeydown(wrapper.find('textarea').element, 'Enter')
    await settle()

    expect(wrapper.emitted('sendMessage')).toBeUndefined()
  })

  it('lets /cd Enter flow through as the path confirmation action', async () => {
    const wrapper = mountInputBox()

    await setComposerValue(wrapper, '/cd /repo')
    dispatchKeydown(wrapper.find('textarea').element, 'Enter')
    await settle()

    expect(wrapper.emitted('sendMessage')?.[0]?.[0]).toBe('/cd /repo')
  })
})
