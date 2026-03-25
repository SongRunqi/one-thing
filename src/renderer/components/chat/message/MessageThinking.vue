<template>
  <div class="thinking-container">
    <!-- Status overlay: in document flow, shows before message content -->
    <Transition name="status-fade">
      <div
        v-if="shouldShowStatus"
        class="thinking-status-overlay"
      >
        <Transition
          name="thinking-fade"
          mode="out-in"
        >
          <!-- Loading memory -->
          <div
            v-if="loadingMemory && isStreaming && !hasContent && !reasoning"
            key="loading-memory"
            class="thinking-status-row"
          >
            <span class="thinking-text flowing">Extracting memory</span>
            <span class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
          </div>

          <!-- Waiting -->
          <div
            v-else-if="isStreaming && !hasContent && !reasoning"
            key="waiting"
            class="thinking-status-row"
          >
            <span class="thinking-text flowing">Waiting</span>
            <span class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
          </div>

          <!-- Reasoning status: Thinking / Thought for Xs -->
          <div
            v-else-if="reasoning"
            key="reasoning-status"
            class="thinking-status-row clickable"
            @click="toggleExpand"
          >
            <Transition
              name="status-text-fade"
              mode="out-in"
            >
              <span
                v-if="isStreaming && !hasContent"
                key="thinking"
                class="thinking-text flowing"
              >Thinking</span>
              <span
                v-else
                key="thought"
                class="thinking-text thought"
              >Thought for {{ formatThinkingTime(displayTime) }}</span>
            </Transition>
            <Transition name="time-fade">
              <span
                v-if="isStreaming && !hasContent"
                class="thinking-time"
              >{{ formatThinkingTime(thinkingElapsed) }}</span>
            </Transition>
            <button
              class="thinking-toggle-btn"
              :class="{ expanded: isExpanded }"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Reasoning expand: in document flow, smooth grid-rows animation -->
    <!-- User-triggered expand, so pushing content down is expected -->
    <div
      v-if="reasoning"
      class="thinking-reasoning-wrapper"
      :class="{ expanded: isExpanded }"
    >
      <div class="thinking-reasoning-inner">
        <div
          class="thinking-content"
          v-html="renderedReasoning"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { renderMarkdown, cleanReasoningContent } from '@/composables/useMarkdownRenderer'

interface Props {
  isStreaming: boolean
  hasContent: boolean
  reasoning?: string
  thinkingStartTime?: number
  thinkingTime?: number
  loadingMemory?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  updateThinkingTime: [time: number]
}>()

const isExpanded = ref(false)
const thinkingElapsed = ref(0)
const finalThinkingTime = ref(0)
let thinkingStartTimeValue: number | null = null
let thinkingTimer: ReturnType<typeof setInterval> | null = null

// Computed display time (final time or elapsed time)
const displayTime = computed(() => {
  if (finalThinkingTime.value > 0) {
    return finalThinkingTime.value
  }
  return thinkingElapsed.value
})

// Rendered reasoning content
const renderedReasoning = computed(() => {
  if (!props.reasoning) return ''
  const cleanedContent = cleanReasoningContent(props.reasoning)
  return renderMarkdown(cleanedContent, false)
})

// Whether the status overlay should be shown
const shouldShowStatus = computed(() => {
  const showLoadingMemory = props.loadingMemory && props.isStreaming && !props.hasContent && !props.reasoning
  const showWaiting = props.isStreaming && !props.hasContent && !props.reasoning
  const showReasoning = !!props.reasoning
  return showLoadingMemory || showWaiting || showReasoning
})

function toggleExpand() {
  if (props.reasoning) {
    isExpanded.value = !isExpanded.value
  }
}

function formatThinkingTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function startThinkingTimer() {
  if (thinkingTimer) return
  thinkingStartTimeValue = props.thinkingStartTime || Date.now()
  thinkingElapsed.value = (Date.now() - thinkingStartTimeValue) / 1000
  thinkingTimer = setInterval(() => {
    if (thinkingStartTimeValue) {
      thinkingElapsed.value = (Date.now() - thinkingStartTimeValue) / 1000
    }
  }, 100)
}

