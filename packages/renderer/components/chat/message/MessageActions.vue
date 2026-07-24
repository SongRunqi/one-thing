<template>
  <div :class="['actions', role === 'user' ? 'user-actions' : '', { visible }]">
    <!-- Copy button -->
    <Tooltip :text="copied ? 'Copied!' : 'Copy'">
      <Button
        unstyled
        class="action-btn copy-btn"
        @click="handleCopy"
      >
        <Check
          v-if="copied"
          :size="15"
          :stroke-width="2"
        />
        <Copy
          v-else
          :size="15"
          :stroke-width="1.5"
        />
      </Button>
    </Tooltip>

    <!-- Edit button for user messages -->
    <Tooltip
      v-if="role === 'user'"
      text="Edit"
    >
      <Button
        unstyled
        class="action-btn edit-btn"
        @click.stop="emit('edit')"
      >
        <Pencil
          :size="15"
          :stroke-width="1.5"
        />
      </Button>
    </Tooltip>

    <!-- Regenerate button (for assistant messages) -->
    <Tooltip
      v-if="role === 'assistant'"
      text="Regenerate"
    >
      <Button
        unstyled
        class="action-btn regenerate-btn"
        @click="emit('regenerate')"
      >
        <RefreshCw
          :size="15"
          :stroke-width="2"
        />
      </Button>
    </Tooltip>

    <!-- Speak button (for assistant messages with TTS support) -->
    <Tooltip
      v-if="role === 'assistant' && ttsSupported"
      :text="isCurrentlySpeaking ? 'Stop' : 'Speak'"
    >
      <Button
        unstyled
        class="action-btn speak-btn"
        :class="{ speaking: isCurrentlySpeaking }"
        @click="handleSpeak"
      >
        <Pause
          v-if="isCurrentlySpeaking"
          :size="15"
          :stroke-width="2"
        />
        <Volume2
          v-else
          :size="15"
          :stroke-width="2"
        />
      </Button>
    </Tooltip>

    <!-- Downvote button (evals incident capture) -->
    <Tooltip
      v-if="role === 'assistant'"
      :text="downvoted ? 'Reported' : 'Report bad response'"
    >
      <Button
        ref="downvoteBtnRef"
        unstyled
        class="action-btn downvote-btn"
        :class="{ downvoted }"
        @click="handleDownvote"
      >
        <ThumbsDown
          :size="14"
          :stroke-width="downvoted ? 2.5 : 1.5"
        />
      </Button>
    </Tooltip>
    <!-- Downvote note popover: the one-liner is the only human input the
         eval system asks for — it becomes the incident's expectation/rubric. -->
    <Teleport to="body">
      <div
        v-if="showDownvoteNote"
        class="downvote-note-panel"
        :style="downvoteNoteStyle"
        @click.stop
      >
        <textarea
          ref="downvoteNoteInput"
          v-model="downvoteNote"
          class="downvote-note-input"
          rows="2"
          placeholder="哪里不对 / 应该怎么做?(可选,一句话)"
          @keydown.enter.exact.prevent="submitDownvote()"
          @keydown.esc.prevent="cancelDownvoteNote"
        />
        <div class="downvote-note-actions">
          <Button
            unstyled
            class="downvote-note-btn secondary"
            @click="submitDownvote(true)"
          >
            跳过
          </Button>
          <Button
            unstyled
            class="downvote-note-btn primary"
            @click="submitDownvote()"
          >
            记录事故
          </Button>
        </div>
      </div>
    </Teleport>

    <!-- Branch button (for assistant messages) -->
    <Tooltip
      v-if="role === 'assistant'"
      :text="hasBranches ? `${branchCount} branch${branchCount > 1 ? 'es' : ''}` : 'Branch'"
    >
      <div
        ref="branchBtnRef"
        class="branch-btn-wrapper"
      >
        <Button
          unstyled
          class="action-btn"
          :class="{ 'has-branches': hasBranches }"
          @click="hasBranches ? toggleBranchMenu() : emit('branch')"
        >
          <GitBranch
            :size="15"
            :stroke-width="2"
          />
          <span
            v-if="hasBranches"
            class="branch-count-badge"
          >{{ branchCount }}</span>
        </Button>
        <!-- Branch dropdown menu -->
        <div
          v-if="showBranchMenu && hasBranches"
          class="branch-menu"
          :style="branchMenuStyle"
        >
          <div class="branch-menu-list">
            <Button
              v-for="branch in branches"
              :key="branch.id"
              unstyled
              class="branch-menu-item"
              @click="handleGoToBranch(branch.id)"
            >
              <span class="branch-name">{{ branch.name || 'Untitled branch' }}</span>
              <ChevronRight
                :size="12"
                :stroke-width="2"
              />
            </Button>
          </div>
          <div class="branch-menu-footer">
            <Button
              unstyled
              class="branch-menu-new"
              @click="handleNewBranch"
            >
              <Plus
                :size="12"
                :stroke-width="2"
              />
              <span>New branch</span>
            </Button>
          </div>
        </div>
      </div>
    </Tooltip>

    <!-- Regenerate button for user messages -->
    <Tooltip
      v-if="role === 'user'"
      text="Regenerate response"
    >
      <Button
        unstyled
        class="action-btn regenerate-btn"
        @click="emit('regenerate')"
      >
        <RefreshCw
          :size="15"
          :stroke-width="2"
        />
      </Button>
    </Tooltip>

    <!-- More menu button (for assistant messages) -->
    <div
      v-if="role === 'assistant'"
      ref="moreBtnRef"
      class="more-btn-wrapper"
    >
      <Tooltip text="More">
        <Button
          unstyled
          class="action-btn more-btn"
          @click.stop="toggleMoreMenu"
        >
          <MoreHorizontal
            :size="15"
            :stroke-width="2"
          />
        </Button>
      </Tooltip>
      <!-- More menu dropdown -->
      <Teleport to="body">
        <div
          v-if="showMoreMenu"
          class="more-menu"
          :style="moreMenuStyle"
          @click.stop
        >
          <!-- Action items -->
          <div class="more-menu-actions">
            <Button
              unstyled
              class="more-menu-item"
              @click="handleViewTokenUsage"
            >
              <Hash
                :size="14"
                :stroke-width="2"
              />
              <span>Token usage</span>
              <span
                v-if="usage"
                class="more-menu-item-badge"
              >{{ formatCompact(usage.totalTokens) }}</span>
            </Button>
            <!-- Add more action items here in the future -->
          </div>

          <!-- Info section (shown when expanded) -->
          <div
            v-if="showTokenDetails && usage"
            class="more-menu-details"
          >
            <div class="token-detail-row">
              <span>Input</span>
              <span>{{ formatNumber(usage.inputTokens) }}</span>
            </div>
            <div class="token-detail-row">
              <span>Output</span>
              <span>{{ formatNumber(usage.outputTokens) }}</span>
            </div>
            <div
              v-if="outputSpeed"
              class="token-detail-row speed"
            >
              <span>Speed</span>
              <span>{{ outputSpeed }} tok/s</span>
            </div>
            <div
              v-if="model"
              class="token-detail-row model"
            >
              <span>Model</span>
              <span>{{ model }}</span>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import Tooltip from '@/components/common/Tooltip.vue'
