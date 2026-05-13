import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type Ref } from 'vue'
import { usePickerOrchestration } from '../usePickerOrchestration'
import type { EditorCursorLineInfo, EditorHandle, EditorSelection } from '@/editor'
import type { PaletteItem } from '@/types/palette'

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
  const editor = ref<EditorHandle | null>(makeEditorHandle(input, cursor))
  const adjustHeight = vi.fn()
  const checkHistoryEdit = vi.fn()

  const api = scope.run(() => usePickerOrchestration(
    input,
    cwd,
    editor,
    adjustHeight,
    checkHistoryEdit,
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
    vi.stubGlobal('window', {
      electronAPI: {
        getSkills: vi.fn().mockResolvedValue({ success: true, skills: [] }),
        executeSkill: vi.fn(),
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

  it('tracks /cd path triggers and replaces the exact path range', async () => {
    const harness = createHarness('/cd ~/wo')
    await settleWatchers()

    expect(harness.api.showPathPicker.value).toBe(true)
    expect(harness.api.pathQuery.value).toBe('~/wo')

    await harness.api.handlePathPickerSelect('/Users/me/My Project')

    expect(harness.input.value).toBe('/cd /Users/me/My Project')
    expect(harness.api.showPathPicker.value).toBe(false)
    harness.scope.stop()
  })

  it('refreshes file triggers on cursor movement before replacing', async () => {
    const value = 'read @first then @second'
    const harness = createHarness(value)
    await settleWatchers()

    expect(harness.api.fileQuery.value).toBe('second')

    const firstTriggerEnd = 'read @first'.length
    harness.cursor.value = firstTriggerEnd
    harness.api.handleEditorSelectionChange({ from: firstTriggerEnd, to: firstTriggerEnd })
    await settleWatchers()

    expect(harness.api.fileQuery.value).toBe('first')

    await harness.api.handleFilePickerSelect('/repo/first.md')

    expect(harness.input.value).toBe('read @/repo/first.md  then @second')
    harness.scope.stop()
  })

  it('updates trigger state from editor transactions and closes stale picker state', async () => {
    const harness = createHarness('open @files src')
    await settleWatchers()

    expect(harness.api.showFilePicker.value).toBe(true)
    expect(harness.api.fileQuery.value).toBe('src')

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
    expect(harness.checkHistoryEdit).toHaveBeenCalledWith('plain text')
    harness.scope.stop()
  })
})
