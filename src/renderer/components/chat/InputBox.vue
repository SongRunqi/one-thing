<template>
  <div
    ref="composerWrapperRef"
    class="composer-wrapper"
  >
    <div class="composer-stack">
      <!-- Dock: persistent context that travels with the draft (queue,
           quote, attachments), stacked above the composer in normal flow. -->
      <TransitionGroup
        v-if="dockVisible"
        name="dock-row"
        tag="div"
        class="composer-dock"
      >
        <QueuePanel
          v-if="queuedMessages.length > 0"
          key="queue"
          :items="queuedMessages"
          :file-changes="queuedFileChanges"
          @steer="steerQueuedMessage"
          @remove="removeQueuedMessage"
          @review="reviewQueuedFileChanges"
        />
        <QuotedContext
          v-if="quotedText"
          key="quote"
          :text="quotedText"
          @clear="clearQuotedText"
        />
        <AttachmentRow
          v-if="attachedFiles.length > 0 || isProcessingAttachments"
          key="attachments"
          :files="attachedFiles"
          :processing="isProcessingAttachments"
          @remove="removeAttachment"
        />
      </TransitionGroup>
      <!-- Anchor keeps flyouts glued to the composer's top edge, floating
           above whatever is docked higher in the stack. -->
      <div class="composer-anchor">
        <span
          class="composer-frame-label"
          aria-hidden="true"
        >COMPOSER</span>
        <Transition name="fade">
          <div
            v-if="commandFeedback"
            :class="['command-feedback', commandFeedback.type]"
            @click.stop
          >
            <Check
              v-if="commandFeedback.type === 'success'"
              :size="14"
              :stroke-width="2.5"
            />
            <X
              v-else
              :size="14"
              :stroke-width="2.5"
            />
            <span>{{ commandFeedback.message }}</span>
          </div>
        </Transition>

        <CommandPicker
          :visible="activeExtension.type === 'palette'"
          :items="activeExtension.items"
          :selected-index="activeExtension.selectedIndex"
          :query="activeExtension.query"
          :loading="activeExtension.loading"
          :error="activeExtension.error"
          @select="handleCommandSelect"
          @highlight="highlightActiveSelection"
          @close="handleCommandPickerClose"
        />

        <FilePicker
          :visible="activeExtension.type === 'files'"
          :items="activeExtension.items"
          :selected-index="activeExtension.selectedIndex"
          :query="activeExtension.query"
          :loading="activeExtension.loading"
          :error="activeExtension.error"
          @select="handleFilePickerSelect"
          @highlight="highlightActiveSelection"
          @close="handleFilePickerClose"
        />

        <PathPicker
          :visible="activeExtension.type === 'paths'"
          :items="activeExtension.items"
          :selected-index="activeExtension.selectedIndex"
          :path-input="activeExtension.query"
          :loading="activeExtension.loading"
          :error="activeExtension.error"
          @select="handlePathPickerSelect"
          @highlight="highlightActiveSelection"
          @close="handlePathPickerClose"
        />

        <div
          class="composer"
          :class="{ focused: isFocused }"
          @click="focusEditor"
        >
          <!-- Input area -->
          <div class="input-area">
            <TextEditor
              ref="editorRef"
              v-model="messageInput"
              class="composer-input"
              profile="composer"
              language="markdown"
              :placeholder="composerPlaceholder"
              :settings="editorSettings"
              :prompt-refs="promptsStore.prompts"
              :skill-refs="enabledSkills"
              :command-refs="commandRefs"
              :min-height="42"
              :max-height="composerMaxHeight"
              @keydown="handleKeyDown"
              @paste="handlePasteAttachments"
              @focus="isFocused = true"
              @blur="isFocused = false"
              @height-change="handleEditorHeightChange"
              @selection-change="handleEditorSelectionChange"
              @transaction="handleEditorTransaction"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
            />
          </div>

          <div
            v-if="voiceCaptureVisible"
            class="voice-capture-bar"
            :class="{ recording: isVoiceRecordingActive, transcribing: isVoiceTranscribingActive }"
            :title="voiceCaptureHint"
            aria-live="polite"
            @click.stop
          >
            <span class="voice-capture-visual">
              <Loader2
                v-if="isVoiceTranscribingActive"
                class="voice-spinner"
                :size="14"
                :stroke-width="2"
              />
              <span
                v-else
                class="voice-wave"
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            </span>
            <span class="voice-capture-main">
              <span class="voice-capture-title">{{ voiceCaptureTitle }}</span>
              <span class="voice-capture-detail">{{ voiceCaptureDetail }}</span>
            </span>
            <Button
              v-if="isVoiceRecordingActive"
              text
              size="small"
              type="danger"
              class="voice-capture-stop"
              native-type="button"
              title="Stop recording and transcribe"
              @mousedown.prevent
              @click.stop="handleVoiceButton"
            >
              <template #icon>
                <Square
                  :size="12"
                  :stroke-width="2.4"
                />
              </template>
              Stop
            </Button>
          </div>

          <!-- Bottom toolbar -->
          <div class="composer-toolbar">
            <div class="toolbar-left">
              <ModelSelector :session-id="props.sessionId" />
              <Tooltip
                v-if="contextMeterVisible"
                :text="contextTooltipText"
                position="top"
                :delay="120"
              >
                <button
                  type="button"
                  class="context-meter"
                  :class="contextMeterTone"
                  :style="contextMeterStyle"
                  :title="contextTooltipText"
                  :aria-label="contextAriaLabel"
                  @mousedown.prevent
                  @click.stop
                >
                  <span class="context-meter-prefix">ctx</span>
                  <span
                    v-if="contextPercent !== null"
                    class="context-meter-cells"
                    aria-hidden="true"
                  ><i>{{ contextMeterFilledCells }}</i><em>{{ contextMeterRestCells }}</em></span>
                  <span class="context-meter-label">{{ contextMeterLabel }}</span>
                </button>
              </Tooltip>
              <ThinkToggle :session-id="props.sessionId" />
              <Select
                size="small"
                class="permission-mode-select"
                :class="`mode-${permissionMode}`"
                teleported
                placement="top"
                popper-class="inputbox-select-dropdown permission-mode-dropdown"
                :model-value="permissionMode"
                :options="PERMISSION_MODE_OPTIONS"
                :popper-style="permissionDropdownStyle"
                aria-label="Permission mode"
                :title="`Permission mode: ${permissionModeLabel}. Press Shift+Tab to switch.`"
                @click.stop
                @change="handlePermissionModeChange"
              >
                <template #label>
                  <span class="guard-label">guard:{{ guardShort }}</span>
                </template>
              </Select>
            </div>

            <div
              class="toolbar-right"
              @click.stop
            >
              <Button
                size="small"
                class="voice-btn"
                :class="{
                  active: isVoiceRecordingActive,
                  transcribing: isVoiceTranscribingActive,
                  'needs-setup': !!voiceConfigurationError && !voiceStore.isRecording,
                }"
                native-type="button"
                :title="voiceButtonTitle"
                @mousedown.prevent
                @click.stop="handleVoiceButton"
              >
                <template #icon>
                  <Square
                    v-if="isVoiceRecordingActive"
                    :size="14"
                    :stroke-width="2.4"
                  />
                  <Loader2
                    v-else-if="isVoiceTranscribingActive"
                    class="voice-spinner"
                    :size="16"
                    :stroke-width="2"
                  />
                  <Mic
                    v-else
                    :size="17"
                    :stroke-width="2"
                  />
                </template>
              </Button>
              <Button
                type="primary"
                class="send-btn"
                :class="{ 'stop-btn': shouldShowStopAction }"
                :disabled="isPrimaryActionDisabled"
                :title="primaryActionTitle"
                @mousedown.prevent
                @click.stop="handlePrimaryAction"
              >
                <template
                  v-if="shouldShowStopAction"
                  #icon
                >
                  <Square
                    :size="14"
                    fill="currentColor"
                    :stroke-width="0"
                  />
                </template>
                <template
                  v-else
                  #default
                >
                  <span
                    class="send-label"
                    aria-hidden="true"
                  >SEND ⏎</span>
                </template>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import Select from '@/components/common/Select.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { useVoiceStore } from '@/stores/voice'
