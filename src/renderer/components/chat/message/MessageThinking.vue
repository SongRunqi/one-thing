<template>
  <!-- 只在有内容显示时渲染容器 -->
  <Transition name="container-fade">
    <div v-if="shouldShowContainer" class="thinking-container">
      <!-- Loading memory status -->
      <Transition name="thinking-fade" mode="out-in">
        <div v-if="loadingMemory && isStreaming && !hasContent && !reasoning" key="loading-memory" class="thinking-status">
          <div class="thinking-status-row">
            <span class="thinking-text flowing">Extracting memory</span>
            <span class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
          </div>
        </div>

        <!-- Waiting status (streaming, no content yet, no reasoning) -->
        <div v-else-if="isStreaming && !hasContent && !reasoning" key="waiting" class="thinking-status">
          <div class="thinking-status-row">
            <span class="thinking-text flowing">Waiting</span>
            <span class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
          </div>
        </div>

        <!-- Thinking/Thought status (has reasoning) -->
        <div v-else-if="reasoning" key="reasoning" class="thinking-status">
          <div class="thinking-with-content">
            <div class="thinking-status-row" @click="toggleExpand">
              <!-- Still thinking: animated with transition -->
              <Transition name="status-text-fade" mode="out-in">
                <span v-if="isStreaming && !hasContent" key="thinking" class="thinking-text flowing">Thinking</span>
                <!-- Done thinking: static "Thought for X seconds" -->
                <span v-else key="thought" class="thinking-text thought">Thought for {{ formatThinkingTime(displayTime) }}</span>
              </Transition>
              <!-- Show time separately only when still thinking -->
              <Transition name="time-fade">
                <span v-if="isStreaming && !hasContent" class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
              </Transition>
              <button class="thinking-toggle-btn" :class="{ expanded: isExpanded }">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            </div>
            <Transition name="expand">
              <div v-if="isExpanded" class="thinking-content-wrapper">
                <div class="thinking-content" v-html="renderedReasoning"></div>
              </div>
            </Transition>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
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

// 是否应该显示容器（有 Loading Memory、Waiting 或有 Reasoning 时才显示）
const shouldShowContainer = computed(() => {
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
.thinking-container {
  position: relative;
  /* 不设置 min-height，让容器高度由内容决定 */
}

/* 容器淡入淡出 - 使用 absolute 避免影响下方布局 */
.container-fade-enter-active {
  transition: opacity 0.2s ease;
}

.container-fade-leave-active {
  position: absolute;
  width: 100%;
  transition: opacity 0.25s ease;
}

.container-fade-enter-from,
.container-fade-leave-to {
  opacity: 0;
}

.thinking-status {
  margin-bottom: 8px;
}

.thinking-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 0;
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

/* Transition: Waiting <-> Thinking/Thought container */
.thinking-fade-enter-active {
  animation: thinkingFadeIn 0.25s ease;
}

.thinking-fade-leave-active {
  animation: thinkingFadeOut 0.15s ease forwards;
}

@keyframes thinkingFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes thinkingFadeOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(4px);
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

/* Transition: Content expand */
.expand-enter-active {
  animation: expandIn 0.2s ease-out;
}

.expand-leave-active {
  animation: expandOut 0.15s ease-in forwards;
}

@keyframes expandOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-8px);
  }
}

.thinking-toggle-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--muted);
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

.thinking-with-content {
  display: flex;
  flex-direction: column;
}

.thinking-content-wrapper {
  margin-top: 8px;
  padding: 12px;
  background: rgba(var(--accent-rgb), 0.05);
  border-radius: 8px;
  border-left: 3px solid var(--accent);
  animation: expandIn 0.2s ease-out;
}

@keyframes expandIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.thinking-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.thinking-content :deep(p) {
  margin: 0 0 0.5em 0;
}

.thinking-content :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
