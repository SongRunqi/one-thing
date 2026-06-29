<template>
  <div
    ref="composerWrapperRef"
    class="composer-wrapper"
    :class="{
      'has-extension': activeExtensionVisible,
      'command-palette-open': activeExtension.type === 'palette',
    }"
  >
    <TransitionGroup
      v-if="queuedMessages.length > 0"
      name="queued-message"
      tag="div"
      class="queued-messages"
      :class="{ 'has-file-changes': !!queuedFileChanges }"
    >
      <div
        v-if="queuedFileChanges"
        key="queued-file-changes"
        class="queued-file-changes-row"
      >
        <div class="queued-file-changes-summary">
          <span>{{ changedFilesLabel(queuedFileChanges.fileCount) }}</span>
          <span class="queued-file-additions">+{{ queuedFileChanges.additions }}</span>
          <span class="queued-file-deletions">-{{ queuedFileChanges.deletions }}</span>
        </div>
        <Button
          text
          size="small"
          class="queued-review-btn"
          native-type="button"
          title="Review file changes"
          @click.stop="reviewQueuedFileChanges"
        >
          Review
        </Button>
      </div>

      <div
        v-for="item in queuedMessages"
        :key="item.id"
        class="queued-message-card"
        :class="{ 'has-files': !!item.attachments?.length || hasQueuedFileChanges(item) }"
      >
        <span
          class="queued-message-marker"
          aria-hidden="true"
        >
          <CornerDownRight
            class="queued-message-icon"
            :size="15"
            :stroke-width="2"
          />
        </span>

        <div class="queued-message-body">
          <span class="queued-message-label">Insert message</span>
          <span class="queued-message-separator">·</span>
          <span
            class="queued-message-text"
            :class="{ empty: !item.content }"
          >
            {{ queuedMessagePreview(item) }}
          </span>
          <span
            v-if="queuedFileSummary(item)"
            class="queued-file-summary"
            :class="{ 'is-diff': hasQueuedFileChanges(item) }"
            :title="queuedFileSummaryTitle(item)"
          >
            <span class="queued-message-separator">·</span>
            <GitCompare
              v-if="hasQueuedFileChanges(item)"
              :size="13"
              :stroke-width="2"
            />
            <FileText
              v-else
              :size="13"
              :stroke-width="2"
            />
            <span>{{ queuedFileSummary(item) }}</span>
          </span>
        </div>

        <div class="queued-message-actions">
          <Button
            text
            size="small"
            class="queued-message-action"
            native-type="button"
            :disabled="!!item.attachments?.length"
            :title="item.attachments?.length ? 'File messages will send after the current response' : 'Steer the current agent response with this message'"
            @click.stop="steerQueuedMessage(item.id)"
          >
            <template #icon>
              <CornerDownRight
                :size="15"
                :stroke-width="2"
              />
            </template>
            Steer
          </Button>
          <Button
            text
            circle
            class="queued-message-icon-btn"
            native-type="button"
            title="Remove from queue"
            aria-label="Remove from queue"
            :icon="Trash2"
            @click.stop="removeQueuedMessage(item.id)"
          />
        </div>
      </div>
    </TransitionGroup>

    <div class="composer-stack">
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
        :class="{
          focused: isFocused,
          'extension-open': activeExtensionVisible,
          'command-mode': activeExtension.type === 'palette',
        }"
        @click="focusEditor"
      >
        <div
          v-if="quotedText || commandFeedback"
          class="composer-context-stack"
          @click.stop
        >
          <Transition name="fade">
            <div
              v-if="commandFeedback"
              :class="['command-feedback', commandFeedback.type]"
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

          <QuotedContext
            :text="quotedText"
            @clear="clearQuotedText"
          />
        </div>

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

        <div
          v-if="attachedFiles.length > 0 || isProcessingAttachments"
          class="attachment-tray"
          @click.stop
        >
          <div
            v-for="file in attachedFiles"
            :key="file.id"
            class="attachment-chip"
            :class="{ 'is-image': file.mediaType === 'image' }"
            :title="`${file.fileName} (${formatFileSize(file.size)})`"
          >
            <img
              v-if="file.mediaType === 'image' && file.preview"
              class="attachment-thumb"
              :src="file.preview"
              :alt="file.fileName"
            >
            <span
              v-else
              class="attachment-file-icon"
            >
              <FileText :size="15" />
            </span>
            <span class="attachment-info">
              <span class="attachment-name">{{ file.fileName }}</span>
              <span class="attachment-size">{{ formatFileSize(file.size) }}</span>
            </span>
            <Button
              text
              circle
              class="attachment-remove"
              native-type="button"
              :title="`Remove ${file.fileName}`"
              :aria-label="`Remove ${file.fileName}`"
              :icon="X"
              @mousedown.prevent
              @click.stop="removeAttachment(file.id)"
            />
          </div>
          <div
            v-if="isProcessingAttachments"
            class="attachment-chip is-loading"
          >
            <Loader2
              class="attachment-spinner"
              :size="15"
            />
            <span>Reading files...</span>
          </div>
        </div>

        <!-- Bottom toolbar -->
        <div class="composer-toolbar">
          <div class="toolbar-left">
            <ModelSelector :session-id="props.sessionId" />
            <Tooltip
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
                @click.stop="openContextInspector"
              >
                <span class="context-meter-fill" />
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
              :model-value="permissionMode"
              :options="PERMISSION_MODE_OPTIONS"
              :popper-style="permissionDropdownStyle"
              aria-label="Permission mode"
              :title="`Permission mode: ${permissionModeLabel}. Press Shift+Tab to switch.`"
              @click.stop
              @change="handlePermissionModeChange"
            />
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
              <template #icon>
                <Send
                  v-if="!shouldShowStopAction"
                  :size="18"
                  :stroke-width="2"
                />
                <Square
                  v-else
                  :size="16"
                  fill="currentColor"
                  :stroke-width="0"
                />
              </template>
            </Button>
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
// Sub-components
import QuotedContext from './QuotedContext.vue'
import CommandPicker from './CommandPicker.vue'
import FilePicker from './FilePicker.vue'
import PathPicker from './PathPicker.vue'
import ModelSelector from './ModelSelector.vue'
import ThinkToggle from './ThinkToggle.vue'
import { X, Square, Send, Check, CornerDownRight, Trash2, FileText, Loader2, Mic, GitCompare } from 'lucide-vue-next'
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

