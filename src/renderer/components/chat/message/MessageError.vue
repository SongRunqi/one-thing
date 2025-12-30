<template>
  <div class="message error">
    <div class="error-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <div class="error-bubble">
      <div class="error-content">{{ content }}</div>
      <div v-if="errorDetails" class="error-details">{{ errorDetails }}</div>
      <div class="error-footer">
        <span class="error-time">{{ formattedTime }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  content: string
  errorDetails?: string
  timestamp: number
}

const props = defineProps<Props>()

const formattedTime = computed(() => {
  const date = new Date(props.timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
})
</script>

<style scoped>
.message.error {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: min(860px, 100%);
  animation: fadeIn 0.18s ease-out;
}

.error-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  color: rgb(239, 68, 68);
  flex-shrink: 0;
}

.error-bubble {
  flex: 1;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}

.error-content {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
}

html[data-theme='light'] .error-content {
  color: rgba(0, 0, 0, 0.85);
}

.error-details {
  margin-top: 8px;
  padding: 8px 10px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, monospace;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.65);
  word-break: break-all;
}

html[data-theme='light'] .error-details {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.6);
}

.error-footer {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.error-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

html[data-theme='light'] .error-time {
  color: rgba(0, 0, 0, 0.4);
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
