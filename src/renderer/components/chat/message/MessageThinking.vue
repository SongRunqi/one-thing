<template>
  <div
    ref="containerRef"
    class="thinking-container"
  >
    <!-- Status overlay: always in DOM, collapses height to 0 when nothing to show.
         Inner v-if chain handles row-to-row swap via mode="out-in". -->
    <div
      class="thinking-status-overlay"
      :class="{ collapsed: !shouldShowStatus }"
    >
      <div class="thinking-status-overlay-inner">
        <Transition
          name="thinking-fade"
          mode="out-in"
        >
          <!-- Loading memory -->
          <div
            v-if="loadingMemory && isStreaming && !hasContent && !reasoning"
            key="loading-memory"
            class="thinking-status-row status-live"
          >
            <span
              class="thinking-dot"
              aria-hidden="true"
            />
            <span class="thinking-text flowing">Extracting memory</span>
            <span class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
          </div>

          <!-- Waiting -->
          <div
            v-else-if="isStreaming && !hasContent && !reasoning"
            key="waiting"
            class="thinking-status-row status-live"
          >
            <span
              class="thinking-dot"
              aria-hidden="true"
            />
            <span class="thinking-text flowing">Waiting</span>
            <span class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
          </div>

          <!-- Reasoning status: Thinking / Thought for Xs -->
          <div
            v-else-if="reasoning"
            key="reasoning-status"
            class="thinking-status-row clickable"
            :class="{ 'status-live': isStreaming && !hasContent }"
            @click="toggleExpand"
          >
            <span
              v-if="isStreaming && !hasContent"
              class="thinking-dot"
              aria-hidden="true"
            />
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
              type="button"
              :aria-label="isExpanded ? 'Collapse thought' : 'Expand thought'"
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
    </div>

    <!-- Reasoning expand: in document flow, smooth grid-rows animation -->
    <!-- User-triggered expand, so pushing content down is expected -->
    <div
      ref="reasoningWrapperRef"
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
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
const containerRef = ref<HTMLElement | null>(null)
const reasoningWrapperRef = ref<HTMLElement | null>(null)
let thinkingStartTimeValue: number | null = null
let thinkingTimer: ReturnType<typeof setInterval> | null = null
const userControlledExpansion = ref(false)

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
    const nextExpanded = !isExpanded.value
    userControlledExpansion.value = true
    isExpanded.value = nextExpanded
    if (nextExpanded) {
      scrollExpandedReasoningIntoView()
    }
  }
}

function scrollExpandedReasoningIntoView() {
  const scrollNearest = () => {
    const target = reasoningWrapperRef.value || containerRef.value
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  nextTick(() => {
    scrollNearest()
    requestAnimationFrame(() => {
      scrollNearest()
      setTimeout(scrollNearest, 220)
    })
  })
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
      if (props.reasoning && !userControlledExpansion.value) {
        isExpanded.value = true
      }
    } else if (!newVal && oldVal) {
      // Stream ended — stop regardless of whether content arrived.
      // Reasoning-only turns (no text / no tool calls) would otherwise
      // leave the timer running forever.
      stopThinkingTimer()
      if (props.reasoning && !userControlledExpansion.value) {
        isExpanded.value = false
      }
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

watch(
  () => props.reasoning,
  (reasoning) => {
    if (reasoning && props.isStreaming && !userControlledExpansion.value) {
      isExpanded.value = true
    }
    if (!reasoning) {
      userControlledExpansion.value = false
      isExpanded.value = false
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

/* Status overlay: always in DOM. Keep status changes synchronous during
   streaming; animated height/opacity changes fight the follow scroll model
   when the first content chunk replaces Waiting. */
.thinking-status-overlay {
  display: grid;
  grid-template-rows: 1fr;
}

.thinking-status-overlay.collapsed {
  grid-template-rows: 0fr;
}

.thinking-status-overlay-inner {
  overflow: hidden;
  min-height: 0;
  display: flex;
  align-items: center;
}

.thinking-status-row {
  --thinking-fg: color-mix(
    in srgb,
    var(--text-ai-thinking, var(--text-muted, var(--muted))) 72%,
    var(--text-primary, var(--text)) 28%
  );
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 3px 0;
  color: var(--thinking-fg);
}

.thinking-status-row.clickable {
  cursor: pointer;
}

.thinking-text {
  font-size: 13px;
  font-weight: 560;
  color: currentColor;
}

.thinking-text.flowing {
  animation: thinkingTextPulse 1.6s ease-in-out infinite;
}

.thinking-text.thought {
  color: color-mix(in srgb, var(--thinking-fg) 90%, var(--text-primary, var(--text)) 10%);
}

.thinking-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 28%, transparent);
  animation: thinkingDotPulse 1.35s ease-in-out infinite;
}

@keyframes thinkingDotPulse {
  0%, 100% {
    opacity: 0.58;
    transform: scale(0.86);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes thinkingTextPulse {
  0%, 100% { opacity: 0.76; }
  50% { opacity: 1; }
}

.thinking-time {
  font-size: 12px;
  color: color-mix(in srgb, var(--thinking-fg) 76%, transparent);
  font-variant-numeric: tabular-nums;
}

/* Transition: Waiting <-> Thinking/Thought row */
.thinking-fade-enter-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.thinking-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.thinking-fade-enter-from,
.thinking-fade-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}


/* Transition: Thinking -> Thought text */
.status-text-fade-enter-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.status-text-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.status-text-fade-enter-from,
.status-text-fade-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

/* Transition: Time display fade */
.time-fade-enter-active,
.time-fade-leave-active {
  transition: opacity 0.12s ease;
}

.time-fade-enter-from,
.time-fade-leave-to {
  opacity: 0;
}

/* Reasoning expand: layout change is immediate; motion stays opacity/transform only. */
.thinking-reasoning-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: none;
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
  color: color-mix(in srgb, var(--thinking-fg, var(--text-ai-thinking, var(--muted))) 82%, transparent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: none;
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
  border-left: 2px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  font-size: 12.5px;
  line-height: 1.5;
  color: color-mix(
    in srgb,
    var(--text-ai-thinking, var(--text-muted, var(--muted))) 82%,
    var(--text-primary, var(--text)) 18%
  );
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

@media (prefers-reduced-motion: reduce) {
  .thinking-dot,
  .thinking-text.flowing {
    animation: none;
  }

  .thinking-fade-enter-active,
  .thinking-fade-leave-active,
  .status-text-fade-enter-active,
  .status-text-fade-leave-active,
  .time-fade-enter-active,
  .time-fade-leave-active,
  .thinking-toggle-btn svg {
    transition: none;
  }
}
</style>