import { usePromptsStore } from '@/stores/prompts'
import { platformApi } from '@/platform'
// Sub-components
import QuotedContext from './QuotedContext.vue'
import CommandPicker from './CommandPicker.vue'
import FilePicker from './FilePicker.vue'
import PathPicker from './PathPicker.vue'
import ModelSelector from './ModelSelector.vue'
import ThinkToggle from './ThinkToggle.vue'
import QueuePanel from './composer/QueuePanel.vue'
import AttachmentRow from './composer/AttachmentRow.vue'
import {
  decodeAttachmentText,
  hasDiffLikeContent,
  isPatchLikeFile,
  parseDiffStats,
  type QueuedFileChangeSummary,
  type QueuedMessage,
} from './composer/queued-message-utils'
import { X, Square, Check, Loader2, Mic } from 'lucide-vue-next'
import { findCommand, getCommands, refreshPluginCommands } from '@/services/commands'
import TextEditor from '@/editor/TextEditor.vue'
import type { EditorHandle } from '@/editor'
import type { MessageAttachment, PermissionMode } from '@/types'
import type { SelectModelValue } from '@/components/common/select'
import { DEFAULT_VOICE_SETTINGS } from '@shared/defaults/settings'
import { getDiffFromStep } from '@/stores/helpers/tool-step-view'

// Composables
import { useInputHistory } from '@/composables/useInputHistory'
import { usePickerOrchestration } from '@/composables/usePickerOrchestration'
import { useCommandFeedback } from '@/composables/useCommandFeedback'
import { useAttachments } from '@/composables/useAttachments'
import type { AttachedFile } from '@/composables/useAttachments'
import { createPromptToken } from '@shared/prompt-references'

interface Props {
  isLoading?: boolean
  maxChars?: number
  sessionId?: string
}

interface Emits {
  (e: 'sendMessage', message: string, mode?: 'send' | 'steer' | 'followup', attachments?: MessageAttachment[]): void
  (e: 'stopGeneration'): void
  (e: 'switchSession', sessionId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  maxChars: 4000,
  sessionId: undefined,
})

const emit = defineEmits<Emits>()
const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()
const chatStore = useChatStore()
const voiceStore = useVoiceStore()
const promptsStore = usePromptsStore()

const PERMISSION_MODES: PermissionMode[] = ['normal', 'auto-accept-edits', 'dangerously-allow-all']
const PERMISSION_MODE_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'auto-accept-edits', label: 'Auto Edits' },
  { value: 'dangerously-allow-all', label: 'Danger' },
]

// Get the effective session ID
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

const currentSession = computed(() => sessionsStore.getSessionItem(effectiveSessionId.value) || null)

const permissionMode = computed<PermissionMode>(() => {
  return currentSession.value?.permissionMode || settingsStore.settings?.tools?.permissionMode || 'normal'
})

const permissionModeLabel = computed(() => {
  switch (permissionMode.value) {
    case 'auto-accept-edits': return 'Auto Edits'
    case 'dangerously-allow-all': return 'Danger'
    default: return 'Normal'
  }
})

const permissionDropdownStyle = computed(() => ({
  width: '178px',
}))

const guardShort = computed(() => {
  switch (permissionMode.value) {
    case 'auto-accept-edits': return 'auto-edit'
    case 'dangerously-allow-all': return 'danger'
    default: return 'normal'
  }
})

const activeProvider = computed(() => {
  return currentSession.value?.lastProvider || settingsStore.settings?.ai?.provider || ''
})

const activeModel = computed(() => {
  if (currentSession.value?.lastModel) return currentSession.value.lastModel
  const provider = activeProvider.value
  return provider
    ? settingsStore.settings?.ai?.providers?.[provider]?.model || ''
    : ''
})

const modelContextLength = computed(() => {
  const provider = activeProvider.value
  const model = activeModel.value
  if (!provider || !model) return 0
  const cachedModels = settingsStore.getCachedModels?.(provider) ?? []
  const found = cachedModels.find((item: any) => item.id === model)
  return Math.max(0, found?.context_length ?? found?.top_provider?.context_length ?? 0)
})

function normalizeTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0
}

const contextTokens = computed(() => {
  return normalizeTokenCount(currentSession.value?.contextSize ?? currentSession.value?.lastInputTokens)
})

const totalInputTokens = computed(() => normalizeTokenCount(currentSession.value?.totalInputTokens))
const totalOutputTokens = computed(() => normalizeTokenCount(currentSession.value?.totalOutputTokens))
const totalTokens = computed(() => normalizeTokenCount(currentSession.value?.totalTokens))

const contextPercent = computed(() => {
  const windowTokens = modelContextLength.value
  if (windowTokens <= 0) return null
  return Math.min(100, Math.max(0, (contextTokens.value / windowTokens) * 100))
})

const contextMeterProgress = computed(() => contextPercent.value ?? 0)

/**
 * The meter is a resident gauge: visible whenever the session has any
 * context usage. Only "no data" hides it — danger thresholds control
 * color, not existence.
 */
const contextMeterVisible = computed(() => contextTokens.value > 0)

const contextMeterStyle = computed<Record<string, string>>(() => ({
  '--context-meter-progress': `${contextMeterProgress.value}%`,
}))

const contextMeterTone = computed(() => {
  const percent = contextPercent.value
  if (percent === null) return contextTokens.value > 0 ? 'is-measured' : 'is-empty'
  if (percent >= 85) return 'is-high'
  if (percent >= 70) return 'is-medium'
  if (contextTokens.value === 0) return 'is-empty'
  return 'is-measured'
})

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatCompactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`
  if (value >= 10_000) return `${Math.round(value / 1000)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return `${value}`
}

const CONTEXT_METER_CELLS = 10

const contextMeterFilledCells = computed(() => {
  const filled = Math.round(((contextPercent.value ?? 0) / 100) * CONTEXT_METER_CELLS)
  return '▮'.repeat(Math.min(CONTEXT_METER_CELLS, Math.max(0, filled)))
})

const contextMeterRestCells = computed(() => {
  return '▯'.repeat(CONTEXT_METER_CELLS - contextMeterFilledCells.value.length)
})

const contextMeterLabel = computed(() => {
  if (contextTokens.value <= 0) return 'CTX'
  const percent = contextPercent.value
  if (percent !== null) return `${Math.round(percent)}%`
  return formatCompactTokens(contextTokens.value)
})

const contextAriaLabel = computed(() => {
  const percent = contextPercent.value
  if (percent !== null) {
    return `Context ${formatNumber(contextTokens.value)} of ${formatNumber(modelContextLength.value)} tokens, ${Math.round(percent)} percent`
  }
  return `Context ${formatNumber(contextTokens.value)} tokens`
})

const contextTooltipText = computed(() => {
  const lines: string[] = []
  const percent = contextPercent.value
  if (modelContextLength.value > 0) {
    lines.push(`Context: ${formatNumber(contextTokens.value)} / ${formatNumber(modelContextLength.value)} tokens (${Math.round(percent ?? 0)}%)`)
  } else {
    lines.push(`Context: ${formatNumber(contextTokens.value)} tokens`)
  }
  lines.push(`Last input: ${formatNumber(contextTokens.value)} tokens`)
  lines.push(`Total input: ${formatNumber(totalInputTokens.value)} tokens`)
  lines.push(`Total output: ${formatNumber(totalOutputTokens.value)} tokens`)
  if (totalTokens.value > 0) lines.push(`Total: ${formatNumber(totalTokens.value)} tokens`)
  if (activeModel.value) {
    lines.push(`Model: ${activeProvider.value ? `${activeProvider.value} / ` : ''}${activeModel.value}`)
  }
  return lines.join('\n')
})

