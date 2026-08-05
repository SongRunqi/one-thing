<template>
  <div class="message error">
    <div class="error-card">
      <span class="frame-label">
        <span class="tag">ERROR</span>
        <span class="zh">生成失败</span>
      </span>

      <pre class="error-raw">{{ rawDetails }}</pre>

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
        <span class="error-meta">{{ formattedTime }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'

interface Props {
  content: string
  errorDetails?: string
  timestamp: number
  sessionId?: string
  messageId?: string
}

const props = defineProps<Props>()
const chatStore = useChatStore()

const rawDetails = computed(() => {
  const parts = [props.content]
  if (props.errorDetails && props.errorDetails !== props.content) {
    parts.push(props.errorDetails)
  }
  return parts.join('\n\n')
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

/* Blueprint frame family (see GoalSummaryCard): zero fill, one hairline
   tinted with the danger ink, a punched legend on the top rule. The failure
   belongs to the run, not to either speaker, so it spans the reading column. */
.error-card {
  --err-ink: var(--ui-status-danger-fg);

  position: relative;
  margin-top: 7px;
  border: 1px solid color-mix(in srgb, var(--err-ink) 45%, transparent);
  border-radius: var(--radius-xs, 4px);
  padding: 12px 12px 8px;
  /* Error copy is chrome, not content — always UI sans, even inside the
     message list where --font-body carries the user's reading font. */
  font-family: var(--font-sans, inherit);
}

.frame-label {
  position: absolute;
  top: -7px;
  left: 12px;
  z-index: 1;
  display: inline-flex;
  gap: 0.75em;
  align-items: baseline;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg);
  user-select: none;
}

.frame-label .tag {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--err-ink);
}

.frame-label .zh {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-primary-fg);
}

.error-raw {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ui-text-muted-fg);
}

.error-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--ui-border-default-border, var(--border-color));
}

.error-btn {
  padding: 2px 10px;
  border: 1px solid var(--ui-border-default-border, var(--border-color));
  border-radius: 2px;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  line-height: 1.6;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  transition: color var(--transition-fast, 0.15s) ease,
    border-color var(--transition-fast, 0.15s) ease;
}

.error-btn:hover {
  border-color: currentcolor;
  color: var(--ui-text-primary-fg);
}

.error-btn.primary {
  border-color: color-mix(in srgb, var(--err-ink) 60%, transparent);
  color: var(--err-ink);
}

.error-btn.primary:hover {
  border-color: currentcolor;
  color: var(--err-ink);
}

.error-meta {
  margin-left: auto;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-faint-fg);
  white-space: nowrap;
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
