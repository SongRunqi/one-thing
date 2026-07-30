<template>
  <div
    ref="composerWrapperRef"
    class="composer-wrapper"
    :class="{ 'is-drop-target': isFileDragActive }"
    v-on="fileDropHandlers"
  >
    <DropOverlay :active="isFileDragActive" />
    <!-- Kept out of the toolbar markup so the picker and the drop zone share
         one intake path (handleIncomingFiles) instead of two. -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="attachment-file-input"
      tabindex="-1"
      aria-hidden="true"
      @change="handleFilePicked"
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
          v-if="queuedDockVisible"
          key="queue"
          :items="queuedMessages"
          :file-changes="queuedFileChanges"
          @steer="steerQueuedMessage"
          @remove="removeQueuedMessage"
        />
        <QuotedContext
          v-if="quotedText"
          key="quote"
          :text="quotedText"
          @clear="clearQuotedText"
        />
        <AttachmentRow
          v-if="attachedFiles.length > 0 || composerReferences.length > 0 || isProcessingAttachments"
          key="attachments"
          :files="attachedFiles"
          :references="composerReferences"
          :processing="isProcessingAttachments"
          @remove="removeAttachment"
          @remove-reference="handleRemoveReference"
        />
      </TransitionGroup>
      <!-- Anchor keeps flyouts glued to the composer's top edge, floating
           above whatever is docked higher in the stack. -->
      <div
        class="composer-anchor"
        :style="{ '--music-bar-reserve': musicBarReserve }"
      >
        <MusicStatusBar :expanded="musicBarExpanded" />
        <span
          class="composer-frame-label"
          :class="{
            listening: isVoiceRecordingActive,
            transcribing: isVoiceTranscribingActive,
            command: commandModeActive,
            music: showsMusicTag,
          }"
          :aria-hidden="showsMusicTag ? undefined : 'true'"
          :tabindex="showsMusicTag ? 0 : undefined"
          :role="showsMusicTag ? 'button' : undefined"
          :title="showsMusicTag ? musicNowPlayingTitle : undefined"
          @mouseenter="onMusicLabelEnter"
          @mouseleave="onMusicLabelLeave"
          @focus="onMusicLabelEnter"
          @blur="onMusicLabelLeave"
        >{{ composerFrameLabel }}<span
          v-if="isVoiceRecordingActive"
          class="composer-frame-elapsed"
        >{{ formattedVoiceElapsed }}</span><span
          v-else-if="commandModeActive && commandModeHint"
          class="composer-frame-hint"
        >{{ commandModeHint }}</span><span
          v-else-if="showsMusicTag"
          class="composer-frame-note"
          aria-hidden="true"
        >♪</span></span>
        <button
          v-if="isVoiceRecordingActive"
          class="composer-voice-cancel"
          type="button"
          title="Discard this recording"
          @mousedown.prevent
          @click.stop="cancelVoiceRecording"
        >
          esc cancel
        </button>
        <button
          v-else-if="commandModeActive"
          class="composer-voice-cancel composer-command-exit"
          type="button"
          :title="`Leave /${activeCommand?.id} and keep the text`"
          @mousedown.prevent
          @click.stop="clearActiveCommand"
        >
          esc exit
        </button>
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
          @select="handleFilePickerRowSelect"
          @highlight="highlightActiveSelection"
          @close="handleFilePickerClose"
        />

        <FilePicker
          :visible="activeExtension.type === 'pages'"
          title="Pages"
          empty-text="No open pages"
          empty-hint="Open a page in the browser panel first"
          :items="activeExtension.items"
          :selected-index="activeExtension.selectedIndex"
          :query="activeExtension.query"
          :loading="activeExtension.loading"
          :error="activeExtension.error"
          @select="handlePagePicked"
          @highlight="highlightActiveSelection"
          @close="handleFilePickerClose"
        />

        <FilePicker
          :visible="activeExtension.type === 'members'"
          title="成员"
          empty-text="没有匹配的成员"
          empty-hint="房间成员在建房时选定"
          :items="activeExtension.items"
          :selected-index="activeExtension.selectedIndex"
          :query="activeExtension.query"
          :loading="activeExtension.loading"
          :error="activeExtension.error"
          @select="handleMemberPicked"
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
            listening: isVoiceRecordingActive,
            transcribing: isVoiceTranscribingActive,
            'command-mode': commandModeActive,
          }"
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
              :member-refs="memberRefs"
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

          <!-- Bottom toolbar -->
          <div
            class="composer-toolbar"
            :data-profile="composerProfile"
          >
            <!-- 工程驾驶舱:模型/上下文/think/权限档位。messenger 形态整条不
                 渲染 —— 这些控制归属主(agent-im-chat-ui.md §1 C2),空的
                 toolbar-left 留着当 flex 撑杆,右边按钮带才不会被甩到左边。 -->
            <div class="toolbar-left">
              <template v-if="isEngineeringComposer">
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
                    @click.stop
                    @mouseenter="loadSessionUsageOnHover"
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
              </template>
            </div>

            <div
              class="toolbar-right"
              @click.stop
            >
              <Button
                size="small"
                class="voice-aux-btn attach-btn"
                native-type="button"
                title="Attach files — or drop them on the composer"
                aria-label="Attach files"
                @mousedown.prevent
                @click.stop="openFilePicker"
              >
                <template #icon>
                  <Paperclip
                    :size="15"
                    :stroke-width="2"
                  />
                </template>
              </Button>
              <!-- 语音的"被动播报/通话"是直聊能力(§2.2):dm 房与群房不挂,
                   房里的语音消息另立设计。 -->
              <Button
                v-if="isEngineeringComposer"
                size="small"
                class="voice-aux-btn tts-toggle-btn"
                :class="{ 'tts-off': !replySpeechEnabled }"
                native-type="button"
                :title="replySpeechEnabled ? 'Voice replies on — click to mute' : 'Voice replies off — click to speak replies'"
                @mousedown.prevent
                @click.stop="toggleReplySpeech"
              >
                <template #icon>
                  <Volume2
                    v-if="replySpeechEnabled"
                    :size="16"
                    :stroke-width="2"
                  />
                  <VolumeX
                    v-else
                    :size="16"
                    :stroke-width="2"
                  />
                </template>
              </Button>
              <Button
                v-if="isEngineeringComposer"
                size="small"
                class="voice-aux-btn call-btn"
                :class="{ 'call-active': voiceStore.callActive }"
                native-type="button"
                :title="voiceCallButtonTitle"
                @mousedown.prevent
                @click.stop="handleCallButton"
              >
                <template #icon>
                  <PhoneOff
                    v-if="voiceStore.callActive"
                    :size="15"
                    :stroke-width="2.2"
                  />
                  <Phone
                    v-else
                    :size="15"
                    :stroke-width="2"
                  />
                </template>
              </Button>
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
                  >{{ commandModeActive ? 'RUN ⏎' : 'SEND ⏎' }}</span>
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
import { ref, computed, nextTick, onMounted, onUnmounted, onBeforeUnmount, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useChatStore } from '@/stores/chat'
import { useVoiceStore } from '@/stores/voice'
import { useMusicStore } from '@/stores/music'
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
import DropOverlay from './composer/DropOverlay.vue'
import MusicStatusBar from './composer/MusicStatusBar.vue'
import {
  decodeAttachmentText,
  hasDiffLikeContent,
  isPatchLikeFile,
  parseDiffStats,
  type QueuedFileChangeSummary,
  type QueuedMessage,
} from './composer/queued-message-utils'
import { X, Square, Check, Loader2, Mic, Paperclip, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-vue-next'
import { executeCommand, findCommand, getCommands, refreshPluginCommands } from '@/services/commands'
import TextEditor from '@/editor/TextEditor.vue'
import type { EditorHandle } from '@/editor'
import type { ChatMessageMention, GetSessionUsageResponse, MessageAttachment, PermissionMode } from '@/types'
import type { SelectModelValue } from '@/components/common/select'
import { DEFAULT_VOICE_SETTINGS } from '@shared/defaults/settings'
import { getDiffFromStep } from '@/stores/helpers/tool-step-view'

// Composables
import { useInputHistory } from '@/composables/useInputHistory'
import { usePickerOrchestration } from '@/composables/usePickerOrchestration'
import { useCommandFeedback } from '@/composables/useCommandFeedback'
import { useAttachments } from '@/composables/useAttachments'
import { useFileDrop } from '@/composables/useFileDrop'
import type { AttachedFile } from '@/composables/useAttachments'
import { createPromptToken, expandFileTokens } from '@shared/prompt-references'

interface Props {
  isLoading?: boolean
  maxChars?: number
  sessionId?: string
}

interface Emits {
  (
    e: 'sendMessage',
    message: string,
    mode?: 'send' | 'steer' | 'followup',
    attachments?: MessageAttachment[],
    /** Identity-resolved @mentions materialized from member tokens (W14a). */
    mentions?: ChatMessageMention[],
  ): void
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
const collabBoardStore = useCollabBoardStore()
const chatStore = useChatStore()
const voiceStore = useVoiceStore()
const musicStore = useMusicStore()
const promptsStore = usePromptsStore()

const PERMISSION_MODES: PermissionMode[] = ['normal', 'auto-accept-edits', 'dangerously-allow-all']
const PERMISSION_MODE_OPTIONS = [
  { value: 'normal', label: 'Ask first' },
  { value: 'auto-accept-edits', label: 'Auto-accept edits' },
  { value: 'dangerously-allow-all', label: 'Allow all (no guard)' },
]

// Get the effective session ID
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

const currentSession = computed(() => sessionsStore.getSessionItem(effectiveSessionId.value) || null)

// Collab room: user sends are persist-only (never start a stream), so the
// mid-generation local queue must not apply.
const isRoomSessionActive = computed(() => {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return false
  return sessionsStore.sessions.find(s => s.id === sessionId)?.kind === 'room'
})

/**
 * Composer 形态(docs/design/agent-im-chat-ui.md §2 C1)。房会话就是 IM 场
 * ——群房、单成员 dm 房、双成员 dm 房全都是 `kind === 'room'`,所以一条判定
 * 收口三种形态;其余(含绑了 agent 的直聊)保留工程驾驶舱。
 *
 * 不新建第二个输入框组件:两个形态共用 IME/草稿/发送/录音这套底盘,分叉的只
 * 是周边按钮带,全部走 `v-if`。
 */
const composerProfile = computed<'engineering' | 'messenger'>(() =>
  isRoomSessionActive.value ? 'messenger' : 'engineering',
)
const isEngineeringComposer = computed(() => composerProfile.value === 'engineering')

/**
 * 单成员 dm 房(我和 TA 两个人)里 @ 没有意义 —— 房里没有第三个人可点名。
 * 判定读 store selector(产品层 `isUserDmRoom` 的唯一出口),不自写第二份过滤;
 * selector 缺席(组件单测的假 store)时退回"照常显示",宁可多一个补全也不要
 * 在测试里炸掉整个 composer。
 */
const isSingleMemberDmRoom = computed(() => {
  if (typeof sessionsStore.isUserDmRoomSession !== 'function') return false
  return sessionsStore.isUserDmRoomSession(effectiveSessionId.value)
})

/** messenger 形态砍掉 `/` 命令面(工程命令不属于对话面,要用去直聊)。 */
const slashCommandsEnabled = isEngineeringComposer
/** 单成员 dm 房关掉 bare-`@`;群房与 pair 房照旧。 */
const atMentionsEnabled = computed(() => !isSingleMemberDmRoom.value)

const permissionMode = computed<PermissionMode>(() => {
  return currentSession.value?.permissionMode || settingsStore.settings?.tools?.permissionMode || 'normal'
})

const permissionModeLabel = computed(() => {
  switch (permissionMode.value) {
    case 'auto-accept-edits': return 'Auto-accept edits'
    case 'dangerously-allow-all': return 'Allow all (no guard)'
    default: return 'Ask first'
  }
})

const permissionDropdownStyle = computed(() => ({
  width: '178px',
}))

// User words, not enum values: "danger" resident in the toolbar reads as a
// standing error. "off" says what the mode actually is — guard disabled.
const guardShort = computed(() => {
  switch (permissionMode.value) {
    case 'auto-accept-edits': return 'edits'
    case 'dangerously-allow-all': return 'off'
    default: return 'ask'
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

// Session cost: fetched from the token-billing ledger (docs/design/token-billing.md).
// Fetched lazily on hover (not eagerly on mount/watch) so every InputBox mount in
// tests doesn't fire a real platformApi call — this component has no dedicated
// test file that mocks @/platform, and other InputBox specs mount it directly
// against the real (unmocked) platform module. No watcher either: keyed by
// sessionId and read through a computed so a stale value never renders.
const sessionUsageEntry = ref<{ sessionId: string; response: GetSessionUsageResponse } | null>(null)
let sessionUsageLoadingForSessionId: string | null = null

const sessionUsage = computed(() => {
  const entry = sessionUsageEntry.value
  return entry && entry.sessionId === effectiveSessionId.value ? entry.response : null
})

function formatSessionCostUSD(value: number): string {
  if (value === 0) return '$0.00'
  return `$${value.toFixed(value < 1 ? 4 : 2)}`
}

function loadSessionUsageOnHover(): void {
  const sessionId = effectiveSessionId.value
  if (!sessionId || sessionUsageLoadingForSessionId === sessionId) return
  sessionUsageLoadingForSessionId = sessionId
  platformApi.getSessionUsage({ sessionId })
    .then((response) => {
      sessionUsageEntry.value = { sessionId, response }
    })
    .catch(() => {
      // Billing is best-effort display data; leave the meter usable without it.
    })
    .finally(() => {
      if (sessionUsageLoadingForSessionId === sessionId) sessionUsageLoadingForSessionId = null
    })
}

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
  const usage = sessionUsage.value
  if (usage && (usage.apiCostUSD > 0 || usage.subscriptionCostUSD > 0)) {
    if (usage.apiCostUSD > 0) lines.push(`Session cost: ${formatSessionCostUSD(usage.apiCostUSD)}`)
    if (usage.subscriptionCostUSD > 0) lines.push(`Session cost (subscription est.): ${formatSessionCostUSD(usage.subscriptionCostUSD)}`)
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
  fileReferences,
  removeFileReference,
  handlePagePickerSelect,
  handleMemberPickerSelect,
  pageReferences,
  removePageReference,
  materializePageReferences,
  materializeMemberReferences,
  activeRoomMembers,
  handlePathPickerSelect,
  handlePathPickerClose,
  anyPickerVisible,
  handleEditorSelectionChange,
  handleEditorTransaction,
  closeAllPickers,
  enabledSkills,
} = usePickerOrchestration(
  messageInput,
  workingDirectory,
  editorRef,
  updateComposerHeight,
  checkHistoryEdit,
  effectiveSessionId,
  // 形态注入(agent-im-chat-ui.md §2.2):messenger 不弹命令面,单成员 dm 房
  // 不弹 @ 补全 —— 触发路径在源头关掉,不是把弹层画出来再藏起来。
  { slashCommands: slashCommandsEnabled, atMentions: atMentionsEnabled },
)

/** Routes a files-picker row: the pinned page row inserts a page token instead. */
function handleFilePickerRowSelect(value: string, kind?: string) {
  if (kind === 'browser-page') {
    void handlePagePickerSelect(value, 'file')
    return
  }
  void handleFilePickerSelect(value)
}

function handlePagePicked(value: string) {
  void handlePagePickerSelect(value, 'page')
}

/** Room member mention completion: inserts the exact `@名字 ` text. */
function handleMemberPicked(value: string) {
  void handleMemberPickerSelect(value)
}

/** File and page chips share the dock row; a page chip tooltips its URL. */
const composerReferences = computed(() => [
  ...fileReferences.value,
  ...pageReferences.value.map(reference => ({
    id: reference.id,
    path: reference.url || reference.label,
    label: reference.label,
    from: reference.from,
    to: reference.to,
    badge: 'WEB',
  })),
])

function handleRemoveReference(id: string) {
  // Each remover no-ops when the id belongs to the other kind.
  removeFileReference(id)
  removePageReference(id)
}

const { commandFeedback, showCommandFeedback } = useCommandFeedback()
const {
  attachedFiles,
  isProcessing: isProcessingAttachments,
  handlePaste: handleAttachmentPaste,
  processFiles: processAttachmentFiles,
  removeAttachment,
  clearAttachments,
  restoreAttachments,
  toMessageAttachments,
  attachmentFromMessageAttachment,
} = useAttachments()

const fileInputRef = ref<HTMLInputElement | null>(null)
const { isDragActive: isFileDragActive, dropHandlers: fileDropHandlers } = useFileDrop({
  onFiles: handleIncomingFiles,
})

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
// Roster the editor needs to paint `{{member:<id>}}` tokens as @名字 (W14a).
// Plain literals: this crosses into a CodeMirror extension that keeps the map
// for the lifetime of a reconfigure, so it must not hold a reactive proxy.
const memberRefs = computed(() =>
  activeRoomMembers.value.map(agent => ({ id: String(agent.id), name: String(agent.name) })))
const hasActiveGeneration = computed(() => {
  const sessionId = effectiveSessionId.value
  if (props.isLoading) return true
  if (!sessionId) return false
  // 群聊房间会话上从来没有流(W18 之后回合跑在成员的执行会话里),所以
  // isSessionGenerating 对房间永远是 false,停止按钮从未被画出来过。房间的
  // "在跑"由 collab:turn-active 说了算(collab-team-v2 §5.1 入口①)。
  return chatStore.isSessionGenerating(sessionId) || collabBoardStore.isRoomTurnActive(sessionId)
})

const canSend = computed(() => {
  return (hasMessageContent.value || hasAttachments.value) && !isProcessingAttachments.value
})

const shouldShowStopAction = computed(() => {
  return hasActiveGeneration.value && !hasMessageContent.value && !hasAttachments.value
})

/**
 * The leading `/command` token stays in the draft text (it is what sendMessage
 * parses), but the editor hides it — see the hidden range in prompt-cards.ts.
 * This lifts it into a chip docked above the composer, like an attachment.
 */
const activeCommandMatch = computed(() => {
  // messenger 形态没有命令面:`/` 开头的一行就是一行话,不抽成 chip、不换 RUN。
  if (!isEngineeringComposer.value) return null
  const match = messageInput.value.match(/^\/([a-zA-Z0-9_-]+)(?=\s|$)/)
  if (!match) return null
  const command = commandRefs.value.find(entry => entry.id.toLowerCase() === match[1].toLowerCase())
  return command ? { command, length: match[0].length } : null
})

const activeCommand = computed(() => activeCommandMatch.value?.command ?? null)

/**
 * Command mode: the composer itself carries the state — dashed frame, the
 * command name in the frame tag, its usage where the placeholder would sit,
 * RUN instead of SEND. A voice turn owns the same frame, so it wins.
 */
const commandModeActive = computed(() =>
  !!activeCommand.value &&
  !isVoiceRecordingActive.value &&
  !isVoiceTranscribingActive.value,
)

/** The music tag yields the frame to a pending command. */
const showsMusicTag = computed(() => showsMusicLabel.value && !commandModeActive.value)

const commandModeHint = computed(() => {
  const command = activeCommand.value
  if (!command) return ''
  // The tag already carries the name, so the hint keeps only what it does not
  // repeat: the argument shape from `usage`, then the description.
  const args = (command.usage || '').replace(/^\/\S*\s*/, '').trim()
  return [args, command.description].filter(Boolean).join(' · ')
})

/** Leaves command mode without touching whatever args were already typed. */
function clearActiveCommand() {
  const match = activeCommandMatch.value
  if (!match) return
  // Drop the separating space with the token so the args do not shift right.
  const end = messageInput.value[match.length] === ' ' ? match.length + 1 : match.length
  const rest = messageInput.value.slice(end)
  if (editorRef.value) {
    editorRef.value.replaceRange(0, end, '')
  } else {
    messageInput.value = rest
  }
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.focus()
  })
}

/**
 * 排队 dock 是工程 dock:messenger 形态不渲染。房会话本来也排不出队(用户发言
 * 是 persist-only,`sendMessage` 走的是即时分支),这里是把渲染面也钉死。
 */
const queuedDockVisible = computed(
  () => isEngineeringComposer.value && queuedMessages.value.length > 0,
)

const dockVisible = computed(() => {
  return (
    queuedDockVisible.value ||
    !!quotedText.value ||
    attachedFiles.value.length > 0 ||
    composerReferences.value.length > 0 ||
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
  if (commandModeActive.value) return `Run /${activeCommand.value?.id}`
  if (hasActiveGeneration.value) return 'Queue message after current response'
  return 'Send message'
})
const voiceSettings = computed(() => settingsStore.settings.voice ?? DEFAULT_VOICE_SETTINGS)
const voiceStatus = computed(() => voiceStore.status ?? 'idle')
const isVoiceRecordingActive = computed(() => voiceStatus.value === 'recording')
const isVoiceTranscribingActive = computed(() => voiceStatus.value === 'transcribing')
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
  if (voice.asr.provider === 'doubao') {
    const hasKey = voice.doubao?.apiKey?.trim() || (voice.doubao?.appId?.trim() && voice.doubao?.accessToken?.trim())
    if (!hasKey) return 'Add a Doubao (Volcano Engine) API key in Voice settings'
  }
  return ''
})
const voiceButtonTitle = computed(() => {
  if (isVoiceRecordingActive.value) return 'Stop and transcribe'
  if (isVoiceTranscribingActive.value) return 'Transcribing voice input'
  if (voiceConfigurationError.value) return `${voiceConfigurationError.value}. Click to set up.`
  return 'Start voice input'
})

function cancelVoiceRecording() {
  void voiceStore.stop('cancel', false)
  showCommandFeedback('success', 'Recording discarded')
}

const replySpeechEnabled = computed(() => voiceSettings.value.tts.autoSpeak)

function toggleReplySpeech() {
  const settings = settingsStore.settings
  void settingsStore.saveSettings({
    ...settings,
    voice: {
      ...voiceSettings.value,
      tts: {
        ...voiceSettings.value.tts,
        autoSpeak: !replySpeechEnabled.value,
      },
    },
  })
}

const voiceCallButtonTitle = computed(() => {
  if (voiceStore.callActive) return 'Hang up the voice call'
  if (voiceConfigurationError.value) return `${voiceConfigurationError.value}. Click to set up.`
  return 'Start a hands-free voice call'
})

async function handleCallButton() {
  if (voiceStore.callActive) {
    void voiceStore.endCall()
    return
  }
  if (!effectiveSessionId.value) {
    showCommandFeedback('error', 'Open a chat before starting a voice call')
    return
  }
  const ready = await prepareVoiceInput()
  if (!ready.success) {
    showCommandFeedback('error', ready.error || 'Voice call needs setup')
    return
  }
  const response = await voiceStore.startCall(effectiveSessionId.value)
  if (response && !response.success) {
    showCommandFeedback('error', response.error || 'Voice call could not start')
  }
}
// Scheme「frame is the state」: during a voice turn the composer's own
// frame carries the state — the caption flips to LISTENING + timer and the
// live transcript ghosts into the entry as its placeholder.
const musicBarExpanded = ref(false)
let musicCollapseTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Height the composer reserves above itself for a PINNED music bar (the bar's
 * own 9px gap included). Hover-summoned it stays a zero-cost flyout; pinned it
 * is a fixture, and the reserved margin lifts the chat area clear of it.
 */
const musicBarReserve = computed(() =>
  musicStore.barPinned && musicStore.barHeight > 0
    ? `${musicStore.barHeight + 9}px`
    : '0px',
)

function onMusicLabelEnter() {
  if (!showsMusicLabel.value) return
  if (musicCollapseTimer) {
    clearTimeout(musicCollapseTimer)
    musicCollapseTimer = null
  }
  musicBarExpanded.value = true
}

/**
 * Delayed: the bar sits 9px above the tag, and without this the pointer crossing
 * that gap would collapse the bar out from under itself. The bar takes over the
 * hold once the pointer lands on it.
 */
function onMusicLabelLeave() {
  if (musicCollapseTimer) clearTimeout(musicCollapseTimer)
  musicCollapseTimer = setTimeout(() => {
    musicBarExpanded.value = false
    musicCollapseTimer = null
  }, 220)
}

onBeforeUnmount(() => {
  if (musicCollapseTimer) clearTimeout(musicCollapseTimer)
})

const composerPlaceholder = computed(() => {
  if (isVoiceRecordingActive.value) return voiceStore.lastTranscript || 'Listening...'
  if (isVoiceTranscribingActive.value) return voiceStore.lastTranscript || 'Transcribing...'
  // The original radio vision: lyrics live in the placeholder. Only while a
  // song plays and only until the user types — a placeholder yields to input
  // by nature, so the lyric never competes with composing. The host's patter
  // deliberately does NOT ride this channel (field feedback) — its home is
  // the status bar's scrolling caption; a static placeholder can't scroll a
  // long line and just truncates it.
  const lyricLine = musicStore.currentLyricLine
  if (lyricLine) return `♪ ${lyricLine}`
  return 'Ask anything...'
})

/**
 * The collapsed music state: the frame tag is already absolutely positioned, so
 * saying NOW PLAYING here costs zero layout — and it doubles as the hover target
 * for the bar. Voice wins: it is a live functional state, music is ambience.
 */
const musicIsPlaying = computed(
  () => !!musicStore.nowPlaying && musicStore.nowPlaying.status !== 'stopped',
)

/** The host's patter TTS is on air while the song player is silent. */
const musicIsSpeaking = computed(
  () => !musicIsPlaying.value && musicStore.radio.active && !!musicStore.djPatter,
)

/** A start is in flight (patter synthesis → play spawn → verify): 换歌中, not 停了. */
const musicIsTransitioning = computed(
  () =>
    !musicIsPlaying.value &&
    !musicIsSpeaking.value &&
    musicStore.radio.active &&
    !!musicStore.radio.starting,
)

/** Songs waiting (station open or closed earlier), no sound — resume from here. */
const musicIsStandby = computed(
  () =>
    !musicIsPlaying.value &&
    !musicIsSpeaking.value &&
    !musicIsTransitioning.value &&
    musicStore.radio.canResume,
)

/**
 * The music feature is set up, so the RADIO tag is the always-available summon
 * handle: hovering it brings up the bar even at rest (nothing playing, no
 * queue), which is exactly when the bar acts as the 开电台 launcher. Without a
 * resting handle the launcher would be unreachable in the hover-summon model.
 */
const musicAvailable = computed(
  () =>
    settingsStore.settings.music?.enabled === true &&
    musicStore.state.configured === true,
)

const showsMusicLabel = computed(
  () =>
    !isVoiceRecordingActive.value &&
    !isVoiceTranscribingActive.value &&
    (musicIsPlaying.value ||
      musicIsSpeaking.value ||
      musicIsTransitioning.value ||
      musicIsStandby.value ||
      musicAvailable.value),
)

const musicNowPlayingTitle = computed(() => {
  if (musicIsSpeaking.value) return '主持人口播中 — 音乐马上接上'
  if (musicIsTransitioning.value) return '换歌中 — 马上开始'
  if (musicIsStandby.value) return '电台待命 — 悬停展开,可以继续播放'
  if (musicIsPlaying.value) {
    return musicStore.nowPlaying?.title
      ? `${musicStore.nowPlaying.title} — 悬停展开播放器`
      : undefined
  }
  return '电台 — 悬停展开,开一台'
})

const composerFrameLabel = computed(() => {
  if (isVoiceRecordingActive.value) return 'LISTENING'
  if (isVoiceTranscribingActive.value) return 'TRANSCRIBING'
  // A pending command outranks the ambient music tag: it is something the
  // user is about to run, not something playing in the background.
  if (commandModeActive.value) return `/${activeCommand.value?.id.toUpperCase()}`
  if (showsMusicLabel.value) return musicIsPlaying.value ? 'NOW PLAYING' : 'RADIO'
  return 'COMPOSER'
})

const formattedVoiceElapsed = computed(() => {
  const totalSeconds = Math.floor(voiceRecordingElapsedMs.value / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
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
  window.addEventListener('onething:composer-attach', handleWebElementPicked)
})

onUnmounted(() => {
  saveComposerDraft()
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  window.removeEventListener('onething:composer-attach', handleWebElementPicked)
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

    return {
      fileCount: fileKeys.size,
      additions,
      deletions,
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

/** Single intake for every source of files: drop, picker, and paste's result. */
async function handleIncomingFiles(files: File[]) {
  const result = await processAttachmentFiles(files)
  if (!result.handled) return
  showAttachmentResult(result.accepted, result.rejected)
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.focus()
  })
}

/** Append one attachment programmatically (no File/drag) — e.g. a web-element pick. */
function addAttachment(attachment: MessageAttachment) {
  attachmentFromMessageAttachment(attachment)
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.focus()
  })
}

/**
 * A web element picked in the embedded browser arrives as a window CustomEvent
 * (BrowserPanel and this composer sit far apart in the tree). Only the visible
 * composer consumes it — a hidden/background InputBox has no offsetParent.
 */
function handleWebElementPicked(event: Event) {
  const detail = (event as CustomEvent<MessageAttachment | undefined>).detail
  if (!detail) return
  // Must be visible (not a display:none background-tab composer)...
  if (!composerWrapperRef.value || composerWrapperRef.value.offsetParent === null) return
  // ...AND the active pane's composer: a split layout mounts several visible
  // InputBoxes at once, but the pick belongs only to the active session.
  // sessionsStore.currentSessionId tracks the active leaf (the workspace store
  // drives switchSession), so this routes to exactly the focused composer.
  const active = sessionsStore.currentSessionId
  if (active && effectiveSessionId.value !== active) return
  addAttachment(detail)
}

function openFilePicker() {
  fileInputRef.value?.click()
}

async function handleFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  // Reset before awaiting so picking the same file twice in a row still fires
  // a change event the second time.
  input.value = ''
  if (files.length > 0) await handleIncomingFiles(files)
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

  // 权限档位在 messenger 形态没有控件(房间的 permissionMode 归房设置管),
  // 快捷键跟着控件一起消失,免得留一个看不见的开关。
  if (e.key === 'Tab' && e.shiftKey && !anyPickerVisible.value && isEngineeringComposer.value) {
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
  // picker open, Escape cancels an in-progress voice recording, then leaves
  // command mode, then clears the quoted context.
  if (e.key === 'Escape' && isVoiceRecordingActive.value) {
    e.preventDefault()
    cancelVoiceRecording()
    return
  }
  if (e.key === 'Escape' && commandModeActive.value) {
    e.preventDefault()
    clearActiveCommand()
    return
  }
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

  // Check if this is a command. messenger 形态一律不认:`/foo` 原样当文本发出
  // 去,一个字都不吞(agent-im-chat-ui.md §2.2 Q3)。
  const commandMatch = isEngineeringComposer.value && !hasAttachments.value
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

      // Dispatch through executeCommand — the single entry that resolves
      // draft session ids before a command can leak them over IPC.
      const result = await executeCommand(commandId, {
        sessionId: effectiveSessionId.value,
        args: argsString,
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

  // Regular message sending. Docked file chips expand back to `@<path>` at the
  // exact spot the user picked them — the chip is presentation, not placement.
  // Page chips resolve against the browser mirror NOW and leave the text
  // entirely: the reference rides as a zero-byte provenance attachment, so
  // the bubble never shows a raw URL and page-controlled URL text never
  // enters the draft (where the file-token expander could rescan it).
  const fileExpandedText = expandFileTokens(messageInput.value)
  const { text: pageExpandedText, attachments: pageAttachments } = materializePageReferences(fileExpandedText)
  // Member tokens LAST and back INTO the text (W14a): a mention is words the
  // room reads, so `{{member:<id>}}` becomes plain `@名字` in place while the
  // id leaves separately in mentions[]. Running after the page pass keeps the
  // page expander from ever rescanning a name we just wrote.
  const { text: draftText, mentions } = materializeMemberReferences(pageExpandedText)
  let fullMessage = draftText
  const combinedAttachments = [...(toMessageAttachments() ?? []), ...pageAttachments]
  const attachments = combinedAttachments.length > 0 ? combinedAttachments : undefined

  if (quotedText.value) {
    const quotedLines = quotedText.value.split('\n').map(line => `> ${line}`).join('\n')
    fullMessage = `${quotedLines}\n\n${draftText}`
  }

  // A draft that was ONLY dead page tokens (tabs closed since picking)
  // materializes to nothing — keep it instead of sending an empty message.
  if (!fullMessage.trim() && !attachments) {
    showCommandFeedback('error', 'Page reference is gone — its tab was closed')
    return
  }

  // Collab rooms never stream user sends (the ingress gate persists them
  // without driving), so sending mid-turn is always safe — bypass the local
  // queue so the user can interject at any time and the coordinator's chain
  // reset fires immediately (docs/design/multi-agent-collab.md D2/§5).
  if (hasActiveGeneration.value && !isRoomSessionActive.value) {
    // Mentions never reach this branch: they exist only in rooms, and rooms
    // take the immediate path above (the queue is for streaming sessions).
    queuedMessages.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content: fullMessage,
      attachments,
    })
  } else {
    emit('sendMessage', fullMessage, 'send', attachments, mentions.length > 0 ? mentions : undefined)
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
  addAttachment,
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

/* The native input is only a mechanism for the attach button; it never shows.
   `display: none` would make it unclickable in some engines, so hide it
   without removing it from the box tree. */
.attachment-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
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
  /* A pinned music bar stops being a transient flyout: the margin reserves its
     measured height (it floats up into exactly this gap), so growing the
     composer pushes the chat area up instead of letting the bar cover it. */
  margin-top: var(--music-bar-reserve, 0px);
  transition: margin-top 0.18s ease;
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

/* --- voice turn: the frame itself is the state --- */
.composer-frame-label.listening {
  color: var(--ui-status-danger-fg, #b3403a);
}

.composer-frame-label.transcribing {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.composer-frame-elapsed {
  margin-left: 1em;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted-fg, var(--muted));
}

/* --- music: the tag is the whole collapsed state, and the hover target --- */

/* The label is pointer-events: none by default so it never eats a click meant
   for the composer. While music plays it has a job, so it takes them back. */
.composer-frame-label.music {
  pointer-events: auto;
  cursor: default;
}

.composer-frame-label.music:hover,
.composer-frame-label.music:focus-visible {
  color: var(--ui-text-muted-fg, var(--muted));
}

.composer-frame-label.music:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 70%, transparent);
  outline-offset: 2px;
}

.composer-frame-note {
  margin-left: 0.5em;
  letter-spacing: 0;
  color: var(--ui-text-muted-fg, var(--muted));
}

.composer-voice-cancel {
  position: absolute;
  top: -8px;
  right: 12px;
  z-index: 2;
  padding: 0 6px;
  border: 0;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg, var(--muted));
  text-decoration: underline;
  text-decoration-color: var(--ui-border-default-border, var(--border));
  text-underline-offset: 3px;
  cursor: pointer;
}

.composer-voice-cancel:hover {
  color: var(--ui-status-danger-fg, #b3403a);
  text-decoration-color: currentColor;
}

.composer.listening {
  animation: composer-listening-breathe 2.2s ease-in-out infinite;
}

@keyframes composer-listening-breathe {
  0%, 100% {
    border-color: var(--ui-status-danger-fg, #b3403a);
    box-shadow: 0 0 0 0 transparent;
  }
  50% {
    border-color: var(--ui-status-danger-border, var(--ui-border-default-border, var(--border)));
    box-shadow: var(--ui-status-danger-ring-shadow, 0 0 0 3px var(--ui-status-danger-bg, transparent));
  }
}

.composer.transcribing {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 45%, var(--ui-border-default-border, var(--border)));
}

/* --- command turn: the frame itself is the state, same as the voice turn.
   The leading /token is hidden inside the editor (see prompt-cards.ts), so
   the composer has to say which command the draft is arming. --- */
/* The usage hint rides the frame tag rather than a row of its own: the tag is
   absolutely positioned, so command mode costs the composer zero height. */
.composer-frame-label.command {
  display: inline-flex;
  align-items: baseline;
  max-width: calc(100% - 108px); /* leaves the esc-exit tag its corner */
  color: var(--ui-accent-primary-fg, var(--accent));
  letter-spacing: 1.4px;
}

.composer-frame-hint {
  min-width: 0;
  margin-left: 1em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.4px;
  font-weight: 400;
  color: var(--ui-text-muted-fg, var(--muted));
}

.composer.command-mode {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 55%, var(--composer-border));
}

/* Focus keeps its solid ring; the dash is what carries "command", so it stays. */
.composer.command-mode.focused {
  border-style: dashed;
}

.composer-command-exit:hover {
  color: var(--ui-accent-primary-fg, var(--accent));
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


@keyframes attachment-spin {
  to {
    transform: rotate(360deg);
  }
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

/* Narrow composer: cells leave in whole pieces, by priority — never as
   half-clipped text. Ladder: ctx cell-blocks → ctx meter + voice buttons →
   think toggle → guard. (The extra selector depth outranks the base display
   rule declared later in this file.) */
@container (max-width: 600px) {
  .toolbar-left .context-meter .context-meter-cells {
    display: none;
  }
}

@container (max-width: 540px) {
  .toolbar-left > *:has(.context-meter),
  .toolbar-right > .tts-toggle-btn,
  .toolbar-right > .call-btn {
    display: none;
  }
}

@container (max-width: 430px) {
  .toolbar-left > .thinking-control {
    display: none;
  }
}

@container (max-width: 360px) {
  .toolbar-left > .permission-mode-select {
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

/* messenger 形态左边一格工程控件都没有,首格的竖线就成了一道悬空分隔 ——
   去掉它,按钮带自己的左边缘由第一颗按钮画。 */
.composer-toolbar[data-profile='messenger'] .toolbar-right > *:first-child {
  border-left: 0;
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
.toolbar-right > .voice-aux-btn,
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
  /* Ink, not accent: a healthy gauge must not glow alarm-red at 25%. The
     warning tones below are the only states that recolor it. */
  --context-meter-cell: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));

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

/* Guard off is THE alarm state — the one place in the toolbar allowed to
   wear the danger color. */
.permission-mode-select.mode-dangerously-allow-all .guard-label {
  color: var(--ui-status-danger-fg, var(--text-error));
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

.voice-btn,
.voice-aux-btn {
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

.voice-btn:hover:not(:disabled),
.voice-aux-btn:hover:not(:disabled) {
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
  color: var(--ui-status-danger-fg, #b3403a);
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

.tts-toggle-btn.tts-off {
  color: var(--ui-text-muted-fg, var(--muted));
  opacity: 0.65;
}

.call-btn.call-active {
  color: var(--ui-status-danger-fg, #b3403a);
  border-color: var(--ui-status-danger-border, var(--ui-border-default-border, var(--border)));
  background: var(--ui-status-danger-bg, transparent);
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
}
</style>