// Core state
const messageInput = ref('')
const quotedText = ref('')
const isFocused = ref(false)
const isComposing = ref(false)
const editorRef = ref<EditorHandle | null>(null)
const composerWrapperRef = ref<HTMLElement | null>(null)

const queuedMessages = ref<QueuedMessage[]>([])

// Get the working directory for file search
const workingDirectory = computed(() => {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return ''
  const workdirVariable = sessionsStore.sessionVariables.get(sessionId)?.find(variable => variable.name === 'workdir')
  if (workdirVariable?.value) return workdirVariable.value
  return currentSession.value?.workingDirectory || ''
})

// --- Composables ---

const editorSettings = computed(() => settingsStore.settings.general.editor)
const composerMaxHeight = computed(() => editorSettings.value?.composerMaxHeight ?? 200)

function updateComposerHeight() {
  // No-op: the composer is a flex sibling of the message list, so its height
  // no longer needs to be published as a CSS var. Kept as a callback hook for
  // composables (history / pickers) that fire it when the editor reflows.
}

function handleEditorHeightChange() {
  updateComposerHeight()
}

const {
  resetHistoryNavigation,
  handleHistoryNavigation,
  checkHistoryEdit,
} = useInputHistory(effectiveSessionId, messageInput, editorRef, updateComposerHeight)

const {
  activeExtension,
  moveActiveSelection,
  setActiveSelection,
  pageActiveSelection,
  highlightActiveSelection,
  confirmActiveExtension,
  loadSkills,
  handleCommandSelect,
  handleCommandPickerClose,
  handleFilePickerSelect,
  handleFilePickerClose,
  handlePathPickerSelect,
  handlePathPickerClose,
  anyPickerVisible,
  handleEditorSelectionChange,
  handleEditorTransaction,
  closeAllPickers,
  enabledSkills,
} = usePickerOrchestration(messageInput, workingDirectory, editorRef, updateComposerHeight, checkHistoryEdit, effectiveSessionId)

const { commandFeedback, showCommandFeedback } = useCommandFeedback()
const {
  attachedFiles,
  isProcessing: isProcessingAttachments,
  handlePaste: handleAttachmentPaste,
  removeAttachment,
  clearAttachments,
  restoreAttachments,
  toMessageAttachments,
} = useAttachments()

let activeComposerSessionId = effectiveSessionId.value || ''
let restoringComposerDraft = false

function getCurrentComposerDraft() {
  return {
    messageInput: messageInput.value,
    quotedText: quotedText.value,
    attachments: toMessageAttachments() ?? [],
  }
}

function saveComposerDraft(sessionId = activeComposerSessionId) {
  if (!sessionId || restoringComposerDraft) return
  chatStore.setComposerDraft(sessionId, getCurrentComposerDraft())
}

async function restoreComposerDraft(sessionId: string) {
  restoringComposerDraft = true
  const draft = sessionId ? chatStore.getComposerDraft(sessionId) : null
  messageInput.value = draft?.messageInput ?? ''
  quotedText.value = draft?.quotedText ?? ''
  restoreAttachments(draft?.attachments)
  await nextTick()
  updateComposerHeight()
  restoringComposerDraft = false
}

// --- Computed ---

const hasMessageContent = computed(() => messageInput.value.trim().length > 0)
const hasAttachments = computed(() => attachedFiles.value.length > 0)
const commandRefs = ref(getCommands())
const hasActiveGeneration = computed(() => {
  const sessionId = effectiveSessionId.value
  return !!props.isLoading || (sessionId ? chatStore.isSessionGenerating(sessionId) : false)
})

const canSend = computed(() => {
  return (hasMessageContent.value || hasAttachments.value) && !isProcessingAttachments.value
})

const shouldShowStopAction = computed(() => {
  return hasActiveGeneration.value && !hasMessageContent.value && !hasAttachments.value
})

const dockVisible = computed(() => {
  return (
    queuedMessages.value.length > 0 ||
    !!quotedText.value ||
    attachedFiles.value.length > 0 ||
    isProcessingAttachments.value
  )
})

const queuedFileChanges = computed<QueuedFileChangeSummary | null>(() => {
  if (queuedMessages.value.length === 0) return null
  return latestSessionFileChanges() || queuedPatchAttachmentChanges()
})

const isPrimaryActionDisabled = computed(() => {
  if (shouldShowStopAction.value) return false
  return !canSend.value
})

const primaryActionTitle = computed(() => {
  if (shouldShowStopAction.value) return 'Stop generation'
  if (hasActiveGeneration.value) return 'Queue message after current response'
  return 'Send message'
})
const voiceSettings = computed(() => settingsStore.settings.voice ?? DEFAULT_VOICE_SETTINGS)
const voiceStatus = computed(() => voiceStore.status ?? 'idle')
const isVoiceRecordingActive = computed(() => voiceStatus.value === 'recording')
const isVoiceTranscribingActive = computed(() => voiceStatus.value === 'transcribing')
const voiceCaptureVisible = computed(() => isVoiceRecordingActive.value || isVoiceTranscribingActive.value)
const voiceRecordingElapsedMs = ref(0)
let voiceRecordingTimer: number | null = null

