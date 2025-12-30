<template>
  <div :class="['actions', role === 'user' ? 'user-actions' : '', { visible }]">
    <!-- Copy button -->
    <Tooltip :text="copied ? 'Copied!' : 'Copy'">
      <button class="action-btn copy-btn" @click="handleCopy">
        <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
    </Tooltip>

    <!-- Edit button for user messages -->
    <Tooltip v-if="role === 'user'" text="Edit">
      <button class="action-btn edit-btn" @click.stop="emit('edit')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      </button>
    </Tooltip>

    <!-- Regenerate button (for assistant messages) -->
    <Tooltip v-if="role === 'assistant'" text="Regenerate">
      <button class="action-btn regenerate-btn" @click="emit('regenerate')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"/>
          <path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </button>
    </Tooltip>

    <!-- Speak button (for assistant messages with TTS support) -->
    <Tooltip v-if="role === 'assistant' && ttsSupported" :text="isCurrentlySpeaking ? 'Stop' : 'Speak'">
      <button
        class="action-btn speak-btn"
        :class="{ speaking: isCurrentlySpeaking }"
        @click="handleSpeak"
      >
        <!-- Play icon (not speaking) -->
        <svg v-if="!isCurrentlySpeaking" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
        <!-- Stop icon (speaking) -->
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg>
      </button>
    </Tooltip>

    <!-- Branch button (for assistant messages) -->
    <Tooltip v-if="role === 'assistant'" :text="hasBranches ? `${branchCount} branch${branchCount > 1 ? 'es' : ''}` : 'Branch'">
      <div class="branch-btn-wrapper" ref="branchBtnRef">
        <button
          class="action-btn"
          :class="{ 'has-branches': hasBranches }"
          @click="hasBranches ? toggleBranchMenu() : emit('branch')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="6" y1="3" x2="6" y2="15"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          <span v-if="hasBranches" class="branch-count-badge">{{ branchCount }}</span>
        </button>
        <!-- Branch dropdown menu -->
        <div v-if="showBranchMenu && hasBranches" class="branch-menu" :style="branchMenuStyle">
          <div class="branch-menu-list">
            <button
              v-for="branch in branches"
              :key="branch.id"
              class="branch-menu-item"
              @click="handleGoToBranch(branch.id)"
            >
              <span class="branch-name">{{ branch.name || 'Untitled branch' }}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
          <div class="branch-menu-footer">
            <button class="branch-menu-new" @click="handleNewBranch">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span>New branch</span>
            </button>
          </div>
        </div>
      </div>
    </Tooltip>

    <!-- Regenerate button for user messages -->
    <Tooltip v-if="role === 'user'" text="Regenerate response">
      <button class="action-btn regenerate-btn" @click="emit('regenerate')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"/>
          <path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </button>
    </Tooltip>

    <!-- More menu button (for assistant messages with usage info) -->
    <div v-if="role === 'assistant'" class="more-btn-wrapper" ref="moreBtnRef">
      <Tooltip text="More info">
        <button class="action-btn more-btn" @click.stop="toggleMoreMenu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="19" cy="12" r="1"/>
            <circle cx="5" cy="12" r="1"/>
          </svg>
        </button>
      </Tooltip>
      <!-- More menu dropdown -->
      <div v-if="showMoreMenu" class="more-menu" :style="moreMenuStyle">
        <div class="more-menu-section">
          <div class="more-menu-title">Token Usage</div>
          <div v-if="usage" class="token-usage-info">
            <div class="token-row">
              <span class="token-label">Input</span>
              <span class="token-value">{{ formatNumber(usage.inputTokens) }}</span>
            </div>
            <div class="token-row">
              <span class="token-label">Output</span>
              <span class="token-value">{{ formatNumber(usage.outputTokens) }}</span>
            </div>
            <div class="token-row total">
              <span class="token-label">Total</span>
              <span class="token-value">{{ formatNumber(usage.totalTokens) }}</span>
            </div>
          </div>
          <div v-else class="token-usage-empty">No usage data</div>
        </div>
        <div v-if="model" class="more-menu-section">
          <div class="more-menu-title">Model</div>
          <div class="model-info">{{ model }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Tooltip from '@/components/common/Tooltip.vue'
import { useTTS } from '@/composables/useTTS'
import type { AgentVoice } from '@/types'
import { stripMarkdown } from '@/composables/useMarkdownRenderer'

interface BranchInfo {
  id: string
  name: string
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface Props {
  role: 'user' | 'assistant'
  content: string
  visible: boolean
  branches?: BranchInfo[]
  usage?: TokenUsage
  model?: string
  voiceConfig?: AgentVoice
  messageId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  copy: []
  edit: []
  regenerate: []
  branch: []
  goToBranch: [sessionId: string]
}>()

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
    await speak(textContent, props.voiceConfig)
  } catch (error) {
    console.error('TTS error:', error)
  } finally {
    speakingMessageId.value = null
  }
}

// Copy
const copied = ref(false)

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.content)
    copied.value = true
    emit('copy')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
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
}

function handleGoToBranch(sessionId: string) {
  showBranchMenu.value = false
  emit('goToBranch', sessionId)
}

function handleNewBranch() {
  showBranchMenu.value = false
  emit('branch')
}

// More menu
const showMoreMenu = ref(false)
const moreBtnRef = ref<HTMLElement | null>(null)
const moreMenuPosition = ref({ top: 0, left: 0 })

const moreMenuStyle = computed(() => ({
  top: `${moreMenuPosition.value.top}px`,
  left: `${moreMenuPosition.value.left}px`
}))

function toggleMoreMenu() {
  if (showMoreMenu.value) {
    showMoreMenu.value = false
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
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

// Click outside handler
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.branch-btn-wrapper')) {
    showBranchMenu.value = false
  }
  if (!target.closest('.more-btn-wrapper')) {
    showMoreMenu.value = false
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
}

.actions.visible {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
  position: relative;
}

.action-btn:hover {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
}

.action-btn:active {
  transform: scale(0.92);
}

.action-btn svg {
  width: 15px;
  height: 15px;
}

/* Copy button success state */
.copy-btn:has(svg polyline) {
  color: var(--accent);
}

/* Speak button speaking state */
.speak-btn.speaking {
  color: var(--accent);
}

.speak-btn.speaking:hover {
  background: rgba(var(--accent-rgb), 0.15);
}

/* Branch button with count */
.branch-btn-wrapper {
  position: relative;
}

.action-btn.has-branches {
  color: var(--accent);
}

.branch-count-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  background: var(--accent);
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
  background: var(--bg-floating);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
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
  color: var(--text);
  font-size: 13px;
  text-align: left;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.branch-menu-item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

.branch-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-menu-footer {
  padding: 4px;
  border-top: 1px solid var(--border);
}

.branch-menu-new {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.branch-menu-new:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

/* More menu */
.more-btn-wrapper {
  position: relative;
}

.more-menu {
  position: fixed;
  z-index: 1000;
  min-width: 160px;
  background: var(--bg-floating);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: var(--shadow-floating);
  overflow: hidden;
  animation: menuSlideIn 0.15s ease-out;
}

.more-menu-section {
  padding: 12px;
}

.more-menu-section + .more-menu-section {
  border-top: 1px solid var(--border);
}

.more-menu-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.token-usage-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.token-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.token-label {
  color: var(--muted);
}

.token-value {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.token-row.total {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
  font-weight: 500;
}

.token-usage-empty {
  font-size: 12px;
  color: var(--muted);
}

.model-info {
  font-size: 12px;
  color: var(--text);
  word-break: break-all;
}
</style>