import { useTTS } from '@/composables/useTTS'
import { stripMarkdown } from '@/composables/useMarkdownRenderer'
import { copyTextToClipboard } from '@/utils/clipboard'
import { platformApi } from '@/platform'
import { useEvalsWorkbenchStore } from '@/stores/evalsWorkbench'
import {
  Copy,
  Check,
  Pencil,
  RefreshCw,
  Volume2,
  Pause,
  GitBranch,
  ChevronRight,
  Plus,
  MoreHorizontal,
  Hash,
  ThumbsDown,
} from 'lucide-vue-next'

interface BranchInfo {
  id: string
  name: string
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs?: number
}

interface Props {
  role: 'user' | 'assistant'
  content: string
  visible: boolean
  isStreaming?: boolean
  branches?: BranchInfo[]
  usage?: TokenUsage
  model?: string
  messageId: string
  sessionId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  copy: []
  edit: []
  regenerate: []
  branch: []
  goToBranch: [sessionId: string]
  menuOpen: [isOpen: boolean]
  downvote: []
}>()

const workbenchStore = useEvalsWorkbenchStore()

// TTS
const { isSupported: ttsSupported, isSpeaking, speak, stop } = useTTS()
const speakingMessageId = ref<string | null>(null)

const isCurrentlySpeaking = computed(() =>
  isSpeaking.value && speakingMessageId.value === props.messageId
)

async function handleSpeak() {
  if (isCurrentlySpeaking.value) {
    stop()
    speakingMessageId.value = null
    return
  }

  stop()
  const textContent = stripMarkdown(props.content)
  if (!textContent) return

  speakingMessageId.value = props.messageId

  try {
    await speak(textContent)
  } catch (error) {
    console.error('TTS error:', error)
  } finally {
    speakingMessageId.value = null
  }
}

// Copy
const copied = ref(false)