const voiceConfigurationError = computed(() => {
  const voice = voiceSettings.value
  if (!voice?.enabled) return 'Enable Voice in Settings'
  if (!effectiveSessionId.value) return 'Open a chat before using voice'
  if (voice.asr.provider === 'funasr-stream') {
    const url = voice.asr.funasr.url.trim()
    if (!url) return 'Add a FunASR WebSocket URL in Voice settings'
    if (!/^wss?:\/\//i.test(url)) return 'FunASR streaming ASR needs a ws:// or wss:// URL'
  }
  if (voice.asr.provider === 'openrouter-transcribe') {
    const voiceKey = voice.asr.openrouter.apiKey?.trim()
    const globalKey = (settingsStore.settings.ai.providers.openrouter as any)?.apiKey?.trim()
    if (!voiceKey && !globalKey) return 'Add an OpenRouter API key in Voice settings'
  }
  if (voice.asr.provider === 'funasr-server' && !voice.asr.funasr.url.trim()) {
    return 'Add a FunASR server URL in Advanced voice settings'
  }
  if (voice.asr.provider === 'openai-transcribe') {
    const voiceKey = voice.asr.openai.apiKey?.trim()
    const globalKey = (settingsStore.settings.ai.providers.openai as any)?.apiKey?.trim()
    if (!voiceKey && !globalKey) return 'OpenAI transcription is selected, but no OpenAI API key is configured'
  }
  return ''
})
const voiceButtonTitle = computed(() => {
  if (isVoiceRecordingActive.value) return 'Stop and transcribe'
  if (isVoiceTranscribingActive.value) return 'Transcribing voice input'
  if (voiceConfigurationError.value) return `${voiceConfigurationError.value}. Click to set up.`
  return 'Start voice input'
})
const composerPlaceholder = computed(() => {
  if (isVoiceRecordingActive.value) return 'Listening...'
  if (isVoiceTranscribingActive.value) return 'Transcribing...'
  return 'Ask anything...'
})

const formattedVoiceElapsed = computed(() => {
  const totalSeconds = Math.floor(voiceRecordingElapsedMs.value / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
})

const voiceCaptureTitle = computed(() => {
  if (isVoiceTranscribingActive.value) return 'Transcribing'
  return 'Listening'
})

const voiceCaptureDetail = computed(() => {
  if (isVoiceRecordingActive.value && voiceStore.lastTranscript) return voiceStore.lastTranscript
  if (isVoiceTranscribingActive.value && voiceStore.lastTranscript) return voiceStore.lastTranscript
  if (isVoiceTranscribingActive.value) return 'Speech to text'
  return formattedVoiceElapsed.value
})

const voiceCaptureHint = computed(() => {
  const silenceSeconds = Math.max(0.5, voiceSettings.value.vad.silenceMs / 1000)
  if (isVoiceTranscribingActive.value) return 'Converting speech to text'
  return `Auto-stops after about ${silenceSeconds.toFixed(1)}s of silence. Press Stop to send now.`
})

function stopVoiceRecordingTimer() {
  if (voiceRecordingTimer !== null) {
    window.clearInterval(voiceRecordingTimer)
    voiceRecordingTimer = null
  }
}

function startVoiceRecordingTimer() {
  stopVoiceRecordingTimer()
  const startedAt = Date.now()
  voiceRecordingElapsedMs.value = 0
  voiceRecordingTimer = window.setInterval(() => {
    voiceRecordingElapsedMs.value = Date.now() - startedAt
  }, 250)
}

// --- Watchers ---

watch(effectiveSessionId, async (newSessionId, oldSessionId) => {
  if (oldSessionId) saveComposerDraft(oldSessionId)
  activeComposerSessionId = newSessionId || ''
  resetHistoryNavigation()
  closeAllPickers()
  await restoreComposerDraft(activeComposerSessionId)
}, { immediate: true })

watch([messageInput, quotedText, attachedFiles], () => {
  saveComposerDraft()
}, { deep: true })

watch(isVoiceRecordingActive, (recording) => {
  if (recording) {
    startVoiceRecordingTimer()
  } else {
    stopVoiceRecordingTimer()
    voiceRecordingElapsedMs.value = 0
  }
}, { immediate: true })

// Send the next queued follow-up when the active generation completes.
watch(hasActiveGeneration, (generating) => {
  if (!generating) {
    flushQueuedMessage()
  }
})

watch(
  () => [activeExtension.value.type, activeExtension.value.items],
  () => {
    if (activeExtension.value.type === 'palette') {
      commandRefs.value = getCommands()
    }
  },
)

function handleDocumentMouseDown(event: MouseEvent) {
  const wrapper = composerWrapperRef.value
  if (!wrapper) return
  if (event.target instanceof Node && wrapper.contains(event.target)) return
  closeAllPickers()
}

onMounted(async () => {
  await loadSkills()
  await promptsStore.loadPrompts()
  document.addEventListener('mousedown', handleDocumentMouseDown)
})

onUnmounted(() => {
  saveComposerDraft()
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  stopVoiceRecordingTimer()
})

// --- Core handlers ---

function latestSessionFileChanges(): QueuedFileChangeSummary | null {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return null
  const messages = chatStore.sessionMessages?.get(sessionId) ?? []

  for (const message of [...messages].reverse()) {
    const diffEntries = (message.steps ?? [])
      .map(step => ({ step, diff: getDiffFromStep(step) }))
      .filter(entry => !!entry.diff)

    if (diffEntries.length === 0) continue

    let additions = 0
    let deletions = 0
    const fileKeys = new Set<string>()
    for (const entry of diffEntries) {
      const diff = entry.diff!
      additions += diff.additions || 0
      deletions += diff.deletions || 0
      fileKeys.add(diff.filePath || entry.step.id || entry.step.toolCallId || `${fileKeys.size}`)
    }

    const selected = diffEntries[diffEntries.length - 1]?.step
    return {
      fileCount: fileKeys.size,
      additions,
      deletions,
      selectedStepId: selected?.id || selected?.toolCallId,
    }
  }

  return null
}

function queuedPatchAttachmentChanges(): QueuedFileChangeSummary | null {
  let additions = 0
  let deletions = 0
  let fileCount = 0

  for (const item of queuedMessages.value) {
    if (hasDiffLikeContent(item.content)) {
      const stats = parseDiffStats(item.content)
      additions += stats.additions
      deletions += stats.deletions
      fileCount += stats.fileCount
    }

    for (const file of item.attachments ?? []) {
      if (!isPatchLikeFile(file)) continue
      const stats = parseDiffStats(decodeAttachmentText(file))
      additions += stats.additions
      deletions += stats.deletions
      fileCount += stats.fileCount || 1
    }
  }

  if (fileCount === 0) return null
  return { fileCount, additions, deletions }
}

function reviewQueuedFileChanges() {
  chatStore.openInspectorToTab?.('diff', queuedFileChanges.value?.selectedStepId || '')
}



function showAttachmentResult(accepted: AttachedFile[], rejected: { message: string }[]) {
  if (rejected.length > 0) {
    showCommandFeedback('error', rejected[0].message)
    return
  }
  if (accepted.length > 0) {
    showCommandFeedback('success', accepted.length === 1
      ? `Attached ${accepted[0].fileName}`
      : `Attached ${accepted.length} files`)
  }
}

async function handlePasteAttachments(event: ClipboardEvent) {
  const result = await handleAttachmentPaste(event)
  if (!result.handled) return
  showAttachmentResult(result.accepted, result.rejected)
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.focus()
  })
}

async function cyclePermissionMode() {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return

  const currentIndex = PERMISSION_MODES.indexOf(permissionMode.value)
  const nextMode = PERMISSION_MODES[(currentIndex + 1) % PERMISSION_MODES.length]
  await updatePermissionMode(nextMode)
}

async function handlePermissionModeChange(value: SelectModelValue) {
  if (Array.isArray(value) || typeof value !== 'string') return
  if (!isPermissionMode(value) || value === permissionMode.value) return
  await updatePermissionMode(value)
}

async function updatePermissionMode(nextMode: PermissionMode) {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return

  const result = await sessionsStore.updateSessionPermissionMode(sessionId, nextMode)
  if (!result.success) {
    showCommandFeedback('error', result.error || 'Failed to update permission mode')
    return
  }
  showCommandFeedback('success', `Permission mode: ${permissionModeLabel.value}`)
}

function isPermissionMode(value: string): value is PermissionMode {
  return PERMISSION_MODES.includes(value as PermissionMode)
}

function handleKeyDown(e: KeyboardEvent) {
  if (isComposing.value || e.isComposing) return

  if (e.key === 'Tab' && e.shiftKey && !anyPickerVisible.value) {
    e.preventDefault()
    void cyclePermissionMode()
    return
  }

  if (anyPickerVisible.value) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActiveSelection(-1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActiveSelection(1)
      return
    }
    if (activeExtension.value.type === 'palette') {
      if (e.key === 'Home') {
        e.preventDefault()
        setActiveSelection(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        setActiveSelection(activeExtension.value.items.length - 1)
        return
      }
      if (e.key === 'PageUp') {
        e.preventDefault()
        pageActiveSelection(-1)
        return
      }
      if (e.key === 'PageDown') {
        e.preventDefault()
        pageActiveSelection(1)
        return
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeAllPickers()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      void confirmActiveExtension()
      return
    }
    if (e.key === 'Enter') {
      if (activeExtension.value.type === 'paths') {
        if (!e.shiftKey) {
          e.preventDefault()
          closeAllPickers()
          sendMessage()
        }
        return
      }
      e.preventDefault()
      void confirmActiveExtension()
      return
    }
  }

  // Escape order: flyout pickers close first (handled above); with no
  // picker open, Escape clears the quoted context next.
  if (e.key === 'Escape' && quotedText.value) {
    e.preventDefault()
    clearQuotedText()
    return
  }

  // History navigation (up/down arrows)
  if (e.key === 'ArrowUp') {
    if (handleHistoryNavigation('up')) {
      e.preventDefault()
      return
    }
  }
  if (e.key === 'ArrowDown') {
    if (handleHistoryNavigation('down')) {
      e.preventDefault()
      return
    }
  }

  const shortcuts = settingsStore.settings?.general?.shortcuts
  if (shortcuts?.sendMessage) {
    const shortcut = shortcuts.sendMessage
    const keyMatches = e.key.toLowerCase() === shortcut.key.toLowerCase()
    const modifiersMatch =
      !!shortcut.ctrlKey === e.ctrlKey &&
      !!shortcut.metaKey === e.metaKey &&
      !!shortcut.altKey === e.altKey &&
      !!shortcut.shiftKey === e.shiftKey

    if (keyMatches && modifiersMatch) {
      e.preventDefault()
      sendMessage()
      return
    }
  }

  const legacyShortcut = settingsStore.settings?.general?.sendShortcut || 'enter'

  if (legacyShortcut === 'enter') {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  } else {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      sendMessage()
    }
  }
}

