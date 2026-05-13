import { ref, computed, watch, type Ref } from 'vue'
import { nextTick } from 'vue'
import type { SkillDefinition } from '@/types'
import type { PaletteItem } from '@/types/palette'
import { filterPaletteItems } from '@/services/palette'
import type { EditorHandle, EditorSelection, EditorTransaction } from '@/editor'
import { applyTriggerReplacement, parseEditorTrigger, type EditorTrigger } from '@/editor'

export function usePickerOrchestration(
  messageInput: Ref<string>,
  workingDirectory: Ref<string>,
  editorRef: Ref<EditorHandle | null>,
  adjustHeight: () => void,
  checkHistoryEdit: (newValue: string) => void,
) {
  // Skills state
  const availableSkills = ref<SkillDefinition[]>([])
  const showSkillPicker = ref(false)
  const skillTriggerQuery = ref('')

  // Commands state
  const showCommandPicker = ref(false)
  const commandQuery = ref('')

  // File picker state
  const showFilePicker = ref(false)
  const fileQuery = ref('')

  // Path picker state
  const showPathPicker = ref(false)
  const pathQuery = ref('')
  const activeTrigger = ref<EditorTrigger | null>(null)
  let suppressedTriggerValue: string | null = null

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

  watch(workingDirectory, () => {
    loadSkills()
  })

  /** Returns true if any picker (except PathPicker) is visible */
  const anyPickerVisible = computed(() =>
    showCommandPicker.value || showSkillPicker.value || showFilePicker.value
  )

  function clearPickerState() {
    showCommandPicker.value = false
    commandQuery.value = ''
    showSkillPicker.value = false
    skillTriggerQuery.value = ''
    showFilePicker.value = false
    fileQuery.value = ''
    showPathPicker.value = false
    pathQuery.value = ''
    activeTrigger.value = null
  }

  function refreshTriggerState(value = messageInput.value, cursor?: number) {
    if (suppressedTriggerValue !== null) {
      if (value === suppressedTriggerValue) {
        clearPickerState()
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
      loadSkills()
      const query = trigger.query
      const items = filterPaletteItems(query, enabledSkills.value)
      if (items.length > 0) {
        commandQuery.value = query
        showCommandPicker.value = true
        showSkillPicker.value = false
        showFilePicker.value = false
        showPathPicker.value = false
        skillTriggerQuery.value = ''
        fileQuery.value = ''
        pathQuery.value = ''
        return
      }
    }

    // Close command picker if not matching command pattern
    showCommandPicker.value = false
    commandQuery.value = ''

    if (trigger?.type === 'path') {
      pathQuery.value = trigger.query
      showPathPicker.value = true
      showFilePicker.value = false
      showSkillPicker.value = false
      skillTriggerQuery.value = ''
      fileQuery.value = ''
      return
    }

    // Close path picker if not matching /cd pattern
    showPathPicker.value = false
    pathQuery.value = ''

    if (trigger?.type === 'file') {
      fileQuery.value = trigger.query
      showFilePicker.value = true
      showSkillPicker.value = false
      skillTriggerQuery.value = ''
      return
    }

    // Close file picker if not matching file pattern
    showFilePicker.value = false
    fileQuery.value = ''

    showSkillPicker.value = false
    skillTriggerQuery.value = ''
    activeTrigger.value = null
  }

  // Watch messageInput to auto-detect picker triggers.
  watch(messageInput, (newValue) => {
    checkHistoryEdit(newValue)
    refreshTriggerState(newValue)
  })

  // --- Picker event handlers ---

  async function handleSkillSelect(skill: SkillDefinition) {
    showSkillPicker.value = false

    try {
      const inputContent = messageInput.value.replace(/^[/@]\w*\s*/, '')
      const result = await window.electronAPI.executeSkill(skill.id, {
        sessionId: '',
        input: inputContent,
      })

      if (result.success && result.result?.output) {
        setEditorValue(result.result.output)
        await nextTick()
        adjustHeight()
        editorRef.value?.focus()
      }
    } catch (error) {
      console.error('Failed to execute skill:', error)
    }
  }

  function handleSkillPickerClose() {
    showSkillPicker.value = false
  }

  async function handleCommandSelect(item: PaletteItem) {
    showCommandPicker.value = false

    if (item.type === 'skill' && item.skill) {
      await handleSkillSelect(item.skill)
      return
    }

    if (item.type === 'command' && item.command) {
      const replacement = `/${item.command.id} `
      replaceActiveTrigger(replacement, 'command')
    }

    await nextTick()
    adjustHeight()
    editorRef.value?.focus()
  }

  function handleCommandPickerClose() {
    showCommandPicker.value = false
    commandQuery.value = ''
  }

  async function handleFilePickerSelect(filePath: string) {
    showFilePicker.value = false
    replaceActiveTrigger(`@${filePath} `, 'file')
    fileQuery.value = ''
    await nextTick()
    adjustHeight()
    editorRef.value?.focus()
  }

  function handleFilePickerClose() {
    showFilePicker.value = false
    fileQuery.value = ''
  }

  async function handlePathPickerSelect(selectedPath: string) {
    showPathPicker.value = false
    replaceActiveTrigger(`/cd ${selectedPath}`, 'path')
    pathQuery.value = ''
    await nextTick()
    adjustHeight()
    editorRef.value?.focus()
  }

  function handlePathPickerClose() {
    showPathPicker.value = false
    pathQuery.value = ''
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
      return
    }
    setEditorValue(replacement)
  }

  function handleEditorSelectionChange(selection: EditorSelection) {
    refreshTriggerState(messageInput.value, selection.from)
  }

  function handleEditorTransaction(transaction: EditorTransaction) {
    refreshTriggerState(transaction.value, transaction.selection.from)
  }

  function closeAllPickers() {
    suppressedTriggerValue = null
    clearPickerState()
  }

  return {
    // Skills
    enabledSkills,
    loadSkills,
    showSkillPicker,
    skillTriggerQuery,
    handleSkillSelect,
    handleSkillPickerClose,
    // Commands
    showCommandPicker,
    commandQuery,
    handleCommandSelect,
    handleCommandPickerClose,
    // File picker
    showFilePicker,
    fileQuery,
    handleFilePickerSelect,
    handleFilePickerClose,
    // Path picker
    showPathPicker,
    pathQuery,
    handlePathPickerSelect,
    handlePathPickerClose,
    // Utilities
    anyPickerVisible,
    refreshTriggerState,
    handleEditorSelectionChange,
    handleEditorTransaction,
    closeAllPickers,
  }
}
