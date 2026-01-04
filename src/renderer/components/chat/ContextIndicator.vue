<template>
  <div
    class="context-indicator"
    :class="[statusClass, { compact: isCompact }]"
    @mouseenter="handleMouseEnter"
    @mouseleave="showTooltip = false"
    ref="indicatorRef"
  >
    <!-- Icon -->
    <Zap
      :size="14"
      :stroke-width="2"
      class="context-icon"
      :class="{ pulse: isStreaming }"
    />
    <!-- Percentage -->
    <span class="context-percent">{{ percentage }}%</span>

    <!-- Hover tooltip (teleported to body to avoid clipping) -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showTooltip" class="context-tooltip" :style="tooltipStyle">
          <div class="tooltip-row">
            <span>Context:</span>
            <span class="tooltip-value">{{ formatTokens(currentContextSize) }} / {{ formatTokens(contextLength) }}</span>
          </div>
          <div class="tooltip-divider"></div>
          <div class="tooltip-row">
            <span>Total:</span>
            <span class="tooltip-value">{{ formatTokens(totalTokens) }}</span>
          </div>
          <div class="tooltip-row sub">
            <span>Input:</span>
            <span class="tooltip-value">{{ formatTokens(totalInputTokens) }}</span>
          </div>
          <div class="tooltip-row sub">
            <span>Output:</span>
            <span class="tooltip-value">{{ formatTokens(totalOutputTokens) }}</span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Zap } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import type { OpenRouterModel } from '../../../shared/ipc'

const props = defineProps<{
  sessionId?: string
}>()

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()

// UI state
const showTooltip = ref(false)
const indicatorRef = ref<HTMLElement | null>(null)
const tooltipPosition = ref({ top: 0, left: 0 })

// Tooltip style for absolute positioning
const tooltipStyle = computed(() => ({
  position: 'fixed' as const,
  bottom: `${window.innerHeight - tooltipPosition.value.top + 8}px`,
  left: `${tooltipPosition.value.left}px`,
  transform: 'translateX(-50%)',
}))

// Handle mouse enter - calculate tooltip position
function handleMouseEnter() {
  if (indicatorRef.value) {
    const rect = indicatorRef.value.getBoundingClientRect()
    tooltipPosition.value = {
      top: rect.top,
      left: rect.left + rect.width / 2,
    }
  }
  showTooltip.value = true
}

// Compact mode when there's not enough space
const isCompact = ref(false)
let resizeObserver: ResizeObserver | null = null

function checkCompactMode() {
  if (!indicatorRef.value) return

  // Get the parent toolbar-left container
  const parent = indicatorRef.value.closest('.toolbar-left') as HTMLElement
  if (!parent) {
    // Fallback to window-based check
    isCompact.value = window.innerWidth < 500
    return
  }

  // Calculate available width: parent width minus other siblings
  const parentRect = parent.getBoundingClientRect()
  const siblings = Array.from(parent.children) as HTMLElement[]
  let usedWidth = 0

  for (const sibling of siblings) {
    if (sibling !== indicatorRef.value) {
      usedWidth += sibling.getBoundingClientRect().width + 4 // 4px gap
    }
  }

  const availableForIndicator = parentRect.width - usedWidth
  // If available width is less than 70px, go compact (just show icon)
  // The full indicator needs about 60-80px for icon + percentage
  isCompact.value = availableForIndicator < 70
}

// Model info cache
const currentModelInfo = ref<OpenRouterModel | null>(null)

// Get the session for this selector
const currentSession = computed(() => {
  const sid = props.sessionId
  if (!sid) return null
  return sessionsStore.sessions.find(s => s.id === sid) || null
})

// Current provider and model
const currentProvider = computed(() => {
  const session = currentSession.value
  if (session?.lastProvider) {
    return session.lastProvider
  }
  return settingsStore.settings?.ai?.provider || 'claude'
})

const currentModel = computed(() => {
  const session = currentSession.value
  if (session?.lastModel) {
    return session.lastModel
  }
  return settingsStore.settings?.ai?.providers?.[currentProvider.value]?.model || ''
})