async function handleCopy() {
  const success = await copyTextToClipboard(props.content)
  if (!success) {
    console.warn('Failed to copy')
    return
  }

  copied.value = true
  emit('copy')
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

// Downvote (evals incident capture)
const downvoted = ref(false)
const showDownvoteNote = ref(false)
const downvoteNote = ref('')
const downvoteBtnRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const downvoteNoteInput = ref<HTMLTextAreaElement | null>(null)
const downvoteNotePosition = ref({ top: 0, left: 0 })

const downvoteNoteStyle = computed(() => ({
  position: 'fixed' as const,
  top: `${downvoteNotePosition.value.top}px`,
  left: `${downvoteNotePosition.value.left}px`,
  zIndex: 1000,
}))

function handleDownvote() {
  if (downvoted.value) return
  if (!props.sessionId) {
    console.error('Downvote recording failed: no sessionId available for this message')
    return
  }

  if (showDownvoteNote.value) {
    showDownvoteNote.value = false
    return
  }

  const el = (downvoteBtnRef.value as { $el?: HTMLElement })?.$el
    ?? (downvoteBtnRef.value as HTMLElement | null)
  if (el?.getBoundingClientRect) {
    const rect = el.getBoundingClientRect()
    const panelWidth = 320
    const padding = 8
    let left = rect.left
    if (left + panelWidth > window.innerWidth - padding) {
      left = window.innerWidth - panelWidth - padding
    }
    downvoteNotePosition.value = { top: rect.bottom + 6, left }
  }
  showDownvoteNote.value = true
  downvoteNote.value = ''
  void nextTick(() => downvoteNoteInput.value?.focus())
}

function cancelDownvoteNote() {
  showDownvoteNote.value = false
  downvoteNote.value = ''
}

async function submitDownvote(skipNote = false) {
  if (!props.sessionId) return
  showDownvoteNote.value = false
  const note = skipNote ? undefined : downvoteNote.value.trim() || undefined

  try {
    const result = await platformApi.recordEvalsDownvote({
      sessionId: props.sessionId,
      turnId: props.messageId,
      userMessage: props.content,
      note,
    })
    downvoted.value = true
    emit('downvote')
    // The incident is created quietly; the workbench stays out of the way
    // (open it later from Settings → Evals when reviewing incidents).
    if (result.success && result.incidentId) {
      workbenchStore.notePendingIncident(result.incidentId)
    }
  } catch (error) {
    console.error('Downvote recording failed:', error)
  }
}

// Branch menu
const showBranchMenu = ref(false)
const branchBtnRef = ref<HTMLElement | null>(null)
const branchMenuPosition = ref({ top: 0, left: 0 })

const hasBranches = computed(() => props.branches && props.branches.length > 0)
const branchCount = computed(() => props.branches?.length || 0)

const branchMenuStyle = computed(() => ({
  top: `${branchMenuPosition.value.top}px`,
  left: `${branchMenuPosition.value.left}px`
}))

function toggleBranchMenu() {
  if (showBranchMenu.value) {
    showBranchMenu.value = false
    emit('menuOpen', false)
    return
  }

  if (branchBtnRef.value) {
    const btnRect = branchBtnRef.value.getBoundingClientRect()
    const menuWidth = 200
    const menuHeight = 150
    const padding = 8

    let top = btnRect.bottom + padding
    let left = btnRect.left

    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding
    }
    if (left < padding) {
      left = padding
    }
    if (top + menuHeight > window.innerHeight - padding) {
      top = btnRect.top - menuHeight - padding
    }

    branchMenuPosition.value = { top, left }
  }

  showBranchMenu.value = true
  emit('menuOpen', true)
}

function handleGoToBranch(sessionId: string) {
  showBranchMenu.value = false
  emit('menuOpen', false)
  emit('goToBranch', sessionId)
}

function handleNewBranch() {
  showBranchMenu.value = false
  emit('menuOpen', false)
  emit('branch')
}

// More menu
const showMoreMenu = ref(false)
const showTokenDetails = ref(false)
const moreBtnRef = ref<HTMLElement | null>(null)
const moreMenuPosition = ref({ top: 0, left: 0 })

const moreMenuStyle = computed(() => ({
  position: 'fixed' as const,
  top: `${moreMenuPosition.value.top}px`,
  left: `${moreMenuPosition.value.left}px`,
  zIndex: 1000,
}))

// Note: We don't auto-close menus when visible changes because
// the menu is teleported to body and user needs to move mouse to it.
// Menus are closed by click outside handler instead.

function handleViewTokenUsage() {
  showTokenDetails.value = !showTokenDetails.value
}

