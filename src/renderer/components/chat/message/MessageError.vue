<template>
  <div class="message error">
    <div class="error-card">
      <div class="error-title-row">
        <svg
          class="error-icon"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
          />
          <line
            x1="12"
            y1="8"
            x2="12"
            y2="12"
          />
          <line
            x1="12"
            y1="16"
            x2="12.01"
            y2="16"
          />
        </svg>
        <span class="error-title">{{ humanized.title }}</span>
      </div>

      <div class="error-hint">
        {{ humanized.hint }}
      </div>

      <div class="error-actions">
        <button
          v-if="canRetry"
          class="error-btn primary"
          type="button"
          @click="handleRetry"
        >
          重试
        </button>
        <button
          class="error-btn"
          type="button"
          @click="handleSwitchModel"
        >
          切换模型…
        </button>
        <span class="error-meta">
          <template v-if="metaText">{{ metaText }} · </template>{{ formattedTime }}
        </span>
        <button
          class="error-detail-toggle"
          type="button"
          @click="detailsOpen = !detailsOpen"
        >
          技术详情 {{ detailsOpen ? '▾' : '▸' }}
        </button>
      </div>

      <pre
        v-if="detailsOpen"
        class="error-raw"
      >{{ rawDetails }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { humanizeStreamError } from './error-humanizer'

interface Props {
  content: string
  errorDetails?: string
  timestamp: number
  sessionId?: string
  messageId?: string
}

const props = defineProps<Props>()
const chatStore = useChatStore()
const detailsOpen = ref(false)

const humanized = computed(() => humanizeStreamError(props.content))

const rawDetails = computed(() => {
  const parts = [props.content]
  if (props.errorDetails && props.errorDetails !== props.content) {
    parts.push(props.errorDetails)
  }
  return parts.join('\n\n')
})

const metaText = computed(() => {
  const bits: string[] = []
  if (humanized.value.provider) bits.push(humanized.value.provider)
  if (humanized.value.status) bits.push(String(humanized.value.status))
  if (humanized.value.code) bits.push(`code ${humanized.value.code}`)
  return bits.join(' · ')
})

const formattedTime = computed(() => {
  const date = new Date(props.timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
})

/** Retry = regenerate from the nearest user message before this error. */
const retryUserMessageId = computed(() => {
  if (!props.sessionId || !props.messageId) return null
  const messages = chatStore.sessionMessages.get(props.sessionId) ?? []
  let idx = messages.findIndex(m => m.id === props.messageId)
  if (idx === -1) idx = messages.length
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].id
  }
  return null
})

const canRetry = computed(() => retryUserMessageId.value !== null)

function handleRetry() {
  if (!props.sessionId || !retryUserMessageId.value) return
  void chatStore.regenerate(props.sessionId, retryUserMessageId.value)
}

function handleSwitchModel() {
  window.dispatchEvent(new CustomEvent('onething:open-model-selector', {
    detail: { sessionId: props.sessionId },
  }))
}
</script>

<style scoped>
.message.error {
  width: min(var(--content-measure, 860px), 100%);
  animation: fadeIn 0.18s ease-out;
}

.error-card {
  border: 1px solid var(--ui-border-default-border, var(--border, rgba(128, 128, 128, 0.25)));
  border-left: 3px solid var(--ui-status-danger-fg, var(--text-error, rgb(220, 68, 68)));
  border-radius: 10px;
  background: var(--ui-surface-panel-bg, var(--bg-panel, transparent));
  padding: 13px 16px 12px;
  /* Error copy is chrome, not content — always UI sans, even inside the
     message list where --font-body carries the user's reading font. */
  font-family: var(--font-sans, inherit);
}

.error-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-icon {
  color: var(--ui-status-danger-fg, var(--text-error, rgb(220, 68, 68)));
  flex-shrink: 0;
}

.error-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text-primary));
  line-height: 1.4;
}

.error-hint {
  margin: 4px 0 10px 23px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.error-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 23px;
}

.error-btn {
  border: 1px solid var(--ui-border-default-border, var(--border, rgba(128, 128, 128, 0.3)));
  border-radius: 7px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text-primary));
  padding: 3px 12px;
  font-size: 12.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  line-height: 1.5;
}

.error-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover, rgba(128, 128, 128, 0.1)));
}

.error-btn.primary {
  background: var(--ui-text-primary-fg, var(--text-primary));
  border-color: var(--ui-text-primary-fg, var(--text-primary));
  color: var(--ui-surface-chat-bg, var(--bg-chat, #fff));
}

.error-btn.primary:hover {
  opacity: 0.85;
  background: var(--ui-text-primary-fg, var(--text-primary));
}

.error-meta {
  margin-left: auto;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  color: var(--ui-text-faint-fg, var(--text-faint));
  white-space: nowrap;
}

.error-detail-toggle {
  border: none;
  background: none;
  padding: 2px 4px;
  font-size: 12px;
  font-family: inherit;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
}

.error-detail-toggle:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.error-raw {
  margin: 10px 0 0 23px;
  padding: 8px 10px;
  max-height: 180px;
  overflow: auto;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  border-radius: 6px;
  background: var(--ui-surface-code-block-bg, var(--bg-code-block, rgba(128, 128, 128, 0.08)));
  color: var(--ui-text-muted-fg, var(--text-muted));
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