async function sendMessage() {
  if (!canSend.value) return

  // Check if this is a command
  const commandMatch = !hasAttachments.value
    ? messageInput.value.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/)
    : null
  if (commandMatch) {
    const commandId = commandMatch[1]
    const argsString = commandMatch[2] || ''
    let command = findCommand(commandId)
    if (!command) {
      await refreshPluginCommands()
      command = findCommand(commandId)
    }

    if (command) {
      const consumeInputImmediately = command.consumesInputImmediately
      if (consumeInputImmediately) {
        messageInput.value = ''
        resetHistoryNavigation()
        closeAllPickers()
        nextTick(() => {
          updateComposerHeight()
          editorRef.value?.focus()
        })
      }

      const result = await command.execute({
        sessionId: effectiveSessionId.value,
        args: argsString.split(/\s+/).filter(Boolean),
        rawArgs: argsString,
      })

      if (result.success) {
        showCommandFeedback('success', result.message || 'Done')
        if (!consumeInputImmediately) {
          messageInput.value = ''
          resetHistoryNavigation()
          closeAllPickers()
          nextTick(() => {
            updateComposerHeight()
            editorRef.value?.focus()
          })
        }
        if (result.switchToSessionId) {
          emit('switchSession', result.switchToSessionId)
        }
      } else {
        showCommandFeedback('error', result.error || `/${commandId} failed`)
        if (!consumeInputImmediately) closeAllPickers()
        nextTick(() => {
          updateComposerHeight()
          editorRef.value?.focus()
        })
      }
      return
    }
  }

  // Regular message sending
  let fullMessage = messageInput.value
  const attachments = toMessageAttachments()

  if (quotedText.value) {
    const quotedLines = quotedText.value.split('\n').map(line => `> ${line}`).join('\n')
    fullMessage = `${quotedLines}\n\n${messageInput.value}`
  }

  if (hasActiveGeneration.value) {
    queuedMessages.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content: fullMessage,
      attachments,
    })
  } else {
    emit('sendMessage', fullMessage, 'send', attachments)
  }

  messageInput.value = ''
  resetHistoryNavigation()
  quotedText.value = ''
  clearAttachments()
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.scrollToTop()
    editorRef.value?.focus()
  })
}

function stopGeneration() {
  emit('stopGeneration')
}

function handlePrimaryAction() {
  if (shouldShowStopAction.value) {
    stopGeneration()
    return
  }
  sendMessage()
}

async function prepareVoiceInput() {
  const currentSettings = settingsStore.settings
  const nextVoice = JSON.parse(JSON.stringify(currentSettings.voice ?? DEFAULT_VOICE_SETTINGS))
  let changed = false
  let switchedToRecommended = false

  if (!nextVoice.enabled) {
    nextVoice.enabled = true
    changed = true
  }

  if (nextVoice.asr.provider === 'openai-transcribe') {
    const openAIKey = nextVoice.asr.openai.apiKey?.trim()
    const globalOpenAIKey = (currentSettings.ai.providers.openai as any)?.apiKey?.trim()
    if (!openAIKey && !globalOpenAIKey) {
      nextVoice.asr.provider = 'funasr-stream'
      changed = true
      switchedToRecommended = true
    }
  }

  if (nextVoice.asr.provider === 'funasr-server' && !nextVoice.asr.funasr.url.trim()) {
    nextVoice.asr.provider = 'funasr-stream'
    changed = true
    switchedToRecommended = true
  }

  if (changed) {
    await settingsStore.saveSettings({
      ...currentSettings,
      voice: nextVoice,
    })
  }

  if (nextVoice.asr.provider === 'funasr-stream') {
    const url = nextVoice.asr.funasr.url.trim()
    if (!/^wss?:\/\//i.test(url)) {
      void platformApi.openSettingsWindow()
      return {
        success: false,
        error: switchedToRecommended
          ? 'Voice was reset to streaming ASR. Add a FunASR ws:// URL in Voice settings.'
          : 'Add a FunASR ws:// URL in Voice settings.',
      }
    }
  }

  if (nextVoice.asr.provider === 'openrouter-transcribe') {
    const globalOpenRouterKey = (currentSettings.ai.providers.openrouter as any)?.apiKey?.trim()
    const openRouterVoiceKey = nextVoice.asr.openrouter.apiKey?.trim()
    const hasOpenRouterKey = Boolean(openRouterVoiceKey || globalOpenRouterKey)
    if (!hasOpenRouterKey) {
      void platformApi.openSettingsWindow()
      return {
        success: false,
        error: 'Add an OpenRouter API key in Voice settings.',
      }
    }
  }

  if (nextVoice.asr.provider === 'funasr-server' && !nextVoice.asr.funasr.url.trim()) {
    void platformApi.openSettingsWindow()
    return {
      success: false,
      error: 'Add a FunASR server URL in Voice settings.',
    }
  }

  if (switchedToRecommended) {
    showCommandFeedback('success', 'Voice input reset to streaming ASR')
  }

  return { success: true }
}

async function handleVoiceButton() {
  if (!effectiveSessionId.value) {
    showCommandFeedback('error', 'Open a chat before using voice')
    return
  }
  if (isVoiceTranscribingActive.value) return
  if (isVoiceRecordingActive.value || voiceStore.isRecording) {
    void voiceStore.stop('mic-button', true)
    return
  }
  const ready = await prepareVoiceInput()
  if (!ready.success) {
    showCommandFeedback('error', ready.error || 'Voice input needs setup')
    return
  }

  const response = await voiceStore.startListening(effectiveSessionId.value)
  if (response && !response.success) {
    showCommandFeedback('error', response.error || 'Voice input could not start')
  }
}

function steerQueuedMessage(id: string) {
  const item = queuedMessages.value.find(message => message.id === id)
  if (!item) return
  if (item.attachments?.length) {
    showCommandFeedback('error', 'File messages will send after the current response')
    return
  }
  queuedMessages.value = queuedMessages.value.filter(message => message.id !== id)
  emit('sendMessage', item.content, 'steer')
  showCommandFeedback('success', 'Steering queued')
}

function removeQueuedMessage(id: string) {
  queuedMessages.value = queuedMessages.value.filter(message => message.id !== id)
}

function flushQueuedMessage() {
  if (hasActiveGeneration.value) return
  const nextMessage = queuedMessages.value.shift()
  if (!nextMessage) return
  emit('sendMessage', nextMessage.content, 'send', nextMessage.attachments)
}

function focusEditor() {
  editorRef.value?.focus()
}

// --- Exposed methods ---

function setQuotedText(text: string) {
  quotedText.value = text
  nextTick(() => {
    editorRef.value?.focus()
  })
}

function clearQuotedText() {
  quotedText.value = ''
}

function setMessageInput(text: string) {
  messageInput.value = text
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.focus()
  })
}

function insertPromptReference(promptId: string) {
  const token = `${createPromptToken(promptId)} `
  const editor = editorRef.value
  if (editor) {
    const selection = editor.getSelection()
    editor.replaceRange(selection.from, selection.to, token)
  } else {
    messageInput.value += token
  }
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.focus()
  })
}

defineExpose({
  setQuotedText,
  clearQuotedText,
  setMessageInput,
  insertPromptReference,
  focus: focusEditor,
  // Snapshot API for session switching
  getMessageInput: () => messageInput.value,
  getQuotedText: () => quotedText.value,
  getAttachments: () => toMessageAttachments() ?? [],
  restoreSnapshot: (snap: { messageInput: string; quotedText: string; attachments?: MessageAttachment[] }) => {
    messageInput.value = snap.messageInput
    quotedText.value = snap.quotedText
    restoreAttachments(snap.attachments)
    nextTick(() => updateComposerHeight())
  },
  clearInput: () => {
    messageInput.value = ''
    quotedText.value = ''
    clearAttachments()
    nextTick(() => updateComposerHeight())
  },
})
</script>