function formatCompact(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

// Calculate output speed in tokens/second
const outputSpeed = computed(() => {
  if (!props.usage?.durationMs || props.usage.durationMs <= 0) return null
  const seconds = props.usage.durationMs / 1000
  return (props.usage.outputTokens / seconds).toFixed(1)
})

function toggleMoreMenu() {
  if (showMoreMenu.value) {
    showMoreMenu.value = false
    showTokenDetails.value = false
    emit('menuOpen', false)
    return
  }

  if (moreBtnRef.value) {
    const btnRect = moreBtnRef.value.getBoundingClientRect()
    const menuWidth = 180
    const menuHeight = 120
    const padding = 4

    let top = btnRect.bottom + padding
    let left = btnRect.left

    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding
    }
    if (left < padding) {
      left = padding
    }
    if (top + menuHeight > window.innerHeight - padding) {
      top = btnRect.top - menuHeight - padding
    }

    moreMenuPosition.value = { top, left }
  }

  showMoreMenu.value = true
  emit('menuOpen', true)
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

// Click outside handler
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.branch-btn-wrapper')) {
    if (showBranchMenu.value) {
      showBranchMenu.value = false
      emit('menuOpen', false)
    }
  }
  // For more menu, check both the button wrapper and the teleported menu itself
  if (!target.closest('.more-btn-wrapper') && !target.closest('.more-menu')) {
    if (showMoreMenu.value) {
      showMoreMenu.value = false
      showTokenDetails.value = false
      emit('menuOpen', false)
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
  height: 28px;
  min-height: 28px;
  align-items: center;
  line-height: 0;
}

.actions.visible {
  opacity: 1;
}

.actions :deep(.tooltip-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  line-height: 0;
}

.action-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  line-height: 0;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex: 0 0 28px;
  position: relative;
}

.action-btn:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.action-btn:active {
  transform: scale(0.92);
}

.action-btn svg {
  width: 15px;
  height: 15px;
  display: block;
  flex: 0 0 15px;
}

/* Regenerate button animation */
.regenerate-btn svg {
  transition: transform 0.3s ease;
}

.regenerate-btn:hover svg {
  transform: rotate(180deg);
}

/* Downvote button */
.downvote-note-panel {
  width: 320px;
  padding: 10px;
  border-radius: 10px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-default-border, var(--border));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.downvote-note-input {
  width: 100%;
  resize: vertical;
  min-height: 44px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-input-bg, var(--bg-input));
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: 12.5px;
  line-height: 1.5;
  font-family: inherit;
}

.downvote-note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.downvote-note-btn {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.downvote-note-btn.secondary {
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.downvote-note-btn.primary {
  background: var(--ui-status-danger-bg);
  color: var(--ui-status-danger-fg, #b3403a);
  border: 1px solid var(--ui-status-danger-border);
}

.downvote-btn.downvoted {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.downvote-btn.downvoted:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
}

/* Copy button success state - when showing check icon */
.copy-btn:has(.lucide-check) {
  color: var(--ui-accent-primary-fg, var(--accent));
}

/* Speak button speaking state */
.speak-btn.speaking {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.speak-btn.speaking:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
}

/* Branch button with count */
.branch-btn-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  line-height: 0;
}

.action-btn.has-branches {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.branch-count-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  background: var(--ui-accent-primary-fg, var(--accent));
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Branch menu */
.branch-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  max-width: 280px;
  background: var(--ui-surface-floating-bg, var(--bg-floating));
  backdrop-filter: blur(20px);
  border: 1px solid var(--ui-border-strong-border, var(--border-strong));
  border-radius: 12px;
  box-shadow: var(--shadow-floating);
  overflow: hidden;
  animation: menuSlideIn 0.15s ease-out;
}

@keyframes menuSlideIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.branch-menu-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}

.branch-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  text-align: left;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.branch-menu-item:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
}

.branch-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-menu-footer {
  padding: 4px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
}

.branch-menu-new {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--ui-accent-primary-fg, var(--accent));
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.branch-menu-new:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
}

/* More menu */
.more-btn-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  line-height: 0;
}
</style>

<!-- Global styles for Teleported menu -->
<style>
.more-menu {
  min-width: 180px;
  background: var(--ui-surface-floating-bg, var(--bg-floating));
  backdrop-filter: blur(20px);
  border: 1px solid var(--ui-border-strong-border, var(--border-strong));
  border-radius: 10px;
  box-shadow: var(--shadow-floating);
  overflow: hidden;
  animation: moreMenuSlideIn 0.15s ease-out;
}

@keyframes moreMenuSlideIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.more-menu-actions {
  padding: 4px;
}

.more-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.more-menu-item:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
}

.more-menu-item-badge {
  margin-left: auto;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-variant-numeric: tabular-nums;
}

.more-menu-details {
  padding: 8px 12px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  background: rgba(0, 0, 0, 0.02);
}

.token-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 3px 0;
}

.token-detail-row span:first-child {
  color: var(--ui-text-muted-fg, var(--muted));
}

.token-detail-row span:last-child {
  color: var(--ui-text-primary-fg, var(--text));
  font-variant-numeric: tabular-nums;
}

.token-detail-row.model span:last-child {
  font-size: 11px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