// Get context length from model info
const contextLength = computed(() => {
  if (currentModelInfo.value?.context_length) {
    return currentModelInfo.value.context_length
  }
  // Fallback defaults based on common models
  const model = currentModel.value.toLowerCase()
  if (model.includes('claude-3') || model.includes('claude-sonnet') || model.includes('claude-opus')) return 200000
  if (model.includes('gpt-4o') || model.includes('gpt-4-turbo')) return 128000
  if (model.includes('gemini-1.5-pro')) return 2000000
  if (model.includes('gemini-2')) return 1000000
  if (model.includes('deepseek')) return 64000
  return 128000 // Default
})

// Get real-time usage data from chat store (per-session)
const sessionUsage = computed(() => {
  if (!props.sessionId) return null
  return chatStore.getSessionUsage(props.sessionId)
})
// Current context size = input tokens from last request (context window limit applies to input)
const currentContextSize = computed(() => sessionUsage.value?.contextSize ?? 0)
const isStreaming = computed(() => props.sessionId ? chatStore.isSessionGenerating(props.sessionId) : false)

// Accumulated token usage for this session
const totalInputTokens = computed(() => sessionUsage.value?.totalInputTokens ?? 0)
const totalOutputTokens = computed(() => sessionUsage.value?.totalOutputTokens ?? 0)
const totalTokens = computed(() => sessionUsage.value?.totalTokens ?? 0)

// Percentage based on current context size, not cumulative tokens
const percentage = computed(() => {
  if (contextLength.value === 0) return 0
  return Math.min(Math.round((currentContextSize.value / contextLength.value) * 100), 100)
})

const statusClass = computed(() => {
  if (percentage.value >= 90) return 'danger'
  if (percentage.value >= 70) return 'warning'
  return ''
})

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return String(count)
}

// Load model info when model changes
async function loadModelInfo() {
  if (!currentProvider.value || !currentModel.value) return

  try {
    const response = await window.electronAPI.getModelsWithCapabilities(currentProvider.value)
    if (response.success && response.models) {
      const model = response.models.find(m => m.id === currentModel.value)
      if (model) {
        currentModelInfo.value = model
      }
    }
  } catch (error) {
    console.error('Failed to load model info:', error)
  }
}

// Watch for model changes
watch([currentProvider, currentModel], () => {
  loadModelInfo()
}, { immediate: true })

// Load session usage when sessionId changes
watch(() => props.sessionId, async (newSessionId) => {
  if (newSessionId) {
    await chatStore.loadSessionUsage(newSessionId)
  }
}, { immediate: true })

onMounted(() => {
  loadModelInfo()
  checkCompactMode()

  // Use ResizeObserver on the parent toolbar to detect size changes
  if (indicatorRef.value) {
    const parent = indicatorRef.value.closest('.toolbar-left')
    if (parent) {
      resizeObserver = new ResizeObserver(() => {
        checkCompactMode()
      })
      resizeObserver.observe(parent)
    }
  }

  // Also listen for window resize as fallback
  window.addEventListener('resize', checkCompactMode)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkCompactMode)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<style scoped>
.context-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 32px;
  border-radius: 8px;
  cursor: default;
  position: relative;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.context-indicator:hover {
  background: var(--hover);
}

.context-icon {
  color: var(--accent);
  transition: color 0.2s ease;
}

.context-icon.pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.context-percent {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-weight: 500;
  min-width: 28px;
}

/* Status colors */
.context-indicator.warning .context-icon,
.context-indicator.warning .context-percent {
  color: var(--text-warning);
}

.context-indicator.danger .context-icon,
.context-indicator.danger .context-percent {
  color: var(--text-error);
}


/* Compact mode - hide percentage text, show only icon */
.context-indicator.compact .context-percent {
  display: none;
}

.context-indicator.compact {
  padding: 0;
  width: 32px;
  justify-content: center;
}
</style>

<style>
/* Tooltip styles (global because teleported to body) */
.context-tooltip {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 140px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  pointer-events: none;
}

.context-tooltip .tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}

.context-tooltip .tooltip-value {
  color: var(--text);
  font-family: var(--font-mono);
}

.context-tooltip .tooltip-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}

.context-tooltip .tooltip-row.sub {
  font-size: 11px;
  opacity: 0.7;
  padding-left: 8px;
}

/* Tooltip fade transitions */
.context-tooltip.fade-enter-active,
.context-tooltip.fade-leave-active {
  transition: opacity 0.15s ease;
}

.context-tooltip.fade-enter-from,
.context-tooltip.fade-leave-to {
  opacity: 0;
}
</style>
