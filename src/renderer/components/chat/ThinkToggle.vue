<template>
  <Tooltip
    v-if="visible"
    :text="tooltipText"
  >
    <button
      :class="['think-toggle', { active: thinking }]"
      type="button"
      @click="toggle"
    >
      <Brain :size="14" />
      <span class="think-label">Think</span>
    </button>
  </Tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Brain } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import type { AIProvider } from '../../../shared/ipc'
import Tooltip from '../common/Tooltip.vue'

interface Props {
  sessionId?: string
}

const props = defineProps<Props>()

const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()

// Legacy "swap two model ids" mode — used by providers that ship a
// dedicated reasoning model alongside a non-reasoning one. Toggling
// here just changes the active model.
const THINKING_PAIRS: Record<string, { normal: string; thinking: string }> = {
  // DeepSeek's classic V3 pair. The newer v4 series instead exposes
  // thinking as a request flag (handled separately below).
  deepseek: { normal: 'deepseek-chat', thinking: 'deepseek-reasoner' },
}

const currentSession = computed(() => {
  const sid = props.sessionId
  if (!sid) return null
  return sessionsStore.sessions.find((s) => s.id === sid) || null
})

const currentProvider = computed(() => {
  const session = currentSession.value
  if (session?.lastProvider) return session.lastProvider
  return settingsStore.settings?.ai?.provider || ''
})

const currentModel = computed(() => {
  const session = currentSession.value
  if (session?.lastModel) return session.lastModel
  return settingsStore.settings?.ai?.providers?.[currentProvider.value]?.model || ''
})

// Native thinking toggle: the model itself supports a thinking flag
// (DeepSeek v4 series). State is stored per-model on the provider config.
const isNativeThinkingModel = computed(() => {
  if (currentProvider.value !== 'deepseek') return false
  return /(^|[^a-z])v4/.test(currentModel.value.toLowerCase())
})

const nativeThinkingEnabled = computed(() => {
  const map =
    settingsStore.settings?.ai?.providers?.[currentProvider.value]?.thinkingByModel
  // Default: enabled. User has to explicitly toggle off.
  return map?.[currentModel.value] !== false
})

const pair = computed(() => {
  if (isNativeThinkingModel.value) return null
  return THINKING_PAIRS[currentProvider.value] || null
})

const visible = computed(() => isNativeThinkingModel.value || !!pair.value)

const thinking = computed(() => {
  if (isNativeThinkingModel.value) return nativeThinkingEnabled.value
  if (!pair.value) return false
  return currentModel.value === pair.value.thinking
})

const tooltipText = computed(() => {
  if (isNativeThinkingModel.value) {
    return thinking.value
      ? `Thinking ON for ${currentModel.value}. Click to disable.`
      : `Thinking OFF for ${currentModel.value}. Click to enable.`
  }
  if (!pair.value) return ''
  return thinking.value
    ? `Thinking ON — using ${pair.value.thinking}. Click to disable.`
    : `Thinking OFF — using ${pair.value.normal}. Click to enable.`
})

async function toggle() {
  if (isNativeThinkingModel.value) {
    await toggleNativeThinking()
    return
  }
  if (pair.value) {
    await toggleLegacyPair(pair.value)
  }
}

async function toggleNativeThinking() {
  const provider = currentProvider.value as AIProvider
  const model = currentModel.value
  if (!provider || !model) return

  const settings = settingsStore.settings
  if (!settings) return

  const next = !nativeThinkingEnabled.value
  const cfg = settings.ai.providers[provider] ?? {
    apiKey: '',
    model: '',
    selectedModels: [],
  }
  const map = { ...(cfg.thinkingByModel ?? {}) }
  map[model] = next

  // Mutate via store so the watch-based persist + cross-window broadcast fire.
  settingsStore.settings = {
    ...settings,
    ai: {
      ...settings.ai,
      providers: {
        ...settings.ai.providers,
        [provider]: { ...cfg, thinkingByModel: map },
      },
    },
  }
  await settingsStore.saveSettings(settingsStore.settings)
}

async function toggleLegacyPair(pair: { normal: string; thinking: string }) {
  const target = thinking.value ? pair.normal : pair.thinking
  const provider = currentProvider.value as AIProvider

  // Update settings store so other views (selector etc.) reflect immediately.
  settingsStore.updateModel(target, provider)

  // Persist to session so the toggle survives reloads / chat continuity.
  const sid = props.sessionId || sessionsStore.currentSessionId
  if (sid) {
    await window.electronAPI.updateSessionModel(sid, provider, target)
    const session = sessionsStore.sessions.find((s) => s.id === sid)
    if (session) {
      session.lastProvider = provider
      session.lastModel = target
    }
  }
}
</script>

<style scoped>
.think-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.think-toggle:hover {
  color: var(--text);
  background: var(--hover);
}

.think-toggle:active {
  transform: scale(0.97);
}

.think-toggle.active {
  color: #a855f7;
  border-color: rgba(168, 85, 247, 0.5);
  background: rgba(168, 85, 247, 0.1);
}

.think-toggle.active:hover {
  background: rgba(168, 85, 247, 0.18);
}

.think-label {
  letter-spacing: 0.2px;
}

@media (max-width: 600px) {
  .think-label {
    display: none;
  }
  .think-toggle {
    padding: 0 8px;
  }
}
</style>