interface QueuedMessage {
  id: string
  content: string
  attachments?: MessageAttachment[]
}

interface QueuedFileChangeSummary {
  fileCount: number
  additions: number
  deletions: number
  selectedStepId?: string
}

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
  activeExtensionVisible,
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isPatchLikeFile(file: MessageAttachment): boolean {
  return /\.(diff|patch)$/i.test(file.fileName) || /(?:x-)?(?:diff|patch)/i.test(file.mimeType)
}

function hasDiffLikeContent(content: string): boolean {
  return /^(diff --git|@@\s|[-+]{3}\s[ab]\/)/m.test(content)
}

function hasQueuedFileChanges(item: QueuedMessage): boolean {
  return hasDiffLikeContent(item.content) || !!item.attachments?.some(isPatchLikeFile)
}

function changedFilesLabel(fileCount: number): string {
  return fileCount === 1 ? '1 file changed' : `${fileCount} files changed`
}

function parseDiffStats(diff: string): { additions: number; deletions: number; fileCount: number } {
  if (!diff) return { additions: 0, deletions: 0, fileCount: 0 }
  let additions = 0
  let deletions = 0
  let fileCount = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) fileCount += 1
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1
    if (line.startsWith('-') && !line.startsWith('---')) deletions += 1
  }

  return {
    additions,
    deletions,
    fileCount: fileCount || (additions || deletions ? 1 : 0),
  }
}

