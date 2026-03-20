<template>
  <div :class="['actions', role === 'user' ? 'user-actions' : '', { visible }]">
    <!-- Copy button -->
    <Tooltip :text="copied ? 'Copied!' : 'Copy'">
      <button class="action-btn copy-btn" @click="handleCopy">
        <Check v-if="copied" :size="15" :stroke-width="2" />
        <Copy v-else :size="15" :stroke-width="1.5" />
      </button>
    </Tooltip>

    <!-- Edit button for user messages -->
    <Tooltip v-if="role === 'user'" text="Edit">
      <button class="action-btn edit-btn" @click.stop="emit('edit')">
        <Pencil :size="15" :stroke-width="1.5" />
      </button>
    </Tooltip>

    <!-- Regenerate button (for assistant messages) -->
    <Tooltip v-if="role === 'assistant'" text="Regenerate">
      <button class="action-btn regenerate-btn" @click="emit('regenerate')">
        <RefreshCw :size="15" :stroke-width="2" />
      </button>
    </Tooltip>

    <!-- Speak button (for assistant messages with TTS support) -->
    <Tooltip v-if="role === 'assistant' && ttsSupported" :text="isCurrentlySpeaking ? 'Stop' : 'Speak'">
      <button
        class="action-btn speak-btn"
        :class="{ speaking: isCurrentlySpeaking }"
        @click="handleSpeak"
      >
        <Pause v-if="isCurrentlySpeaking" :size="15" :stroke-width="2" />
        <Volume2 v-else :size="15" :stroke-width="2" />
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
          <GitBranch :size="15" :stroke-width="2" />
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
              <ChevronRight :size="12" :stroke-width="2" />
            </button>
          </div>
          <div class="branch-menu-footer">
            <button class="branch-menu-new" @click="handleNewBranch">
              <Plus :size="12" :stroke-width="2" />
              <span>New branch</span>
            </button>
          </div>
        </div>
      </div>
    </Tooltip>

    <!-- Regenerate button for user messages -->
    <Tooltip v-if="role === 'user'" text="Regenerate response">
      <button class="action-btn regenerate-btn" @click="emit('regenerate')">
        <RefreshCw :size="15" :stroke-width="2" />
      </button>
    </Tooltip>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Tooltip from '@/components/common/Tooltip.vue'
import { useTTS } from '@/composables/useTTS'
import type { AgentVoice } from '@/types'
import { stripMarkdown } from '@/composables/useMarkdownRenderer'
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
} from 'lucide-vue-next'

interface BranchInfo {
  id: string
  name: string
}

interface Props {
  role: 'user' | 'assistant'
  content: string
  visible: boolean
  branches?: BranchInfo[]
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
  menuOpen: [isOpen: boolean]
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

// Click outside handler
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.branch-btn-wrapper')) {
    if (showBranchMenu.value) {
      showBranchMenu.value = false
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

/* Copy button success state - when showing check icon */
.copy-btn:has(.lucide-check) {
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
  z-index: var(--z-modal);
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

</style>