function stopThinkingTimer() {
  if (thinkingTimer) {
    clearInterval(thinkingTimer)
    thinkingTimer = null
    finalThinkingTime.value = thinkingElapsed.value
    if (finalThinkingTime.value > 0) {
      emit('updateThinkingTime', finalThinkingTime.value)
    }
  }
}

// Watch streaming state
watch(
  () => props.isStreaming,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      startThinkingTimer()
    } else if (!newVal && oldVal) {
      // Don't stop here - wait for content to arrive
    }
  },
  { immediate: true }
)

// Watch for content - stop timer when content arrives
watch(
  () => props.hasContent,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      stopThinkingTimer()
    }
  }
)

// Watch for persisted thinkingTime
watch(
  () => props.thinkingTime,
  (newVal) => {
    if (newVal && newVal > 0) {
      finalThinkingTime.value = newVal
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (props.thinkingTime && props.thinkingTime > 0) {
    finalThinkingTime.value = props.thinkingTime
  }
  if (props.isStreaming && !props.hasContent) {
    startThinkingTimer()
  }
})

onUnmounted(() => {
  if (thinkingTimer) {
    clearInterval(thinkingTimer)
    thinkingTimer = null
  }
})
</script>

<style scoped>
/* Container: single flex child in parent, empty when nothing shown */
.thinking-container:empty {
  display: none;
}

/* Status overlay: in document flow, aligned with message content */
.thinking-status-overlay {
  display: flex;
  align-items: center;
  height: 28px;
}

.thinking-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 0;
}

.thinking-status-row.clickable {
  cursor: pointer;
}

.thinking-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
}

.thinking-text.flowing {
  background: linear-gradient(
    90deg,
    var(--muted) 0%,
    var(--accent) 50%,
    var(--muted) 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: flowingGradient 2s linear infinite;
}

.thinking-text.thought {
  color: var(--muted);
  opacity: 0.6;
}

@keyframes flowingGradient {
  0% {
    background-position: 200% center;
  }
  100% {
    background-position: -200% center;
  }
}

.thinking-time {
  font-size: 12px;
  color: var(--muted);
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

/* Status overlay fade: opacity only, no translateY to prevent any positional shift */
.status-fade-enter-active {
  transition: opacity 0.2s ease;
}

.status-fade-leave-active {
  transition: opacity 0.15s ease;
}

.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
}

/* Transition: Waiting <-> Thinking/Thought row */
.thinking-fade-enter-active {
  animation: thinkingFadeIn 0.25s ease;
}

.thinking-fade-leave-active {
  animation: thinkingFadeOut 0.15s ease forwards;
}

@keyframes thinkingFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes thinkingFadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* Transition: Thinking -> Thought text */
.status-text-fade-enter-active {
  animation: statusTextEnter 0.3s ease;
}

.status-text-fade-leave-active {
  animation: statusTextLeave 0.15s ease forwards;
}

@keyframes statusTextEnter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes statusTextLeave {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* Transition: Time display fade */
.time-fade-enter-active,
.time-fade-leave-active {
  transition: opacity 0.2s ease;
}

.time-fade-enter-from,
.time-fade-leave-to {
  opacity: 0;
}

/* Reasoning expand: smooth grid-template-rows animation */
.thinking-reasoning-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s ease, margin-bottom 0.2s ease;
  margin-bottom: 0;
}

.thinking-reasoning-wrapper.expanded {
  grid-template-rows: 1fr;
  margin-bottom: 8px;
}

.thinking-reasoning-inner {
  overflow: hidden;
  min-height: 0;
}

.thinking-toggle-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--muted);
  opacity: 0.6;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.thinking-toggle-btn:hover {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
}

.thinking-toggle-btn svg {
  transition: transform 0.2s ease;
}

.thinking-toggle-btn.expanded svg {
  transform: rotate(180deg);
}

.thinking-content {
  padding: 8px 12px;
  border-left: 2px solid var(--border);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--muted);
  opacity: 0.55;
}

.thinking-content :deep(p) {
  margin: 0 0 0.5em 0;
}

.thinking-content :deep(p:last-child) {
  margin-bottom: 0;
}

.thinking-content :deep(ol),
.thinking-content :deep(ul) {
  padding-left: 1.5em;
}
</style>