<style scoped>
.composer-wrapper {
  width: var(--chat-composer-width, var(--chat-content-width, var(--content-measure, 46rem)));
  margin: 0 var(--chat-content-column-right, auto) 0 var(--chat-content-column-left, auto);
  position: relative;
}

.composer-stack {
  position: relative;
  width: 100%;
}

/* Positioning context for the flyout pickers: anchored to the composer's
   top edge so they hover above any docked rows without moving with them. */
.composer-anchor {
  position: relative;
  width: 100%;
}

/* Blueprint frame tag: floats on the composer's top border like a drawing
   title block; backed by the chat surface so it "cuts" the outline. */
.composer-frame-label {
  position: absolute;
  top: -7px;
  left: 12px;
  z-index: 2;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  pointer-events: none;
  user-select: none;
}

.composer-anchor:has(.composer.focused) .composer-frame-label {
  color: var(--ui-accent-primary-fg, var(--accent));
}

/* Dock: in-flow stack of persistent draft context above the composer.
   Visual weight decreases toward the input: queue (panel) > quote (line)
   > attachments (bare chips). */
.composer-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Frame tags float 7px above each row's border; the gaps make room. */
  gap: 13px;
  width: 100%;
  padding-top: 7px;
  margin-bottom: 14px;
}

.dock-row-enter-active,
.dock-row-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.dock-row-enter-from,
.dock-row-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.dock-row-move {
  transition: transform 0.18s ease;
}

/* Transient toast floating above the composer's top edge; never affects
   layout, unlike the old in-composer context stack. */
.command-feedback {
  position: absolute;
  left: 0;
  bottom: calc(100% + 9px);
  z-index: calc(var(--z-dropdown) + 2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 10px;
  border: 0.5px solid var(--ui-composer-overlay-border);
  border-radius: var(--radius-xs, 4px);
  background: var(--ui-composer-overlay-bg);
  box-shadow: var(--ui-composer-overlay-shadow);
  backdrop-filter: blur(8px) saturate(1.02);
  -webkit-backdrop-filter: blur(8px) saturate(1.02);
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  line-height: 1.3;
  pointer-events: none;
}

.command-feedback.success {
  border-color: var(--ui-status-success-border, var(--color-success));
  color: var(--ui-status-success-fg, var(--text-success, var(--text)));
}

.command-feedback.error {
  border-color: var(--ui-status-danger-border, var(--color-danger));
  color: var(--ui-status-danger-fg, var(--text-error, var(--text)));
}

.command-feedback span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Main composer container */
.composer {
  /* Blueprint frame: zero fill, one confident outline. The surface token is
     kept only for the collapsed-mask/tooling fallbacks below. */
  --composer-surface: var(--ui-surface-input-bg, var(--bg-input, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg)))));
  --composer-border: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 52%, transparent);

  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xs, 4px);
  border: 1px solid var(--composer-border);
  background: transparent;
  box-shadow: var(--ui-surface-composer-shadow, none);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  overflow: hidden;
}

.composer.focused {
  border-color: var(--ui-surface-input-focus-border, var(--ui-state-focus-border, var(--ui-accent-primary-fg, var(--accent))));
  background: transparent;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-state-focus-ring, var(--ui-accent-primary-fg, var(--accent))) 28%, transparent);
}

/* Input area */
.input-area {
  position: relative;
  /* Keep the editor scroller flush with the composer edge; text padding lives in CodeMirror. */
  padding: 0 0 0 12px;
}

.composer-input {
  width: 100%;
  --editor-font-size: 15px;
  /* The draft is set like manuscript text: display serif over UI sans. */
  --editor-font-family: var(--font-display, var(--font-sans));
  min-height: 42px;
}

.voice-capture-bar {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin: 0 12px 8px;
  min-height: 36px;
  padding: 7px 8px 7px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 82%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-tertiary, var(--ui-state-hover-bg, var(--hover)))) 86%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.voice-capture-bar.recording {
  border-color: var(--ui-status-danger-border, var(--ui-border-default-border, var(--border)));
  background: var(--ui-status-danger-bg, var(--ui-surface-elevated-bg, var(--bg-tertiary, var(--ui-state-hover-bg, var(--hover)))));
}

.voice-capture-bar.transcribing {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 36%, var(--ui-border-default-border, var(--border)));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 8%, var(--ui-surface-elevated-bg, var(--bg-tertiary, var(--ui-state-hover-bg, var(--hover)))));
}

.voice-capture-visual {
  width: 20px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-accent-primary-fg, var(--accent));
}

