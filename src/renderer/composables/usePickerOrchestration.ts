import { ref, computed, watch, type Ref } from 'vue'
import { nextTick } from 'vue'
import type { SkillDefinition } from '@/types'
import type { CommandDefinition } from '@/types/commands'
import { filterCommands } from '@/services/commands'

export function usePickerOrchestration(
  messageInput: Ref<string>,
  workingDirectory: Ref<string>,
  textareaRef: Ref<HTMLTextAreaElement | null>,
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

  const enabledSkills = computed(() => {
    return availableSkills.value.filter(s => s.enabled)
  })

  async function loadSkills() {
    try {
      const response = await window.electronAPI.getSkills()
      if (response.success && response.skills) {
        availableSkills.value = response.skills
      }
    } catch (error) {
      console.error('Failed to load skills:', error)
    }
  }

  /** Returns true if any picker (except PathPicker) is visible */
  const anyPickerVisible = computed(() =>
    showCommandPicker.value || showSkillPicker.value || showFilePicker.value
  )

  // Watch messageInput to auto-detect picker triggers
  watch(messageInput, (newValue) => {
    // Check history edit state
    checkHistoryEdit(newValue)

    // Check for command pattern first: /word (without space - still typing command name)
    const commandMatch = newValue.match(/^\/(\w*)$/)

    if (commandMatch) {
      const query = commandMatch[1]
      const commands = filterCommands(query)
      if (commands.length > 0) {
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

    // Check for /cd path completion pattern: /cd <path>
    const cdMatch = newValue.match(/^\/cd\s+(.*)$/)
    if (cdMatch) {
      pathQuery.value = cdMatch[1]
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

    // Check for @ file search pattern
    const fileMatch = newValue.match(/@([^\s@]*)$/)
    if (fileMatch && workingDirectory.value) {
      fileQuery.value = fileMatch[1]
      showFilePicker.value = true
      showSkillPicker.value = false
      skillTriggerQuery.value = ''
      return
    }

    // Close file picker if not matching file pattern
    showFilePicker.value = false
    fileQuery.value = ''

    // Fall back to skill matching
    const triggerMatch = newValue.match(/^([/@]\w*)$/)
    if (triggerMatch && enabledSkills.value.length > 0) {
      skillTriggerQuery.value = triggerMatch[1]
      showSkillPicker.value = true
    } else {
      showSkillPicker.value = false
      skillTriggerQuery.value = ''
    }
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
        messageInput.value = result.result.output
        await nextTick()
        adjustHeight()
        textareaRef.value?.focus()
      }
    } catch (error) {
      console.error('Failed to execute skill:', error)
    }
  }

  function handleSkillPickerClose() {
    showSkillPicker.value = false
  }

  async function handleCommandSelect(command: CommandDefinition) {
    showCommandPicker.value = false
    messageInput.value = `/${command.id} `
    await nextTick()
    adjustHeight()
    textareaRef.value?.focus()
  }

  function handleCommandPickerClose() {
    showCommandPicker.value = false
    commandQuery.value = ''
  }

  async function handleFilePickerSelect(filePath: string) {
    showFilePicker.value = false
    messageInput.value = messageInput.value.replace(/@[^\s@]*$/, `@${filePath} `)
    fileQuery.value = ''
    await nextTick()
    adjustHeight()
    textareaRef.value?.focus()
  }

  function handleFilePickerClose() {
    showFilePicker.value = false
    fileQuery.value = ''
  }

  async function handlePathPickerSelect(selectedPath: string) {
    showPathPicker.value = false
    messageInput.value = `/cd ${selectedPath}`
    pathQuery.value = ''
    await nextTick()
    adjustHeight()
    textareaRef.value?.focus()
  }

  function handlePathPickerClose() {
    showPathPicker.value = false
    pathQuery.value = ''
  }

  function closeAllPickers() {
    showCommandPicker.value = false
    commandQuery.value = ''
    showSkillPicker.value = false
    skillTriggerQuery.value = ''
    showFilePicker.value = false
    fileQuery.value = ''
    showPathPicker.value = false
    pathQuery.value = ''
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
    closeAllPickers,
  }
}
