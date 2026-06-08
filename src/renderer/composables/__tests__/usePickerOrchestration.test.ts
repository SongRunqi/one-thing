import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick, ref, type Ref } from 'vue'
import { usePickerOrchestration } from '../usePickerOrchestration'
import type { EditorCursorLineInfo, EditorHandle, EditorSelection } from '@/editor'
import type { PaletteItem } from '@/types/palette'
import { createPromptToken, createSkillToken } from '@shared/prompt-references'

const storeMocks = vi.hoisted(() => ({
  settingsStore: {
    settings: {
      general: {
        quickCommands: [],
      },
    },
  },
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => storeMocks.settingsStore,
}))

function makeEditorHandle(value: Ref<string>, cursor: Ref<number>): EditorHandle {
  function setSelection(from: number, to = from) {
    cursor.value = Math.max(0, Math.min(from, value.value.length))
    void to
  }

  return {
    focus: vi.fn(),
    blur: vi.fn(),
    getValue: () => value.value,
    getSelectedText: () => '',
    setValue: (nextValue) => {
      value.value = nextValue
      cursor.value = nextValue.length
    },
    getSelection: (): EditorSelection => ({ from: cursor.value, to: cursor.value }),
    setSelection,
    replaceRange: (from, to, text) => {
      value.value = `${value.value.slice(0, from)}${text}${value.value.slice(to)}`
      cursor.value = from + text.length
    },
    scrollToTop: vi.fn(),
    getScrollTop: () => 0,
    setScrollTop: vi.fn(),
    getCursorLineInfo: (): EditorCursorLineInfo => ({
      lineNumber: 1,
      totalLines: 1,
      from: 0,
      to: value.value.length,
      text: value.value,
    }),
  }
}

function createHarness(initialValue: string) {
  const scope = effectScope()
  const input = ref(initialValue)
  const cursor = ref(initialValue.length)
  const cwd = ref('/repo')
  const sessionId = ref('session-1')
  const editor = ref<EditorHandle | null>(makeEditorHandle(input, cursor))
  const adjustHeight = vi.fn()
  const checkHistoryEdit = vi.fn()

  const api = scope.run(() => usePickerOrchestration(
    input,
    cwd,
    editor,
    adjustHeight,
    checkHistoryEdit,
    sessionId,
  ))

  if (!api) throw new Error('failed to create picker harness')
  api.refreshTriggerState(input.value, cursor.value)

  return {
    scope,
    input,
    cursor,
    editor,
    adjustHeight,
    checkHistoryEdit,
    api,
  }
}

