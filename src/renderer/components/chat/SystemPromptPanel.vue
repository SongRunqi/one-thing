<template>
  <div class="system-prompt-panel">
    <div
      v-if="error"
      class="system-prompt-state error"
    >
      <AlertCircle
        :size="15"
        aria-hidden="true"
      />
      <span>{{ error }}</span>
    </div>

    <div
      v-else-if="loading && !snapshot"
      class="system-prompt-state"
    >
      Loading...
    </div>

    <div
      v-else-if="snapshot"
      class="system-prompt-scroll"
    >
      <div class="system-prompt-meta-grid">
        <button
          type="button"
          class="system-prompt-meta-item"
          :class="{ active: activeSection === 'prompt' }"
          @click="activeSection = 'prompt'"
        >
          <span>Prompt</span>
          <strong>{{ formattedChars }}</strong>
        </button>
        <button
          type="button"
          class="system-prompt-meta-item"
          :class="{ active: activeSection === 'tools' }"
          @click="activeSection = 'tools'"
        >
          <span>Tools</span>
          <strong :class="{ muted: !snapshot.tools.hasTools }">{{ toolsStatus }}</strong>
        </button>
        <button
          type="button"
          class="system-prompt-meta-item"
          :class="{ active: activeSection === 'skills' }"
          @click="activeSection = 'skills'"
        >
          <span>Skills</span>
          <strong :class="{ muted: !snapshot.skills.includedInPrompt }">{{ skillsStatus }}</strong>
        </button>
        <button
          type="button"
          class="system-prompt-meta-item"
          :class="{ active: activeSection === 'agent' }"
          @click="activeSection = 'agent'"
        >
          <span>Agent</span>
          <strong>{{ snapshot.agentName || 'Default Agent' }}</strong>
        </button>
      </div>

      <div
        v-if="!snapshot.credentialsReady || !snapshot.providerSupported"
        class="system-prompt-warning"
      >
        {{ providerWarning }}
      </div>

      <section
        v-if="activeSection === 'tools'"
        class="system-prompt-group system-prompt-detail"
      >
        <div class="system-prompt-group-head">
          <span>Tools</span>
          <span>{{ snapshot.tools.modelFacingCount }}/{{ snapshot.tools.configuredCount }}</span>
        </div>
        <div
          v-if="toolChips.length"
          class="system-prompt-chip-list"
        >
          <span
            v-for="tool in toolChips"
            :key="tool.key"
            class="system-prompt-chip"
            :class="{ inactive: !snapshot.tools.hasTools }"
            :title="tool.description || tool.name"
          >
            {{ tool.name }}
          </span>
        </div>
        <p
          v-else
          class="system-prompt-empty"
        >
          No tools loaded
        </p>
      </section>

      <section
        v-else-if="activeSection === 'skills'"
        class="system-prompt-group system-prompt-detail"
      >
        <div class="system-prompt-group-head">
          <span>Skills</span>
          <span>{{ snapshot.skills.count }}</span>
        </div>
        <div
          v-if="snapshot.skills.items.length"
          class="system-prompt-chip-list"
        >
          <span
            v-for="skill in snapshot.skills.items"
            :key="skill.id"
            class="system-prompt-chip"
            :class="{ inactive: !snapshot.skills.includedInPrompt }"
            :title="skill.description || skill.name"
          >
            {{ skill.name }}
          </span>
        </div>
        <p
          v-else
          class="system-prompt-empty"
        >
          No skills loaded
        </p>
      </section>

      <section
        v-else-if="activeSection === 'agent'"
        class="system-prompt-group system-prompt-detail"
      >
        <div class="system-prompt-group-head">
          <span>Agent</span>
          <span>{{ snapshot.agentId || 'default' }}</span>
        </div>
        <dl class="system-prompt-info-list">
          <div>
            <dt>Name</dt>
            <dd>{{ snapshot.agentName || 'Default Agent' }}</dd>
          </div>
          <div>
            <dt>Workdir</dt>
            <dd>{{ snapshot.workingDirectory || 'None' }}</dd>
          </div>
        </dl>
      </section>

      <section
        v-else
        class="system-prompt-group system-prompt-detail system-prompt-prompt-section"
      >
        <div class="system-prompt-group-head">
          <span>Prompt</span>
          <button
            type="button"
            class="system-prompt-copy-button"
            :class="{ copied }"
            title="Copy system prompt"
            :disabled="!snapshot.systemPrompt"
            @click="copyPrompt"
          >
            <Check
              v-if="copied"
              :size="14"
              aria-hidden="true"
            />
            <Copy
              v-else
              :size="14"
              aria-hidden="true"
            />
          </button>
        </div>
        <pre class="system-prompt-text">{{ snapshot.systemPrompt }}</pre>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AlertCircle, Check, Copy } from 'lucide-vue-next'
