import { computed, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { SkillDefinition } from '@/types'
import type { PaletteItem, PaletteItemType } from '@/types/palette'
import { filterPaletteItems } from '@/services/palette'
import { refreshPluginCommands } from '@/services/commands'
import { useSettingsStore } from '@/stores/settings'
import type { EditorHandle, EditorSelection, EditorTransaction } from '@/editor'
import { applyTriggerReplacement, parseEditorTrigger, type EditorTrigger } from '@/editor'
import { usePromptsStore } from '@/stores/prompts'
import { createPromptToken, createSkillToken } from '@shared/prompt-references'

export type ComposerExtensionType = 'none' | 'palette' | 'files' | 'paths'
export type ComposerExtensionItemKind = PaletteItemType | 'file' | 'path'

export interface ComposerExtensionItem {
  id: string
  kind: ComposerExtensionItemKind
  title: string
  description?: string
  meta?: string
  value?: string
  paletteItem?: PaletteItem
}

export interface ComposerExtensionState {
  type: ComposerExtensionType
  query: string
  trigger: EditorTrigger | null
  items: ComposerExtensionItem[]
  loading: boolean
  error: string | null
  selectedIndex: number
  paletteTypes?: PaletteItemType[]
}

interface NoteRoot {
  path: string
  label: string
}

function emptyExtension(): ComposerExtensionState {
  return {
    type: 'none',
    query: '',
    trigger: null,
    items: [],
    loading: false,
    error: null,
    selectedIndex: 0,
  }
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\/+$/, '')
}

function basename(filePath: string): string {
  return normalizePath(filePath).split('/').filter(Boolean).pop() || filePath
}

function dirname(filePath: string): string {
  const normalized = normalizePath(filePath)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return normalized.startsWith('/') ? '/' : ''
  return `${normalized.startsWith('/') ? '/' : ''}${parts.slice(0, -1).join('/')}`
}

function isPathInsideRoot(filePath: string, root: string): boolean {
  const normalizedRoot = normalizePath(root)
  return filePath === normalizedRoot || filePath.startsWith(`${normalizedRoot}/`)
}

function makeNoteLabel(value: string, name: string): string {
  const dirName = basename(value)
  if (dirName && dirName !== '/') return `notes/${dirName}`
  if (name === 'ai_note_dir') return 'notes/ai'
  if (name === 'work_note_dir') return 'notes/work'
  return 'notes/personal'
}