function decodeAttachmentText(file: MessageAttachment): string {
  if (!file.base64Data) return ''
  try {
    return globalThis.atob(file.base64Data)
  } catch {
    return ''
  }
}

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

function openContextInspector() {
  chatStore.openInspectorToTab?.('context')
}

function queuedMessagePreview(item: QueuedMessage): string {
  const text = item.content.trim().replace(/\s+/g, ' ')
  if (text) return text
  if (item.attachments?.length) return 'Files only'
  return 'Queued'
}

function queuedFileSummary(item: QueuedMessage): string {
  const attachments = item.attachments ?? []
  if (hasQueuedFileChanges(item)) {
    if (attachments.length === 0) return 'File changes'
    if (attachments.length === 1) return `File changes · ${attachments[0].fileName}`
    return `${attachments.length} files changed`
  }
  if (attachments.length === 0) return ''
  if (attachments.length === 1) return `1 file attached · ${attachments[0].fileName}`
  return `${attachments.length} files attached`
}

function queuedFileSummaryTitle(item: QueuedMessage): string {
  const attachments = item.attachments ?? []
  if (attachments.length === 0) return queuedFileSummary(item)
  return attachments
    .map(file => `${file.fileName} (${formatFileSize(file.size)})`)
    .join('\n')
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
      void window.electronAPI.openSettingsWindow()
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
      void window.electronAPI.openSettingsWindow()
      return {
        success: false,
        error: 'Add an OpenRouter API key in Voice settings.',
      }
    }
  }

  if (nextVoice.asr.provider === 'funasr-server' && !nextVoice.asr.funasr.url.trim()) {
    void window.electronAPI.openSettingsWindow()
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
  width: var(--chat-composer-width, var(--chat-content-width, min(70%, 740px)));
  margin: 0 var(--chat-content-column-right, auto) 0 var(--chat-content-column-left, auto);
  position: relative;
}

.composer-wrapper.has-extension {
  --composer-stack-divider: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 24%, transparent);
  --composer-stack-top-highlight: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 1.2%, transparent);
}

.composer-stack {
  position: relative;
  width: 100%;
}

.composer-context-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 0;
}

.command-feedback {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  max-width: 100%;
  padding: 6px 10px;
  border: 0.5px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 48%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  line-height: 1.3;
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

.queued-messages {
  --queued-row-bg: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg-panel, var(--bg)))) 30%, transparent);
  --queued-row-border: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 38%, transparent);
  --queued-row-fg: var(--ui-text-primary-fg, var(--text));
  --queued-row-muted: var(--ui-text-muted-fg, var(--muted));
  --queued-row-faint: var(--ui-text-faint-fg, var(--muted));
  --queued-row-accent: var(--ui-accent-primary-fg, var(--accent));
  --queued-row-hover: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 54%, transparent);

  display: flex;
  flex-direction: column;
  gap: 0;
  width: calc(100% - 96px);
  margin: 0 auto 6px;
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.queued-messages:empty {
  display: none;
  margin: 0;
}

.queued-file-changes-row,
.queued-message-card {
  border: 0.5px solid var(--queued-row-border);
  border-bottom: 0;
  background: var(--queued-row-bg);
}

.queued-messages > :first-child {
  border-top-left-radius: var(--radius-md, 12px);
  border-top-right-radius: var(--radius-md, 12px);
}

.queued-messages > :last-child {
  border-bottom: 0.5px solid var(--queued-row-border);
  border-bottom-right-radius: var(--radius-md, 12px);
  border-bottom-left-radius: var(--radius-md, 12px);
}

.queued-file-changes-row {
  min-height: 42px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 7px 14px;
  color: var(--queued-row-muted);
  pointer-events: auto;
}

.queued-file-changes-summary {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  overflow: hidden;
  font-size: 15px;
  line-height: 1.25;
  white-space: nowrap;
}

.queued-file-additions {
  color: var(--diff-add-text, var(--ui-status-success-fg, var(--text-success)));
}