import type { SystemPromptSnapshot } from '@/types'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { copyTextToClipboard } from '@/utils/clipboard'

const props = defineProps<{
  sessionId?: string
  workingDirectory?: string
  agentId?: string
  lastProvider?: string
  lastModel?: string
}>()

const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()
const snapshot = ref<SystemPromptSnapshot | null>(null)
const loading = ref(false)
const error = ref('')
const copied = ref(false)
const activeSection = ref<'tools' | 'skills' | 'agent' | 'prompt'>('prompt')
let requestId = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const refreshKey = computed(() => {
  const settings = settingsStore.settings
  const variables = props.sessionId
    ? sessionsStore.sessionVariables.get(props.sessionId)?.map(variable => [
      variable.name,
      variable.scope,
      variable.value,
      variable.updatedAt,
    ].join(':')).join('|') || ''
    : ''

  return JSON.stringify({
    sessionId: props.sessionId || '',
    workingDirectory: props.workingDirectory || '',
    agentId: props.agentId || '',
    lastProvider: props.lastProvider || '',
    lastModel: props.lastModel || '',
    aiProvider: settings.ai.provider,
    aiModel: settings.ai.providers?.[settings.ai.provider]?.model || '',
    toolsEnabled: settings.tools?.enableToolCalls,
    toolSettings: settings.tools?.tools,
    skillsEnabled: settings.skills?.enableSkills,
    skillSettings: settings.skills?.skills,
    variables,
  })
})

const formattedChars = computed(() => {
  const count = snapshot.value?.systemPromptChars ?? 0
  return `${count.toLocaleString()} chars`
})

const toolsStatus = computed(() => {
  const tools = snapshot.value?.tools
  if (!tools) return 'Unknown'
  if (!tools.enableToolCalls) return 'Off'
  if (!tools.modelSupportsTools) return 'Unsupported'
  if (!tools.hasTools) return 'None'
  return `${tools.modelFacingCount} loaded`
})

const skillsStatus = computed(() => {
  const skills = snapshot.value?.skills
  if (!skills) return 'Unknown'
  if (!skills.enabled) return 'Off'
  if (!skills.count) return 'None'
  return skills.includedInPrompt ? `${skills.count} in prompt` : `${skills.count} available`
})

const providerWarning = computed(() => {
  if (!snapshot.value?.providerSupported) return 'Provider is not supported.'
  if (!snapshot.value?.credentialsReady) return 'Provider credentials are missing.'
  return ''
})

const toolChips = computed(() => {
  const tools = snapshot.value?.tools
  if (!tools) return []
  return [
    ...tools.builtin.map(tool => ({ ...tool, key: `builtin:${tool.id}` })),
    ...tools.mcp.map(tool => ({ ...tool, key: `mcp:${tool.id}` })),
    ...tools.codexNative.map(tool => ({ ...tool, key: `native:${tool.id}` })),
  ]
})

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refreshSnapshot()
  }, 180)
}

