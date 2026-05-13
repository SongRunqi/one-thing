<template>
  <div class="context-compact-panel">
    <div class="panel-header">
      <div :class="['header-icon', { spinning: isCompacting, failed: isFailed }]">
        <Archive :size="18" />
      </div>
      <div class="header-content">
        <span class="header-title">{{ title }}</span>
        <span class="header-subtitle">{{ subtitle }}</span>
      </div>
      <button
        v-if="!isCompacting && !isFailed"
        class="toggle-btn"
        :title="isExpanded ? 'Collapse' : 'Expand'"
        @click="isExpanded = !isExpanded"
      >
        <ChevronDown
          :size="16"
          :class="{ rotated: !isExpanded }"
        />
      </button>
    </div>

    <Transition name="expand">
      <div
        v-if="isExpanded"
        class="panel-body"
      >
        <div
          v-if="isCompacting"
          class="compact-waiting"
        >
          <span class="pulse-dot" />
          <span class="pulse-line" />
          <span class="pulse-line short" />
        </div>
        <div
          v-else-if="isFailed"
          class="compact-error"
        >
          {{ error || 'Context compact failed.' }}
        </div>
        <div
          v-else
          class="summary-content"
          v-html="renderedSummary"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Archive, ChevronDown } from 'lucide-vue-next'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'

interface Props {
  summary: string
  status?: 'compacting' | 'completed' | 'failed'
  error?: string
  compactedMessageCount?: number
}

const props = defineProps<Props>()

const isExpanded = ref(true)
const isCompacting = computed(() => props.status === 'compacting')
const isFailed = computed(() => props.status === 'failed')

const title = computed(() => {
  if (isCompacting.value) return 'Compacting Context'
  if (isFailed.value) return 'Context Compact Failed'
  return 'Context Compacted'
})

const subtitle = computed(() => {
  if (isCompacting.value) {
    return props.compactedMessageCount
      ? `Summarizing ${props.compactedMessageCount} older messages. Previous messages stay visible.`
      : 'Summarizing older messages. Previous messages stay visible.'
  }
  if (isFailed.value) return 'The original conversation history was left unchanged'
  return props.compactedMessageCount
    ? `Summarized ${props.compactedMessageCount} older messages; the original messages remain above`
    : 'Conversation history has been summarized; original messages remain above'
})

const renderedSummary = computed(() => {
  return renderMarkdown(props.summary, false)
})
</script>

<style scoped>
.context-compact-panel {
  width: min(860px, 100%);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  background: rgba(139, 92, 246, 0.08);
  overflow: hidden;
  animation: fadeIn 0.18s ease-out;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(139, 92, 246, 0.12);
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
}

.header-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(139, 92, 246, 0.2);
  color: rgb(139, 92, 246);
  flex-shrink: 0;
}

.header-icon.spinning svg {
  animation: compactSpin 1.1s linear infinite;
}

.header-icon.failed {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(239, 68, 68);
}

.header-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.header-subtitle {
  font-size: 12px;
  color: var(--muted);
}

.toggle-btn {
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
}

.toggle-btn:hover {
  background: rgba(139, 92, 246, 0.15);
  color: var(--text);
}

.toggle-btn svg {
  transition: transform 0.2s ease;
}

.toggle-btn svg.rotated {
  transform: rotate(-90deg);
}

.panel-body {
  padding: 14px;
}

.compact-waiting {
  display: grid;
  grid-template-columns: 10px minmax(120px, 1fr) minmax(70px, 0.45fr);
  align-items: center;
  gap: 10px;
  min-height: 28px;
}

.pulse-dot,
.pulse-line {
  display: block;
  background: rgba(139, 92, 246, 0.22);
  animation: compactPulse 1.25s ease-in-out infinite;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.pulse-line {
  height: 10px;
  border-radius: 999px;
}

.pulse-line.short {
  animation-delay: 0.18s;
}

.compact-error {
  color: rgb(220, 38, 38);
  font-size: 13px;
  line-height: 1.5;
}

.summary-content {
  font-size: 13px;
  color: var(--text);
  line-height: 1.6;
}

/* Markdown styles */
.summary-content :deep(h1),
.summary-content :deep(h2),
.summary-content :deep(h3),
.summary-content :deep(h4) {
  margin: 0.8em 0 0.4em 0;
  font-weight: 600;
  color: var(--text);
}

.summary-content :deep(h1) { font-size: 1.1em; }
.summary-content :deep(h2) { font-size: 1.05em; }
.summary-content :deep(h3) { font-size: 1em; }
.summary-content :deep(h4) { font-size: 0.95em; }

.summary-content :deep(p) {
  margin: 0 0 0.6em 0;
}

.summary-content :deep(p:last-child) {
  margin-bottom: 0;
}

.summary-content :deep(ul),
.summary-content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
}

.summary-content :deep(li) {
  margin: 0.25em 0;
}

.summary-content :deep(strong) {
  font-weight: 600;
  color: var(--text);
}

.summary-content :deep(.inline-code) {
  background: rgba(139, 92, 246, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 0.9em;
}

/* Expand/collapse animation */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

@keyframes compactSpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes compactPulse {
  0%, 100% {
    opacity: 0.42;
  }
  50% {
    opacity: 1;
  }
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

/* Light theme adjustments */
html[data-theme='light'] .context-compact-panel {
  border-color: rgba(139, 92, 246, 0.3);
  background: rgba(139, 92, 246, 0.06);
}

html[data-theme='light'] .panel-header {
  background: rgba(139, 92, 246, 0.1);
  border-bottom-color: rgba(139, 92, 246, 0.2);
}

html[data-theme='light'] .summary-content :deep(.inline-code) {
  background: rgba(139, 92, 246, 0.12);
}
</style>