.queued-file-deletions {
  color: var(--diff-del-text, var(--ui-status-danger-fg, var(--text-error)));
}

.queued-review-btn {
  --app-button-height: 28px;
  --app-button-min-width: 0;
  --app-button-padding-x: 8px;
  --app-button-font-size: 14px;
  --app-button-hover-fill: var(--queued-row-hover);
  --app-button-hover-fg: var(--queued-row-fg);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--queued-row-fg);
  font: inherit;
  font-size: 14px;
  font-weight: 520;
  cursor: pointer;
}

.queued-review-btn:hover {
  background: var(--queued-row-hover);
}

.queued-message-card {
  min-height: 38px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 5px 9px 5px 14px;
  color: var(--queued-row-muted);
  pointer-events: auto;
}

.queued-message-marker {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs, 4px);
  color: color-mix(in srgb, var(--queued-row-accent) 76%, var(--queued-row-muted));
}

.queued-message-icon {
  flex-shrink: 0;
}

.queued-message-body {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.25;
}

.queued-message-label {
  flex: 0 0 auto;
  color: var(--queued-row-fg);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
}

.queued-message-separator {
  flex: 0 0 auto;
  color: var(--queued-row-faint);
  font-size: 12px;
  line-height: 1.25;
}

.queued-message-text {
  min-width: 0;
  overflow: hidden;
  color: var(--queued-row-muted);
  font-size: 13px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queued-message-text.empty {
  color: var(--queued-row-faint);
  font-style: italic;
}

.queued-file-summary {
  flex: 0 10000 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--queued-row-faint);
  font-size: 11px;
  font-weight: 560;
  line-height: 1.25;
}

.queued-file-summary.is-diff {
  color: color-mix(in srgb, var(--diff-add-text, var(--ui-status-success-fg, var(--text-success))) 70%, var(--queued-row-muted));
}

.queued-file-summary span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queued-message-action,
.queued-message-icon-btn {
  --app-button-height: 26px;
  --app-button-min-width: 0;
  --app-button-padding-x: 6px;
  --app-button-gap: 5px;
  --app-button-font-size: 12.5px;
  --app-button-hover-fill: var(--queued-row-hover);
  --app-button-hover-fg: var(--queued-row-fg);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  border: 0;
  background: transparent;
  color: var(--queued-row-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs, 4px);
  transition: background 0.16s ease, color 0.16s ease;
}

.queued-message-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.queued-message-action {
  gap: 5px;
  height: 26px;
  padding: 0 6px;
  font: inherit;
  font-size: 12.5px;
  white-space: nowrap;
}

.queued-message-icon-btn {
  --app-button-min-width: 26px;
  --app-button-padding-x: 0;

  width: 26px;
  height: 26px;
}

.queued-message-action:hover,
.queued-message-icon-btn:hover {
  background: var(--queued-row-hover);
  color: var(--queued-row-fg);
}

.queued-message-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.queued-message-enter-active,
.queued-message-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.queued-message-enter-from,
.queued-message-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Main composer container */
.composer {
  --composer-surface: color-mix(in srgb, var(--ui-surface-input-bg, var(--bg-input, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg))))) 44%, var(--ui-surface-chat-bg, var(--bg-chat, var(--bg))) 56%);
  --composer-border: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 36%, transparent);

  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 0.5px solid var(--composer-border);
  background: var(--composer-surface);
  box-shadow: var(
    --ui-surface-composer-shadow,
    0 1px 3px rgba(0, 0, 0, 0.03),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 1.8%, transparent)
  );
  backdrop-filter: blur(4px) saturate(1.01);
  -webkit-backdrop-filter: blur(4px) saturate(1.01);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  overflow: hidden;
}