async function refreshSnapshot() {
  const sessionId = props.sessionId
  if (!sessionId) {
    snapshot.value = null
    error.value = 'No session selected'
    return
  }

  const currentRequest = ++requestId
  loading.value = true
  error.value = ''

  try {
    const response = await window.electronAPI.getSystemPromptSnapshot(sessionId)
    if (currentRequest !== requestId) return
    if (!response.success || !response.snapshot) {
      throw new Error(response.error || 'Failed to load system prompt')
    }
    snapshot.value = response.snapshot
  } catch (err) {
    if (currentRequest !== requestId) return
    error.value = err instanceof Error ? err.message : 'Failed to load system prompt'
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

async function copyPrompt() {
  if (!snapshot.value?.systemPrompt) return
  const success = await copyTextToClipboard(snapshot.value.systemPrompt)
  if (!success) return
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
    copiedTimer = null
  }, 1200)
}

watch(refreshKey, scheduleRefresh, { immediate: true })

defineExpose({
  refreshSnapshot,
})

onBeforeUnmount(() => {
  requestId++
  if (refreshTimer) clearTimeout(refreshTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<style scoped>
.system-prompt-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 9px 10px 10px;
}

.system-prompt-scroll {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.system-prompt-state {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.system-prompt-state.error,
.system-prompt-warning {
  color: var(--ui-danger-fg, var(--danger, #ef4444));
}

.system-prompt-warning {
  padding: 7px 8px;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, currentColor 7%, transparent);
  font-size: 11.5px;
  line-height: 1.35;
}

.system-prompt-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.system-prompt-meta-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 34%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 54%, transparent);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.system-prompt-meta-item:hover {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent-color, var(--accent))) 38%, transparent);
  background: color-mix(in srgb, var(--ui-surface-hover-bg, var(--bg-hover, var(--bg-secondary))) 72%, transparent);
}

.system-prompt-meta-item.active {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent-color, var(--accent))) 56%, transparent);
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent-color, var(--accent))) 10%, var(--ui-surface-panel-bg, var(--panel)));
}

.system-prompt-meta-item span,
.system-prompt-group-head {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  font-weight: 650;
  text-transform: uppercase;
}

.system-prompt-meta-item strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 11.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-prompt-meta-item strong.muted {
  color: var(--ui-text-muted-fg, var(--muted));
}

.system-prompt-group {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.system-prompt-detail {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.system-prompt-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.system-prompt-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  overflow: visible;
}

.system-prompt-chip {
  max-width: 100%;
  overflow: hidden;
  padding: 3px 6px;
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent-color, var(--accent))) 24%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent-color, var(--accent))) 8%, transparent);
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 86%, var(--ui-accent-primary-fg, var(--accent-color, var(--accent))));
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-prompt-chip.inactive {
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 34%, transparent);
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 52%, transparent);
  color: var(--ui-text-muted-fg, var(--muted));
}

.system-prompt-chip.more {
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 42%, transparent);
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 62%, transparent);
  color: var(--ui-text-muted-fg, var(--muted));
}

.system-prompt-empty {
  margin: 0;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
}

.system-prompt-info-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  margin: 0;
}

.system-prompt-info-list div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 30%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 48%, transparent);
}

.system-prompt-info-list dt {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  font-weight: 650;
  text-transform: uppercase;
}

.system-prompt-info-list dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 11.5px;
  line-height: 1.35;
}

.system-prompt-prompt-section {
  overflow: hidden;
}

.system-prompt-copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.system-prompt-copy-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-surface-hover-bg, var(--bg-hover, var(--bg-secondary))) 68%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.system-prompt-copy-button:disabled {
  cursor: default;
  opacity: 0.5;
}

.system-prompt-copy-button.copied {
  color: var(--ui-accent-primary-fg, var(--accent-color, var(--accent)));
}

.system-prompt-text {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 9px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 34%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-surface-code-bg, var(--bg-code, var(--bg-secondary))) 82%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

</style>