.voice-wave {
  width: 20px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.voice-wave span {
  width: 2px;
  height: 7px;
  border-radius: 999px;
  background: var(--ui-status-danger-fg, #ef4444);
  animation: voice-wave 0.9s ease-in-out infinite;
}

.voice-wave span:nth-child(2) { animation-delay: 0.08s; }
.voice-wave span:nth-child(3) { animation-delay: 0.16s; }
.voice-wave span:nth-child(4) { animation-delay: 0.24s; }
.voice-wave span:nth-child(5) { animation-delay: 0.32s; }

.voice-capture-main {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.voice-capture-title {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.voice-capture-detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.2;
  color: var(--ui-text-muted-fg, var(--muted));
}

.voice-capture-stop {
  --app-button-height: 26px;
  --app-button-min-width: 0;
  --app-button-padding-x: 8px;
  --app-button-gap: 5px;
  --app-button-font-size: 12px;
  --app-button-hover-fill: var(--ui-status-danger-bg, transparent);
  --app-button-hover-fg: var(--ui-status-danger-fg, #ef4444);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid var(--ui-status-danger-border, var(--ui-border-default-border, var(--border)));
  border-radius: 8px;
  background: var(--ui-status-danger-bg, transparent);
  color: var(--ui-status-danger-fg, #ef4444);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.voice-capture-stop:hover {
  background: var(--ui-status-danger-bg, transparent);
}

@keyframes attachment-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes voice-wave {
  0%, 100% { height: 5px; opacity: 0.58; }
  50% { height: 15px; opacity: 1; }
}

/* Bottom toolbar: a segmented status line — full-bleed cells split by
   hairline dividers, annotated in mono. */
.composer-toolbar {
  --composer-cell-divider: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 30%, transparent);

  display: flex;
  justify-content: space-between;
  align-items: stretch;
  min-height: 34px;
  margin: 2px 0 0;
  padding: 0;
  border-top: 1px solid var(--composer-border);
  gap: 0;
  user-select: none;
  container-type: inline-size;
}

/* Narrow composer: the ctx cell-blocks are the first ballast overboard,
   keeping every textual cell readable. (The extra selector depth outranks
   the base display rule declared later in this file.) */
@container (max-width: 600px) {
  .toolbar-left .context-meter .context-meter-cells {
    display: none;
  }
}

/* Model cell: the trigger fills its cell like the selects do (cell-fill
   rules below); rest state stays bare mono text. */
.toolbar-left :deep(.model-trigger) {
  height: 100%;
  padding: 0 11px;
  border-radius: 0;
  background: transparent;
}

.toolbar-left :deep(.model-trigger:hover),
.toolbar-left :deep(.model-trigger.is-open) {
  background: var(--ui-state-hover-bg, var(--hover));
}

.toolbar-left {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.toolbar-left > * {
  display: flex;
  align-items: stretch;
  /* Cells keep their intrinsic width; a narrow composer clips the row at
     the right edge instead of squeezing every cell into ellipsis. The
     horizontal padding lives on the control inside (see the cell-fill
     rules below) so its hover paints the cell edge-to-edge. */
  flex-shrink: 0;
  padding: 0;
  border-right: 1px solid var(--composer-cell-divider);
}

.toolbar-right {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
}

.toolbar-right > * {
  display: flex;
  align-items: center;
  border-left: 1px solid var(--composer-cell-divider);
}

/* Cell-fill: each cell holds exactly one control; stretch it (through any
   tooltip/select wrappers) to the cell edges so hovering anywhere in the
   cell highlights the whole cell — the same affordance as the voice/send
   cells on the right. Rest state stays bare mono text. */
.toolbar-left :deep(.tooltip-wrapper),
.toolbar-left :deep(.app-select) {
  display: inline-flex;
  align-items: stretch;
  height: 100%;
}

.toolbar-left :deep(.app-select-control) {
  height: 100%;
  padding: 0 11px;
  border-radius: 0;
  background: transparent;
}

.toolbar-left :deep(.app-select-control:hover),
.toolbar-left :deep(.app-select.is-open .app-select-control) {
  background: var(--ui-state-hover-bg, var(--hover));
  box-shadow: none;
}

/* Select roots are width:100%, which degenerates inside auto-width cells;
   size them to their (nowrap) content instead. The think selector also
   self-measures a width that doesn't know about the "think:" prefix. */
.toolbar-left .permission-mode-select,
.toolbar-left .thinking-control :deep(.think-select) {
  width: max-content;
}

/* Cell dividers on the right-side buttons: their own `border: 0` resets
   would otherwise erase the shared cell rule. */
.toolbar-right > .voice-btn,
.toolbar-right > .send-btn {
  border: 0;
  border-left: 1px solid var(--composer-cell-divider);
}

/* The SEND label rides in the icon slot, so the Button component squares
   the button to its height (is-icon-only) and clips the text; size it to
   the label like every other cell. */
.toolbar-right > .send-btn.app-button {
  width: auto;
  min-width: 0;
}

.toolbar-left :deep(.model-text),
.toolbar-left :deep(.think-value),
.guard-label {
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  font-weight: 600;
}

/* think cell reads "think:high" — drop the brain glyph, prefix the value. */
.toolbar-left :deep(.think-select .app-select-prefix) {
  display: none;
}

.toolbar-left :deep(.think-value) {
  text-transform: lowercase;
}

.toolbar-left :deep(.think-value)::before {
  content: 'think:';
}

.guard-label {
  color: var(--ui-text-muted-fg, var(--muted));
  white-space: nowrap;
}


/* Resident gauge as a mono cell-meter: ctx ▮▮▮▮▯▯▯▯▯▯ 37%.
   Warning thresholds recolor the filled cells, never resize. */
.context-meter {
  --context-meter-fg: var(--ui-text-muted-fg, var(--muted));
  --context-meter-cell: var(--ui-accent-primary-fg, var(--accent));

  position: relative;
  height: 100%;
  padding: 0 11px;
  border: 0;
  background: transparent;
  color: var(--context-meter-fg);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  transition: color 0.16s ease, background 0.16s ease;
}

.context-meter.is-empty {
  --context-meter-fg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 80%, transparent);
}

.context-meter.is-medium {
  --context-meter-cell: var(--ui-status-warning-fg, var(--text-warning));
}

.context-meter.is-high {
  --context-meter-cell: var(--ui-status-danger-fg, var(--text-error));
  --context-meter-fg: var(--ui-status-danger-fg, var(--text-error));
}

.context-meter:hover {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
}

.context-meter-prefix {
  font-size: 11.5px;
  letter-spacing: 0.5px;
}

.context-meter-cells {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 9px;
  letter-spacing: 0;
  line-height: 1;
}

.context-meter-cells i {
  font-style: normal;
  color: var(--context-meter-cell);
}

.context-meter-cells em {
  font-style: normal;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
}

.context-meter-label {
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  line-height: 1;
  white-space: nowrap;
}


/*
 * Status-line cell: mode is spelled out as mono text ("guard:normal");
 * auto-edit/danger recolor the label.
 */
.permission-mode-select {
  --permission-mode-fg: var(--ui-text-muted-fg, var(--muted));
  --permission-mode-fg-hover: var(--ui-text-primary-fg, var(--text));

  width: auto;
  flex: 0 0 auto;
}

.permission-mode-select.mode-auto-accept-edits .guard-label {
  color: var(--ui-status-success-fg, var(--text-success));
}

.permission-mode-select.mode-dangerously-allow-all .guard-label {
  color: var(--ui-status-warning-fg, var(--text-warning));
}

.permission-mode-select :deep(.app-select-control) {
  gap: 0;
  justify-content: center;
  border-color: transparent;
  color: var(--permission-mode-fg);
}

.permission-mode-select :deep(.app-select-suffix) {
  display: none;
}

/* The selection wrapper is flex:1 inside the control; without this the
   icon-only label hugs the left edge instead of centering. */
.permission-mode-select :deep(.app-select-selection) {
  justify-content: center;
}

.permission-mode-select :deep(.app-select-control:hover),
.permission-mode-select.is-open :deep(.app-select-control) {
  color: var(--permission-mode-fg-hover);
  border-color: transparent;
}

/* Suppress the base Select :focus ring — the guard cell is a subtle
   mono label, not a form input; its hover / is-open affordances are
   enough.  A lingering focus ring after click looks stuck. */
.permission-mode-select :deep(.app-select-control:focus),
.permission-mode-select :deep(.app-select-control:focus-visible) {
  color: var(--permission-mode-fg);
  border-color: transparent;
  box-shadow: none;
}

:global(.inputbox-select-dropdown) {
  --inputbox-select-panel-bg: var(--ui-surface-menu-bg, var(--ui-surface-overlay-bg, var(--ui-surface-input-bg, var(--bg-input, #282c34))));
  --inputbox-select-row-fg: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary, var(--text))) 88%, var(--ui-text-primary-fg, var(--text)) 12%);
  --inputbox-select-row-muted-fg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 84%, var(--ui-text-primary-fg, var(--text)) 16%);
  --inputbox-select-row-muted-active-fg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 64%, var(--ui-text-primary-fg, var(--text)) 36%);
  --inputbox-select-row-hover-bg: var(--ui-state-hover-bg, var(--hover, #2a303b));
  --inputbox-select-row-hover-fg: var(--ui-text-primary-fg, var(--text));
  --inputbox-select-row-selected-bg: var(--ui-state-selected-bg, var(--bg-selected, var(--ui-state-hover-bg, var(--hover, #2a303b))));
  --inputbox-select-row-selected-fg: var(--ui-state-selected-fg, var(--ui-text-primary-fg, var(--text, #f4f4f5)));
  --inputbox-select-row-selected-hover-bg: var(--ui-state-selected-hover-bg, var(--ui-state-active-bg, var(--active, var(--inputbox-select-row-selected-bg))));
  --inputbox-select-row-selected-border: var(--ui-state-selected-border, var(--ui-border-selected-border, var(--ui-accent-subtle-fg, var(--ui-accent-primary-fg, var(--accent, #60a5fa)))));
  --inputbox-select-check-fg: var(--ui-accent-subtle-fg, var(--ui-accent-primary-fg, var(--accent, #60a5fa)));
  --inputbox-select-chip-bg: color-mix(in srgb, var(--inputbox-select-row-hover-bg) 72%, transparent);
  --inputbox-select-chip-bg-active: color-mix(in srgb, var(--inputbox-select-row-selected-hover-bg) 82%, transparent);
  --inputbox-select-chip-fg: var(--inputbox-select-row-muted-active-fg);

  padding: 6px;
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border, #3b4250)) 76%, var(--ui-text-primary-fg, var(--text, #f4f4f5)) 8%);
  border-radius: 12px;
  background: var(--inputbox-select-panel-bg);
  background-clip: padding-box;
  box-shadow:
    0 18px 46px rgba(0, 0, 0, 0.34),
    0 0 0 1px rgba(255, 255, 255, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

:global(.app-select-dropdown.inputbox-select-dropdown.think-select-dropdown),
:global(.app-select-dropdown.inputbox-select-dropdown.permission-mode-dropdown) {
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border, #3b4250)) 76%, var(--ui-text-primary-fg, var(--text, #f4f4f5)) 8%);
  background: var(--inputbox-select-panel-bg);
}

:global(.inputbox-select-dropdown .app-select-group-label) {
  padding: 7px 8px 4px;
  color: var(--inputbox-select-row-muted-active-fg);
  font-size: 10.5px;
  font-weight: 760;
  letter-spacing: 0;
}

:global(.app-select-dropdown.inputbox-select-dropdown .app-select-option) {
  min-height: 32px;
  border-radius: 8px;
  color: var(--inputbox-select-row-fg);
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
}

:global(.app-select-dropdown.inputbox-select-dropdown .app-select-option:hover),
:global(.app-select-dropdown.inputbox-select-dropdown .app-select-option.highlighted) {
  color: var(--inputbox-select-row-hover-fg);
  background: var(--inputbox-select-row-hover-bg);
}

:global(.app-select-dropdown.inputbox-select-dropdown .app-select-option.selected) {
  color: var(--inputbox-select-row-selected-fg);
  background: var(--inputbox-select-row-selected-bg);
}

:global(.app-select-dropdown.inputbox-select-dropdown .app-select-option.selected:hover),
:global(.app-select-dropdown.inputbox-select-dropdown .app-select-option.selected.highlighted) {
  color: var(--inputbox-select-row-selected-fg);
  background: var(--inputbox-select-row-selected-hover-bg);
}

:global(.inputbox-select-dropdown .app-select-option .app-select-option-check),
:global(.inputbox-select-dropdown .app-select-option .think-option-check) {
  color: var(--inputbox-select-check-fg);
}

:global(.inputbox-select-dropdown .app-select-option.selected .app-select-option-check),
:global(.inputbox-select-dropdown .app-select-option.selected .think-option-check) {
  color: var(--inputbox-select-row-selected-border);
}

:global(.inputbox-select-dropdown .app-select-empty) {
  color: var(--inputbox-select-row-muted-fg);
}

:global(.inputbox-select-dropdown .app-select-option .model-option-name),
:global(.inputbox-select-dropdown .app-select-option .think-option-text),
:global(.inputbox-select-dropdown .app-select-option .app-select-option-label) {
  color: var(--ui-text-primary-fg, var(--text));
}

:global(.inputbox-select-dropdown .app-select-option.selected .model-option-name),
:global(.inputbox-select-dropdown .app-select-option.selected .think-option-text),
:global(.inputbox-select-dropdown .app-select-option.selected .app-select-option-label) {
  color: var(--inputbox-select-row-selected-fg);
}

:global(.inputbox-select-dropdown .app-select-option .model-option-id),
:global(.inputbox-select-dropdown .app-select-option .think-option-description) {
  color: var(--inputbox-select-row-muted-fg);
}

:global(.inputbox-select-dropdown .app-select-option .model-option-meta) {
  max-width: min(220px, 58%);
}

:global(.inputbox-select-dropdown .app-select-option:hover .model-option-id),
:global(.inputbox-select-dropdown .app-select-option.highlighted .model-option-id),
:global(.inputbox-select-dropdown .app-select-option.selected .model-option-id),
:global(.inputbox-select-dropdown .app-select-option:hover .think-option-description),
:global(.inputbox-select-dropdown .app-select-option.highlighted .think-option-description),
:global(.inputbox-select-dropdown .app-select-option.selected .think-option-description) {
  color: var(--inputbox-select-row-muted-active-fg);
}

:global(.inputbox-select-dropdown .app-select-option .model-context),
:global(.inputbox-select-dropdown .app-select-option .model-badge) {
  color: var(--inputbox-select-chip-fg);
  background: var(--inputbox-select-chip-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--inputbox-select-check-fg) 14%, transparent);
}

:global(.inputbox-select-dropdown .app-select-option .model-context) {
  font-family: var(--font-mono, monospace);
}

:global(.inputbox-select-dropdown .app-select-option.selected .model-context),
:global(.inputbox-select-dropdown .app-select-option.selected .model-badge),
:global(.inputbox-select-dropdown .app-select-option:hover .model-context),
:global(.inputbox-select-dropdown .app-select-option:hover .model-badge),
:global(.inputbox-select-dropdown .app-select-option.highlighted .model-context),
:global(.inputbox-select-dropdown .app-select-option.highlighted .model-badge) {
  color: var(--inputbox-select-row-selected-fg);
  background: var(--inputbox-select-chip-bg-active);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--inputbox-select-row-selected-border) 24%, transparent);
}

:global(.app-select-dropdown.inputbox-select-dropdown.think-select-dropdown .app-select-option) {
  padding-block: 5px;
}

:global(.app-select-dropdown.inputbox-select-dropdown.permission-mode-dropdown .app-select-option-label) {
  font-size: 12px;
  font-weight: 650;
}

.voice-btn {
  --app-button-height: 29px;
  --app-button-min-width: 29px;
  --app-button-padding-x: 0;
  --app-button-fill: transparent;
  --app-button-fg: var(--ui-text-muted-fg, var(--muted));
  --app-button-border: transparent;
  --app-button-hover-fill: var(--ui-state-hover-bg, var(--hover));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-hover-border: transparent;
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: auto;
  height: 100%;
  padding: 0 12px;
  border-radius: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
}

.voice-btn:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
}

.voice-btn.needs-setup {
  color: var(--ui-accent-primary-fg, var(--accent));
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 38%, var(--ui-border-default-border, var(--border)));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, var(--ui-state-hover-bg, var(--hover)));
}

.voice-btn.needs-setup:hover {
  color: var(--ui-accent-primary-fg, var(--accent));
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 56%, var(--ui-border-default-border, var(--border)));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 16%, var(--ui-state-hover-bg, var(--hover)));
}

.voice-btn.active {
  color: var(--ui-status-danger-fg, #ef4444);
  border-color: var(--ui-status-danger-border, var(--ui-border-default-border, var(--border)));
  background: var(--ui-status-danger-bg, transparent);
  box-shadow: var(--ui-status-danger-ring-shadow, 0 0 0 4px var(--ui-status-danger-bg, transparent));
}

.voice-btn.transcribing {
  color: var(--ui-accent-primary-fg, var(--accent));
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 42%, var(--ui-border-default-border, var(--border)));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 9%, transparent);
}

.voice-spinner {
  animation: attachment-spin 0.8s linear infinite;
}

.voice-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Send button */
.send-btn {
  --app-button-height: 26px;
  --app-button-min-width: 0;
  --app-button-padding-x: 9px;
  --app-button-hover-fill: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
  --app-button-hover-fg: var(--ui-accent-primary-fg, var(--accent));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  height: 100%;
  min-width: 0;
  padding: 0 14px;
  border-radius: 0;
  border: 0;
  background: transparent;
  color: var(--ui-accent-primary-fg, var(--accent));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, color 0.16s ease;
  flex-shrink: 0;
  box-shadow: none;
}

.send-label {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  line-height: 1;
  white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
}

.send-btn:active:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 18%, transparent);
}

/* Keep border-color untouched: the cell divider between mic and send lives
   on this button's border-left and must survive the disabled state. */
.send-btn:disabled {
  background: transparent;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 50%, transparent);
  cursor: default;
  box-shadow: none;
}

.send-btn.stop-btn {
  --app-button-hover-fill: var(--ui-state-hover-bg, var(--hover));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));

  background: transparent;
  box-shadow: none;
  color: var(--ui-action-ghost-fg, var(--muted));
}

.send-btn.stop-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.send-btn.stop-btn:active {
  background: var(--ui-state-active-bg, var(--active));
}

/* Responsive styles */
@media (max-width: 768px) {
  .composer { border-radius: var(--radius-xs, 4px); }
  .composer-input { font-size: 15px; }
}

@media (max-width: 480px) {
  .composer { border-radius: var(--radius-xs, 4px); }
  .input-area { padding: 8px 10px 0; }
  .composer-toolbar { padding: 0; }
  .composer-input { font-size: 15px; }
  .voice-capture-bar {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    margin: 0 8px 6px;
  }
  .voice-capture-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}
</style>