.composer.focused {
  border-color: color-mix(
    in srgb,
    var(--ui-surface-input-focus-border, var(--ui-state-focus-border, var(--ui-accent-primary-fg, var(--accent)))) 14%,
    var(--composer-border)
  );
  background: color-mix(in srgb, var(--composer-surface) 92%, var(--ui-surface-input-focus-bg, var(--bg-input-focus, var(--composer-surface))) 8%);
  box-shadow: var(
    --ui-surface-composer-focus-shadow,
    0 1px 5px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 2.2%, transparent),
    0 0 0 1px color-mix(in srgb, var(--ui-state-focus-ring, var(--ui-accent-primary-fg, var(--accent))) 4.5%, transparent)
  );
}

.composer.extension-open {
  border-top-color: var(--composer-stack-divider, var(--composer-border));
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  box-shadow: var(
    --ui-surface-composer-shadow,
    0 1px 3px rgba(0, 0, 0, 0.03),
    inset 0 1px 0 var(--composer-stack-top-highlight)
  );
}

.composer.command-mode.extension-open {
  border-top-color: var(--composer-border);
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  box-shadow: var(
    --ui-surface-composer-shadow,
    0 1px 3px rgba(0, 0, 0, 0.03),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 1.8%, transparent)
  );
}

.composer.command-mode.extension-open.focused {
  border-color: color-mix(
    in srgb,
    var(--ui-surface-input-focus-border, var(--ui-state-focus-border, var(--ui-accent-primary-fg, var(--accent)))) 14%,
    var(--composer-border)
  );
  box-shadow: var(
    --ui-surface-composer-focus-shadow,
    0 1px 5px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 2.2%, transparent),
    0 0 0 1px color-mix(in srgb, var(--ui-state-focus-ring, var(--ui-accent-primary-fg, var(--accent))) 4.5%, transparent)
  );
}

.composer-context-stack :deep(.quoted-context) {
  margin-bottom: 0;
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
  min-height: 42px;
}

.attachment-tray {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 12px 8px;
  min-height: 44px;
}

.attachment-tray::-webkit-scrollbar {
  height: 4px;
}

.attachment-tray::-webkit-scrollbar-track {
  background: transparent;
}

.attachment-tray::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

.attachment-chip {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  width: min(230px, 68vw);
  height: 42px;
  padding: 5px 6px 5px 5px;
  border: 0.5px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 48%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.attachment-chip.is-loading {
  grid-template-columns: auto 1fr;
  width: auto;
  padding: 5px 10px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 13px;
}

.attachment-thumb,
.attachment-file-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
}

.attachment-thumb {
  object-fit: cover;
  background: var(--ui-state-disabled-bg, var(--bg-muted));
}

.attachment-file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-muted-fg, var(--muted));
}

.attachment-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.attachment-name,
.attachment-size {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-name {
  font-size: 12px;
  line-height: 1.25;
}

.attachment-size {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.attachment-remove {
  --app-button-height: 22px;
  --app-button-min-width: 22px;
  --app-button-padding-x: 0;
  --app-button-hover-fill: var(--ui-state-hover-bg, var(--hover));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.attachment-remove:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.attachment-spinner {
  animation: attachment-spin 0.8s linear infinite;
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

/* Bottom toolbar */
.composer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 8px 6px;
  gap: 6px;
  user-select: none;
}

.toolbar-left {
  display: grid;
  grid-template-columns: minmax(0, max-content) max-content max-content max-content;
  align-items: center;
  column-gap: 6px;
  flex: 1;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.context-meter {
  --context-meter-track: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 42%, transparent);
  --context-meter-ring: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 68%, var(--ui-text-muted-fg, var(--muted)));
  --context-meter-center: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 88%, transparent);
  --context-meter-fg: var(--ui-text-muted-fg, var(--muted));

  position: relative;
  width: 29px;
  height: 29px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: conic-gradient(var(--context-meter-ring) var(--context-meter-progress, 0%), var(--context-meter-track) 0);
  color: var(--context-meter-fg);
  cursor: pointer;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  transition: color 0.16s ease, filter 0.16s ease, transform 0.16s ease;
}

.context-meter.is-empty {
  --context-meter-ring: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 38%, transparent);
  --context-meter-fg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 80%, transparent);
}