export function usePickerOrchestration(
  messageInput: Ref<string>,
  workingDirectory: Ref<string>,
  editorRef: Ref<EditorHandle | null>,
  adjustHeight: () => void,
  checkHistoryEdit: (newValue: string) => void,
  sessionId?: Ref<string | undefined>,
) {
  const promptsStore = usePromptsStore()
  const settingsStore = useSettingsStore()
  const availableSkills = ref<SkillDefinition[]>([])
  const activeExtension = ref<ComposerExtensionState>(emptyExtension())
  const activeTrigger = ref<EditorTrigger | null>(null)
  const variableWorkdir = ref('')
  const noteRoots = ref<NoteRoot[]>([])
  let suppressedTriggerValue: string | null = null
  let fileDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let pathDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let fileRequestRun = 0
  let pathRequestRun = 0

  const effectiveSessionId = computed(() => sessionId?.value || '')

  const enabledSkills = computed(() => {
    return availableSkills.value.filter(s => s.enabled)
  })

  async function loadSkills() {
    try {
      const response = await window.electronAPI.getSkills(workingDirectory.value || undefined)
      if (response.success && response.skills) {
        availableSkills.value = response.skills
      }
    } catch (error) {
      console.error('Failed to load skills:', error)
    }
  }

  async function loadPrompts() {
    await promptsStore.loadPrompts()
    refreshPaletteItems()
  }

  async function loadPluginCommands() {
    await refreshPluginCommands()
    refreshPaletteItems()
  }

  watch([workingDirectory, effectiveSessionId], () => {
    loadSkills()
    if (activeExtension.value.type === 'files') {
      scheduleFileFetch(0)
    }
  })

  const anyPickerVisible = computed(() => activeExtension.value.type !== 'none')
  const activeExtensionVisible = anyPickerVisible

  const showCommandPicker = computed(() => activeExtension.value.type === 'palette')
  const commandQuery = computed(() => activeExtension.value.type === 'palette' ? activeExtension.value.query : '')
  const commandPickerTypes = computed(() => activeExtension.value.type === 'palette'
    ? activeExtension.value.paletteTypes
    : undefined)
  const showFilePicker = computed(() => activeExtension.value.type === 'files')
  const fileQuery = computed(() => activeExtension.value.type === 'files' ? activeExtension.value.query : '')
  const showPathPicker = computed(() => activeExtension.value.type === 'paths')
  const pathQuery = computed(() => activeExtension.value.type === 'paths' ? activeExtension.value.query : '')
  const showSkillPicker = computed(() => false)
  const skillTriggerQuery = computed(() => '')

  function clampSelectedIndex(index = activeExtension.value.selectedIndex, items = activeExtension.value.items): number {
    if (items.length === 0) return 0
    return Math.max(0, Math.min(items.length - 1, index))
  }

  function setActiveExtension(next: Partial<ComposerExtensionState> & { type: ComposerExtensionType }) {
    activeExtension.value = {
      ...emptyExtension(),
      ...next,
      selectedIndex: clampSelectedIndex(next.selectedIndex ?? 0, next.items ?? []),
    }
  }

  function patchActiveExtension(patch: Partial<ComposerExtensionState>) {
    const nextItems = patch.items ?? activeExtension.value.items
    activeExtension.value = {
      ...activeExtension.value,
      ...patch,
      selectedIndex: clampSelectedIndex(patch.selectedIndex ?? activeExtension.value.selectedIndex, nextItems),
    }
  }

  function closeAllPickers() {
    suppressedTriggerValue = null
    activeTrigger.value = null
    clearFileTimer()
    clearPathTimer()
    setActiveExtension({ type: 'none' })
  }

  function clearFileTimer() {
    if (fileDebounceTimer) {
      clearTimeout(fileDebounceTimer)
      fileDebounceTimer = null
    }
  }

  function clearPathTimer() {
    if (pathDebounceTimer) {
      clearTimeout(pathDebounceTimer)
      pathDebounceTimer = null
    }
  }

  onScopeDispose(() => {
    clearFileTimer()
    clearPathTimer()
  })

  function getQuickCommandIds(): Set<string> {
    const quickCommands = settingsStore.settings.general?.quickCommands || []
    return new Set(
      quickCommands
        .filter(command => command.enabled)
        .map(command => command.commandId),
    )
  }

  function toPaletteExtensionItem(item: PaletteItem, quickCommandIds: Set<string>): ComposerExtensionItem {
    const isQuick = !!item.command && quickCommandIds.has(item.command.id)
    return {
      id: item.id,
      kind: item.type,
      title: item.title,
      description: item.description,
      meta: isQuick ? 'Quick' : item.usage || item.type,
      paletteItem: item,
    }
  }

  function buildPaletteExtensionItems(query: string, types?: PaletteItemType[]): ComposerExtensionItem[] {
    const items = filterPaletteItems(query, enabledSkills.value, promptsStore.prompts, types)
    const quickCommandIds = getQuickCommandIds()
    const shouldPromoteQuickCommands = !query.trim() && (!types || types.includes('command'))
    const orderedItems = shouldPromoteQuickCommands
      ? [
          ...items.filter(item => item.command && quickCommandIds.has(item.command.id)),
          ...items.filter(item => !item.command || !quickCommandIds.has(item.command.id)),
        ]
      : items

    return orderedItems.map(item => toPaletteExtensionItem(item, quickCommandIds))
  }

  function refreshPaletteItems() {
    if (activeExtension.value.type !== 'palette') return
    const items = buildPaletteExtensionItems(activeExtension.value.query, activeExtension.value.paletteTypes)
    const includesPrompts = !activeExtension.value.paletteTypes || activeExtension.value.paletteTypes.includes('prompt')
    patchActiveExtension({
      items,
      loading: includesPrompts ? promptsStore.isLoading : false,
      error: promptsStore.error,
    })
  }

  async function loadNoteRoots() {
    const sid = effectiveSessionId.value
    if (!sid) {
      variableWorkdir.value = ''
      noteRoots.value = []
      return
    }

    try {
      const result = await window.electronAPI.listVariables(sid)
      if (!result.success || !result.variables) {
        variableWorkdir.value = ''
        noteRoots.value = []
        return
      }

      const noteNames = new Set(['ai_note_dir', 'user_note_dir', 'work_note_dir'])
      const seen = new Set<string>()
      variableWorkdir.value = result.variables.find(variable => variable.name === 'workdir')?.value || ''
      noteRoots.value = result.variables
        .filter(variable => noteNames.has(variable.name) && variable.value)
        .map(variable => ({
          path: normalizePath(variable.value),
          label: makeNoteLabel(variable.value, variable.name),
        }))
        .filter(root => {
          if (seen.has(root.path)) return false
          seen.add(root.path)
          return true
        })
        .sort((a, b) => b.path.length - a.path.length)
    } catch (error) {
      console.error('[ComposerExtension] Failed to load note roots:', error)
      variableWorkdir.value = ''
      noteRoots.value = []
    }
  }

  function getRelativeFileLabel(absolutePath: string): string {
    const workdir = variableWorkdir.value || workingDirectory.value
    if (workdir && absolutePath.startsWith(workdir)) {
      let relativePath = absolutePath.slice(workdir.length)
      if (relativePath.startsWith('/')) relativePath = relativePath.slice(1)
      return relativePath || absolutePath
    }

    const noteRoot = noteRoots.value.find(root => isPathInsideRoot(absolutePath, root.path))
    if (noteRoot) {
      let relativePath = absolutePath.slice(noteRoot.path.length)
      if (relativePath.startsWith('/')) relativePath = relativePath.slice(1)
      return relativePath ? `${noteRoot.label}/${relativePath}` : noteRoot.label
    }

    return absolutePath
  }

  function toFileExtensionItem(filePath: string): ComposerExtensionItem {
    const title = getRelativeFileLabel(filePath)
    const parent = dirname(filePath)
    return {
      id: `file:${filePath}`,
      kind: 'file',
      title,
      description: title === filePath ? parent : filePath,
      meta: 'File',
      value: filePath,
    }
  }

  function toPathExtensionItem(path: string): ComposerExtensionItem {
    return {
      id: `path:${path}`,
      kind: 'path',
      title: basename(path),
      description: path,
      meta: 'Directory',
      value: path,
    }
  }

  function scheduleFileFetch(delay = 150) {
    clearFileTimer()
    if (activeExtension.value.type !== 'files') return
    patchActiveExtension({ loading: true, error: null })
    fileDebounceTimer = setTimeout(() => {
      fetchFiles()
    }, delay)
  }

  function schedulePathFetch(delay = 150) {
    clearPathTimer()
    if (activeExtension.value.type !== 'paths') return
    patchActiveExtension({ loading: true, error: null })
    pathDebounceTimer = setTimeout(() => {
      fetchDirs()
    }, delay)
  }

  async function fetchFiles() {
    const run = ++fileRequestRun
    const query = activeExtension.value.type === 'files' ? activeExtension.value.query : ''
    patchActiveExtension({ loading: true, error: null })

    try {
      await loadNoteRoots()
      const cwd = variableWorkdir.value || workingDirectory.value
      if (!cwd) {
        if (run === fileRequestRun && activeExtension.value.type === 'files') {
          patchActiveExtension({ items: [], loading: false })
        }
        return
      }

      const result = await window.electronAPI.listFiles({
        cwd,
        query,
        limit: 50,
      })

      if (run !== fileRequestRun || activeExtension.value.type !== 'files' || activeExtension.value.query !== query) return
      if (result.success) {
        patchActiveExtension({
          items: (result.files || []).map(toFileExtensionItem),
          loading: false,
          error: null,
        })
      } else {
        patchActiveExtension({
          items: [],
          loading: false,
          error: result.error || 'Failed to list files',
        })
      }
    } catch (error) {
      if (run !== fileRequestRun || activeExtension.value.type !== 'files') return
      patchActiveExtension({
        items: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
      })
    }
  }

  async function fetchDirs() {
    const run = ++pathRequestRun
    const query = activeExtension.value.type === 'paths' ? activeExtension.value.query : ''
    const pathToSearch = query.trim() || '~'
    patchActiveExtension({ loading: true, error: null })

    try {
      const result = await window.electronAPI.listDirs({
        basePath: pathToSearch,
        limit: 50,
      })

      if (run !== pathRequestRun || activeExtension.value.type !== 'paths' || activeExtension.value.query !== query) return
      if (result.success) {
        patchActiveExtension({
          items: (result.dirs || []).map(toPathExtensionItem),
          loading: false,
          error: null,
        })
      } else {
        patchActiveExtension({
          items: [],
          loading: false,
          error: result.error || 'Failed to list directories',
        })
      }
    } catch (error) {
      if (run !== pathRequestRun || activeExtension.value.type !== 'paths') return
      patchActiveExtension({
        items: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to list directories',
      })
    }
  }

  function showPalette(trigger: EditorTrigger, types: PaletteItemType[]) {
    setActiveExtension({
      type: 'palette',
      query: trigger.query,
      trigger,
      paletteTypes: types,
      items: buildPaletteExtensionItems(trigger.query, types),
      loading: types.includes('prompt') ? promptsStore.isLoading : false,
      error: types.includes('prompt') ? promptsStore.error : null,
    })
    loadSkills()
    if (types.includes('prompt')) {
      void loadPrompts()
    }
    if (types.includes('command')) {
      void loadPluginCommands()
    }
  }

  function showFiles(trigger: EditorTrigger) {
    setActiveExtension({
      type: 'files',
      query: trigger.query,
      trigger,
      loading: true,
    })
    scheduleFileFetch()
  }

  function showPaths(trigger: EditorTrigger) {
    setActiveExtension({
      type: 'paths',
      query: trigger.query,
      trigger,
      loading: true,
    })
    schedulePathFetch()
  }

  function refreshTriggerState(value = messageInput.value, cursor?: number) {
    if (suppressedTriggerValue !== null) {
      if (value === suppressedTriggerValue) {
        closeAllPickers()
        return
      }
      suppressedTriggerValue = null
    }

    const trigger = parseEditorTrigger(
      value,
      cursor ?? editorRef.value?.getSelection().from ?? value.length,
    )
    activeTrigger.value = trigger

    if (trigger?.type === 'command') {
      showPalette(trigger, ['command', 'skill', 'prompt'])
      return
    }

    if (trigger?.type === 'path') {
      showPaths(trigger)
      return
    }

    if (trigger?.type === 'file') {
      showFiles(trigger)
      return
    }

    if (trigger?.type === 'prompt') {
      showPalette(trigger, ['prompt'])
      return
    }

    closeAllPickers()
  }

  watch(messageInput, (newValue) => {
    checkHistoryEdit(newValue)
    refreshTriggerState(newValue)
  })

  watch(
    () => [
      promptsStore.prompts.length,
      enabledSkills.value.length,
      promptsStore.isLoading,
    ],
    () => {
      refreshPaletteItems()
    },
  )

  function moveActiveSelection(delta: number): boolean {
    const { items, selectedIndex } = activeExtension.value
    if (activeExtension.value.type === 'none' || items.length === 0) return false
    patchActiveExtension({ selectedIndex: selectedIndex + delta })
    return true
  }

  function highlightActiveSelection(index: number): boolean {
    if (activeExtension.value.type === 'none') return false
    patchActiveExtension({ selectedIndex: index })
    return true
  }

  async function confirmActiveExtension(): Promise<boolean> {
    const state = activeExtension.value
    const item = state.items[state.selectedIndex]
    if (!item) return false

    if (state.type === 'palette' && item.paletteItem) {
      await handleCommandSelect(item.paletteItem)
      return true
    }

    if (state.type === 'files' && item.value) {
      await handleFilePickerSelect(item.value)
      return true
    }

    if (state.type === 'paths' && item.value) {
      await handlePathPickerSelect(item.value)
      return true
    }

    return false
  }

  async function handleSkillSelect(skill: SkillDefinition) {
    replaceActiveTrigger(`${createSkillToken(skill.id)} `, 'command')
    await nextTick()
    adjustHeight()
    editorRef.value?.focus()
  }

  function handleSkillPickerClose() {
    closeAllPickers()
  }

  async function handleCommandSelect(item: PaletteItem) {
    if (item.type === 'skill' && item.skill) {
      await handleSkillSelect(item.skill)
      return
    }

    if (item.type === 'command' && item.command) {
      replaceActiveTrigger(`/${item.command.id} `, 'command')
    }

    if (item.type === 'prompt' && item.prompt) {
      replaceActiveTrigger(
        `${createPromptToken(item.prompt.id)} `,
        activeTrigger.value?.type === 'prompt' ? 'prompt' : 'command',
      )
    }

    await nextTick()
    adjustHeight()
    editorRef.value?.focus()
  }

  function handleCommandPickerClose() {
    closeAllPickers()
  }

  async function handleFilePickerSelect(filePath: string) {
    replaceActiveTrigger(`@${filePath} `, 'file')
    await nextTick()
    adjustHeight()
    editorRef.value?.focus()
  }

  function handleFilePickerClose() {
    closeAllPickers()
  }

  async function handlePathPickerSelect(selectedPath: string) {
    replaceActiveTrigger(`/cd ${selectedPath}`, 'path')
    await nextTick()
    adjustHeight()
    editorRef.value?.focus()
  }

  function handlePathPickerClose() {
    closeAllPickers()
  }

  function setEditorValue(value: string) {
    const editor = editorRef.value
    if (editor) {
      editor.setValue(value)
    } else {
      messageInput.value = value
    }
  }

  function replaceActiveTrigger(replacement: string, type: EditorTrigger['type']) {
    const cursor = editorRef.value?.getSelection().from ?? messageInput.value.length
    const currentTrigger = parseEditorTrigger(messageInput.value, cursor)
    const trigger = currentTrigger?.type === type
      ? currentTrigger
      : activeTrigger.value?.type === type
      ? activeTrigger.value
      : null
    if (trigger?.type === type) {
      suppressedTriggerValue = applyTriggerReplacement(messageInput.value, trigger, replacement)
      editorRef.value?.replaceRange(trigger.from, trigger.to, replacement)
      if (!editorRef.value) {
        messageInput.value = suppressedTriggerValue
      }
      activeTrigger.value = null
      setActiveExtension({ type: 'none' })
      return
    }
    setEditorValue(replacement)
    activeTrigger.value = null
    setActiveExtension({ type: 'none' })
  }

  function handleEditorSelectionChange(selection: EditorSelection) {
    refreshTriggerState(messageInput.value, selection.from)
  }

  function handleEditorTransaction(transaction: EditorTransaction) {
    refreshTriggerState(transaction.value, transaction.selection.from)
  }

  return {
    activeExtension,
    activeExtensionVisible,
    moveActiveSelection,
    highlightActiveSelection,
    confirmActiveExtension,
    enabledSkills,
    loadSkills,
    showSkillPicker,
    skillTriggerQuery,
    handleSkillSelect,
    handleSkillPickerClose,
    showCommandPicker,
    commandQuery,
    commandPickerTypes,
    handleCommandSelect,
    handleCommandPickerClose,
    showFilePicker,
    fileQuery,
    handleFilePickerSelect,
    handleFilePickerClose,
    showPathPicker,
    pathQuery,
    handlePathPickerSelect,
    handlePathPickerClose,
    anyPickerVisible,
    refreshTriggerState,
    handleEditorSelectionChange,
    handleEditorTransaction,
    closeAllPickers,
  }
}
