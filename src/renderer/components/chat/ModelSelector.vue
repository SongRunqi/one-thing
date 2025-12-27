<template>
  <div class="model-selector" ref="selectorRef" :class="{ compact: isCompact }">
    <button class="model-selector-btn" @click="openPanel" :title="displayName || 'Select model'">
      <!-- Provider icon -->
      <span class="provider-icon">
        <ProviderIcon :provider="currentProvider" :size="18" />
      </span>
      <!-- Model name (hidden in compact mode) -->
      <span class="model-text">{{ displayName }}</span>
      <!-- Chevron -->
      <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <!-- New two-column panel -->
    <ModelSelectorPanel
      v-model:visible="showPanel"
      :position="panelPosition"
      :current-provider="currentProvider"
      :current-model="currentModel"
      @select="handleSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import type { AIProvider } from '../../../shared/ipc'
import ProviderIcon from '../settings/ProviderIcon.vue'
import ModelSelectorPanel from './ModelSelectorPanel.vue'

interface Props {
  sessionId?: string
}

const props = defineProps<Props>()

const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()

const showPanel = ref(false)
const selectorRef = ref<HTMLElement | null>(null)
const panelPosition = ref<{ bottom: string; left: string }>({ bottom: '0px', left: '0px' })

// Compact mode when there's not enough space
const isCompact = ref(false)
let resizeObserver: ResizeObserver | null = null

// Check if the button is being clipped or has very little space
function checkCompactMode() {
  if (!selectorRef.value) return

  // Get the parent toolbar-left container
  const parent = selectorRef.value.closest('.toolbar-left') as HTMLElement
  if (!parent) {
    // Fallback to window-based check
    isCompact.value = window.innerWidth < 550
    return
  }

  // Calculate available width: parent width minus other siblings
  const parentRect = parent.getBoundingClientRect()
  const siblings = Array.from(parent.children) as HTMLElement[]
  let usedWidth = 0

  for (const sibling of siblings) {
    if (sibling !== selectorRef.value) {
      usedWidth += sibling.getBoundingClientRect().width + 4 // 4px gap
    }
  }

  const availableForSelector = parentRect.width - usedWidth
  // If available width is less than 120px, go compact (just show icon)
  // The full selector needs about 150-180px for icon + text + chevron
  isCompact.value = availableForSelector < 120
}

onMounted(() => {
  checkCompactMode()

  // Use ResizeObserver on the parent toolbar to detect size changes
  if (selectorRef.value) {
    const parent = selectorRef.value.closest('.toolbar-left')
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

// Get the session for this selector (if sessionId provided)
const currentSession = computed(() => {
  const sid = props.sessionId
  if (!sid) return null
  return sessionsStore.sessions.find(s => s.id === sid) || null
})

// Use session's lastProvider if available, otherwise fall back to global settings
const currentProvider = computed(() => {
  const session = currentSession.value
  if (session?.lastProvider) {
    return session.lastProvider as AIProvider
  }
  return settingsStore.settings?.ai?.provider || 'claude'
})

// Use session's lastModel if available, otherwise fall back to global settings
const currentModel = computed(() => {
  const session = currentSession.value
  if (session?.lastModel) {
    return session.lastModel
  }
  return settingsStore.settings?.ai?.providers?.[currentProvider.value]?.model || ''
})

// Display name with alias support
const displayName = computed(() => {
  if (!currentModel.value) return 'Select model'
  return settingsStore.getModelDisplayName(currentModel.value)
})

function openPanel() {
  if (selectorRef.value) {
    const rect = selectorRef.value.getBoundingClientRect()
    const panelWidth = 480

    let left = rect.left + (rect.width / 2) - (panelWidth / 2)
    const bottom = window.innerHeight - rect.top + 8

    // Keep panel within viewport
    if (left < 16) {
      left = 16
    }
    if (left + panelWidth > window.innerWidth - 16) {
      left = window.innerWidth - panelWidth - 16
    }

    panelPosition.value = {
      bottom: `${bottom}px`,
      left: `${left}px`
    }
  }
  showPanel.value = true
}

async function handleSelect(provider: string, model: string) {
  // Get the effective session ID (props or current)
  const effectiveSessionId = props.sessionId || sessionsStore.currentSessionId

  // Update UI state
  if (provider !== currentProvider.value) {
    settingsStore.updateAIProvider(provider as AIProvider)
  }
  settingsStore.updateModel(model, provider as AIProvider)

  // Save to session for per-session persistence
  if (effectiveSessionId) {
    await window.electronAPI.updateSessionModel(effectiveSessionId, provider, model)
    // Update local session cache in store
    const session = sessionsStore.sessions.find(s => s.id === effectiveSessionId)
    if (session) {
      session.lastProvider = provider
      session.lastModel = model
    }
  }
}
</script>

<style scoped>
.model-selector {
  position: relative;
}

.model-selector-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--muted);
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  height: 32px;
}

.model-selector-btn:hover {
  background: var(--hover);
  color: var(--text);
  transform: scale(1.02);
}

.model-selector-btn:active {
  transform: scale(0.97);
}

html[data-theme='light'] .model-selector-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.provider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--text);
}

.model-text {
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron-icon {
  color: var(--muted);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.model-selector-btn:hover .chevron-icon {
  color: var(--text);
}

/* Compact mode - hide text and chevron, show only icon */
.model-selector.compact .model-text,
.model-selector.compact .chevron-icon {
  display: none;
}

.model-selector.compact .model-selector-btn {
  padding: 0;
  width: 32px;
  justify-content: center;
}
</style>