.context-meter.is-medium {
  --context-meter-ring: var(--ui-status-warning-fg, var(--text-warning, #d97706));
  --context-meter-fg: var(--ui-status-warning-fg, var(--text-warning, #d97706));
}

.context-meter.is-high {
  --context-meter-ring: var(--ui-status-danger-fg, var(--text-error, #ef4444));
  --context-meter-fg: var(--ui-status-danger-fg, var(--text-error, #ef4444));
}

.context-meter:hover {
  color: var(--ui-text-primary-fg, var(--text));
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.context-meter-fill {
  position: absolute;
  inset: 3px;
  border-radius: inherit;
  background: var(--context-meter-center);
  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--ui-border-default-border, var(--border)) 28%, transparent);
}

.context-meter-label {
  position: relative;
  z-index: 1;
  max-width: 23px;
  overflow: hidden;
  font-size: 9px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1;
  text-align: center;
  text-overflow: clip;
  white-space: nowrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.permission-mode-select {
  --permission-mode-fg: var(--ui-text-muted-fg, var(--muted));
  --permission-mode-fg-hover: var(--ui-text-primary-fg, var(--text));
  --permission-mode-border: var(--ui-border-default-border, var(--border));
  --permission-mode-border-hover: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 35%, var(--ui-border-default-border, var(--border)));
  --permission-mode-bg: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 88%, transparent);

  width: 98px;
  flex: 0 0 auto;
}

.permission-mode-select :deep(.app-select-control) {
  min-height: 28px;
  gap: 5px;
  padding: 3px 7px 3px 8px;
  border-radius: 999px;
  border-color: var(--permission-mode-border);
  background: var(--permission-mode-bg);
  color: var(--permission-mode-fg);
  font-size: 11px;
  font-weight: 650;
}

.permission-mode-select :deep(.app-select-single-value) {
  color: var(--permission-mode-fg);
  font-size: 11px;
  font-weight: 650;
}

.permission-mode-select :deep(.app-select-control:hover),
.permission-mode-select.is-open :deep(.app-select-control) {
  color: var(--permission-mode-fg-hover);
  border-color: var(--permission-mode-border-hover);
  background: var(--permission-mode-bg);
  box-shadow: none;
}

.permission-mode-select.mode-auto-accept-edits {
  --permission-mode-fg: var(--ui-status-success-fg, var(--text-success));
  --permission-mode-border: var(--ui-status-success-border, var(--border-success));
  --permission-mode-bg: var(--ui-status-success-bg, transparent);
}

.permission-mode-select.mode-dangerously-allow-all {
  --permission-mode-fg: var(--ui-status-warning-fg, var(--text-warning));
  --permission-mode-border: var(--ui-status-warning-border, var(--color-warning));
  --permission-mode-bg: var(--ui-status-warning-bg, transparent);
}

/* Toolbar buttons */
.toolbar-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.toolbar-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  transform: scale(1.1);
}

.toolbar-btn:active {
  transform: scale(0.95);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.voice-btn {
  --app-button-height: 29px;
  --app-button-min-width: 29px;
  --app-button-padding-x: 0;
  --app-button-fill: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 48%, transparent);
  --app-button-fg: var(--ui-text-muted-fg, var(--muted));
  --app-button-border: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 42%, transparent);
  --app-button-hover-fill: var(--ui-state-active-bg, var(--active));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-hover-border: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 42%, transparent);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: 29px;
  height: 29px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 42%, transparent);
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 48%, transparent);
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
}

.voice-btn:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-active-bg, var(--active));
  transform: translateY(-1px);
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
  --app-button-height: 33px;
  --app-button-min-width: 33px;
  --app-button-padding-x: 0;
  --app-button-hover-fill: var(--ui-action-primary-hover-bg, var(--bg-btn-primary-hover));
  --app-button-hover-fg: var(--ui-action-primary-fg, var(--text-btn-primary));
  --app-button-shadow: var(--ui-action-primary-shadow, 0 1px 4px color-mix(in srgb, var(--ui-action-primary-bg, var(--color-primary, var(--primary, var(--accent)))) 22%, transparent));
  --app-button-hover-shadow: var(--ui-action-primary-hover-shadow, 0 2px 8px color-mix(in srgb, var(--ui-action-primary-bg, var(--color-primary, var(--primary, var(--accent)))) 24%, transparent));

  width: 33px;
  height: 33px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--ui-action-primary-bg, var(--color-primary, var(--primary, var(--accent))));
  color: var(--ui-action-primary-fg, var(--text-btn-primary));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
  flex-shrink: 0;
  box-shadow: var(--ui-action-primary-shadow, 0 1px 4px color-mix(in srgb, var(--ui-action-primary-bg, var(--color-primary, var(--primary, var(--accent)))) 22%, transparent));
}