async function settleWatchers() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('usePickerOrchestration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', {
      electronAPI: {
        getSkills: vi.fn().mockResolvedValue({ success: true, skills: [] }),
        executeSkill: vi.fn(),
        getPluginCommands: vi.fn().mockResolvedValue({ success: true, commands: [] }),
        listVariables: vi.fn().mockResolvedValue({ success: true, variables: [] }),
        listFiles: vi.fn().mockResolvedValue({ success: true, files: ['/repo/src/editor/TextEditor.vue'] }),
        listDirs: vi.fn().mockResolvedValue({ success: true, dirs: ['/Users/me/My Project'] }),
        listPrompts: vi.fn().mockResolvedValue({
          success: true,
          prompts: [{
            id: 'prompt-1',
            title: 'Review Prompt',
            body: 'Review this.',
            createdAt: 1,
            updatedAt: 1,
          }],
        }),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tracks slash command triggers and replaces the active command range', async () => {
    const harness = createHarness('/c')
    await settleWatchers()

    expect(harness.api.showCommandPicker.value).toBe(true)
    expect(harness.api.commandQuery.value).toBe('c')
    expect(harness.api.activeExtension.value).toMatchObject({
      type: 'palette',
      query: 'c',
      paletteTypes: ['command', 'skill', 'prompt'],
    })

    await harness.api.handleCommandSelect({
      id: 'command:compact',
      type: 'command',
      title: '/compact',
      description: 'Compact context',
      command: { id: 'compact' },
    } as PaletteItem)

    expect(harness.input.value).toBe('/compact ')
    expect(harness.editor.value?.focus).toHaveBeenCalled()
    harness.scope.stop()
  })

  it('replaces @prompts triggers with prompt reference tokens', async () => {
    const harness = createHarness('use @prompts review')
    await settleWatchers()

    expect(harness.api.showCommandPicker.value).toBe(true)
    expect(harness.api.commandQuery.value).toBe('review')
    expect(harness.api.commandPickerTypes.value).toEqual(['prompt'])
    expect(harness.api.activeExtension.value).toMatchObject({
      type: 'palette',
      query: 'review',
      paletteTypes: ['prompt'],
    })

    await harness.api.handleCommandSelect({
      id: 'prompt:prompt-1',
      type: 'prompt',
      title: 'Review Prompt',
      description: 'Review this.',
      prompt: {
        id: 'prompt-1',
        title: 'Review Prompt',
        body: 'Review this.',
        createdAt: 1,
        updatedAt: 1,
      },
    } as PaletteItem)

    expect(harness.input.value).toBe(`use ${createPromptToken('prompt-1')} `)
    harness.scope.stop()
  })

  it('completes slash-selected skills into skill reference tokens', async () => {
    vi.mocked(window.electronAPI.getSkills).mockResolvedValue({
      success: true,
      skills: [{
        id: 'user:skill-development',
        name: 'Skill Development',
        description: 'Create or update skills',
        source: 'user',
        path: '/skills/skill-development/SKILL.md',
        directoryPath: '/skills/skill-development',
        enabled: true,
        instructions: 'Build skills carefully.',
      }],
    })
    const harness = createHarness('/sk')

    await harness.api.loadSkills()
    harness.api.refreshTriggerState(harness.input.value, harness.cursor.value)
    await settleWatchers()

    expect(harness.api.activeExtension.value.items[0]).toMatchObject({
      kind: 'skill',
      title: 'Skill Development',
    })

    await harness.api.confirmActiveExtension()

    expect(harness.input.value).toBe(`${createSkillToken('user:skill-development')} `)
    expect(window.electronAPI.executeSkill).not.toHaveBeenCalled()
    harness.scope.stop()
  })

  it('tracks /cd path triggers and replaces the exact path range', async () => {
    const harness = createHarness('/cd ~/wo')
    await settleWatchers()

    expect(harness.api.showPathPicker.value).toBe(true)
    expect(harness.api.pathQuery.value).toBe('~/wo')
    expect(harness.api.activeExtension.value).toMatchObject({
      type: 'paths',
      query: '~/wo',
      selectedIndex: 0,
    })

    await harness.api.handlePathPickerSelect('/Users/me/My Project')

    expect(harness.input.value).toBe('/cd /Users/me/My Project')
    expect(harness.api.showPathPicker.value).toBe(false)
    harness.scope.stop()
  })

  it('refreshes file triggers on cursor movement before replacing', async () => {
    const value = 'read @first then @second'
    const harness = createHarness(value)
    await settleWatchers()

    expect(harness.api.activeExtension.value.type).toBe('files')
    expect(harness.api.fileQuery.value).toBe('second')

    const firstTriggerEnd = 'read @first'.length
    harness.cursor.value = firstTriggerEnd
    harness.api.handleEditorSelectionChange({ from: firstTriggerEnd, to: firstTriggerEnd })
    await settleWatchers()

    expect(harness.api.fileQuery.value).toBe('first')
    expect(harness.api.activeExtension.value).toMatchObject({
      type: 'files',
      query: 'first',
    })

    await harness.api.handleFilePickerSelect('/repo/first.md')

    expect(harness.input.value).toBe('read @/repo/first.md  then @second')
    harness.scope.stop()
  })

  it('updates trigger state from editor transactions and closes stale picker state', async () => {
    const harness = createHarness('open @files src')
    await settleWatchers()

    expect(harness.api.showFilePicker.value).toBe(true)
    expect(harness.api.fileQuery.value).toBe('src')
    expect(harness.api.activeExtension.value).toMatchObject({
      type: 'files',
      query: 'src',
    })

    harness.input.value = 'plain text'
    harness.cursor.value = 'plain text'.length
    harness.api.handleEditorTransaction({
      value: harness.input.value,
      selection: { from: harness.cursor.value, to: harness.cursor.value },
      docChanged: true,
      selectionChanged: true,
    })
    await settleWatchers()

    expect(harness.api.showFilePicker.value).toBe(false)
    expect(harness.api.fileQuery.value).toBe('')
    expect(harness.api.activeExtension.value.type).toBe('none')
    expect(harness.checkHistoryEdit).toHaveBeenCalledWith('plain text')
    harness.scope.stop()
  })

  it('supports absolute and paged command palette navigation', async () => {
    vi.mocked(window.electronAPI.getSkills).mockResolvedValue({
      success: true,
      skills: Array.from({ length: 6 }, (_, index) => ({
        id: `user:skill-${index}`,
        name: `Skill ${index}`,
        description: `Skill description ${index}`,
        source: 'user',
        path: `/skills/skill-${index}/SKILL.md`,
        directoryPath: `/skills/skill-${index}`,
        enabled: true,
        instructions: `Use skill ${index}.`,
      })),
    })

    const harness = createHarness('/')
    await harness.api.loadSkills()
    harness.api.refreshTriggerState(harness.input.value, harness.cursor.value)
    await settleWatchers()

    const itemCount = harness.api.activeExtension.value.items.length
    expect(harness.api.showCommandPicker.value).toBe(true)
    expect(itemCount).toBeGreaterThan(5)

    expect(harness.api.setActiveSelection(itemCount - 1)).toBe(true)
    expect(harness.api.activeExtension.value.selectedIndex).toBe(itemCount - 1)

    harness.api.pageActiveSelection(-1, 5)
    expect(harness.api.activeExtension.value.selectedIndex).toBe(itemCount - 6)

    harness.api.pageActiveSelection(1, itemCount)
    expect(harness.api.activeExtension.value.selectedIndex).toBe(itemCount - 1)

    harness.api.setActiveSelection(-100)
    expect(harness.api.activeExtension.value.selectedIndex).toBe(0)

    harness.scope.stop()
  })
})