.send-btn:hover:not(:disabled) {
  background: var(--ui-action-primary-hover-bg, var(--bg-btn-primary-hover));
  transform: translateY(-1px);
  box-shadow: var(--ui-action-primary-hover-shadow, 0 2px 8px color-mix(in srgb, var(--ui-action-primary-bg, var(--color-primary, var(--primary, var(--accent)))) 24%, transparent));
}

.send-btn:active:not(:disabled) {
  transform: scale(0.97);
  box-shadow: var(--ui-action-primary-active-shadow, 0 1px 3px color-mix(in srgb, var(--ui-action-primary-bg, var(--color-primary, var(--primary, var(--accent)))) 18%, transparent));
}

.send-btn:disabled {
  background: color-mix(in srgb, var(--ui-surface-input-bg, var(--bg-input, var(--ui-surface-panel-bg, var(--bg-panel)))) 22%, transparent);
  border-color: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 24%, transparent);
  color: color-mix(in srgb, var(--ui-editor-placeholder-fg, var(--ui-text-muted-fg, var(--text-muted))) 40%, transparent);
  cursor: default;
  box-shadow: none;
}

.send-btn.stop-btn {
  background: var(--ui-action-ghost-bg, var(--hover));
  box-shadow: none;
  color: var(--ui-action-ghost-fg, var(--muted));
  border: 1px solid var(--ui-border-default-border, var(--border));
}

.send-btn.stop-btn:hover {
  background: var(--ui-action-ghost-hover-bg, var(--active));
  color: var(--ui-text-primary-fg, var(--text));
  transform: translateY(-1px) scale(1.02);
  box-shadow: none;
}

.send-btn.stop-btn:active {
  transform: scale(0.96);
  background: var(--ui-state-active-bg, var(--active));
}

/* Responsive styles */
@media (max-width: 768px) {
  .composer { border-radius: 10px; }
  .composer-input { font-size: 15px; }
  .toolbar-btn { width: 30px; height: 30px; }
  .send-btn { width: 33px; height: 33px; }
}

@media (max-width: 600px) {
  .toolbar-left { column-gap: 3px; }
  .toolbar-btn { width: 30px; height: 30px; }
}

@media (max-width: 480px) {
  .composer { border-radius: 10px; }
  .queued-messages {
    width: calc(100% - 24px);
    max-width: calc(100% - 24px);
    margin: 0 auto 6px;
  }
  .queued-message-card {
    grid-template-columns: 20px minmax(0, 1fr) auto;
  }
  .queued-file-summary {
    display: none;
  }
  .queued-message-action :deep(.app-button-label) {
    display: none;
  }
  .queued-message-action {
    --app-button-padding-x: 0;

    width: 26px;
  }
  .input-area { padding: 8px 10px 0; }
  .composer-toolbar { padding: 5px 7px; }
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
  .send-btn { width: 33px; height: 33px; }
}
</style>
