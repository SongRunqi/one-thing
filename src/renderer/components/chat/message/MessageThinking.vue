<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="thinking-container">
    <CollapsePanel
      v-if="shouldShowStatus"
      class="thinking-panel"
      :class="{ 'has-reasoning': !!reasoning }"
      :name="reasoning ? 'message-thinking-reasoning' : 'message-thinking-status'"
      :auto-expanded="reasoning ? isStreaming : undefined"
      default-collapsed
      :collapsible="!!reasoning"
      :eager="!!reasoning"
      :status="reasoning ? (isStreaming && !hasContent ? 'streaming' : 'completed') : (isStreaming && !hasContent ? 'executing' : 'completed')"
      :streaming="!!reasoning && isStreaming && !hasContent"
      variant="plain"
      expand-icon-position="inline-end"
      expand-icon-display="hover"
    >
      <template #title>
        <div class="thinking-status-overlay">
          <div class="thinking-status-overlay-inner">
            <Transition
              name="thinking-fade"
              mode="out-in"
            >
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

              <div
                v-else-if="reasoning"
                key="reasoning-status"
                class="thinking-status-row clickable"
                :class="{ 'status-live': isStreaming && !hasContent }"
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
              </div>
            </Transition>
          </div>
        </div>
      </template>

      <template #default="{ expanded }">
        <div
          v-if="reasoning"
          class="thinking-reasoning-wrapper"
          :class="{ expanded }"
        >
          <div class="thinking-reasoning-inner">
            <div
              class="thinking-content md-body"
              v-html="renderedReasoning"
            />
          </div>
        </div>
      </template>
    </CollapsePanel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import CollapsePanel from '@/components/common/CollapsePanel.vue'
import { cleanReasoningContent, renderMarkdown } from '@/composables/useMarkdownRenderer'

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

const thinkingElapsed = ref(0)
const finalThinkingTime = ref(0)

let thinkingStartTimeValue: number | null = null
let thinkingTimer: ReturnType<typeof setInterval> | null = null

const displayTime = computed(() => {
  if (finalThinkingTime.value > 0) return finalThinkingTime.value
  return thinkingElapsed.value
})

const renderedReasoning = computed(() => {
  if (!props.reasoning) return ''
  const cleanedContent = cleanReasoningContent(props.reasoning)
  return renderMarkdown(cleanedContent, false)
})

const shouldShowStatus = computed(() => {
  const showLoadingMemory = props.loadingMemory && props.isStreaming && !props.hasContent && !props.reasoning
  const showWaiting = props.isStreaming && !props.hasContent && !props.reasoning
  const showReasoning = !!props.reasoning
  return showLoadingMemory || showWaiting || showReasoning
})

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
  if (!thinkingTimer) return
  clearInterval(thinkingTimer)
  thinkingTimer = null
  finalThinkingTime.value = thinkingElapsed.value
  if (finalThinkingTime.value > 0) {
    emit('updateThinkingTime', finalThinkingTime.value)
  }
}

watch(
  () => props.isStreaming,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      startThinkingTimer()
    } else if (!newVal && oldVal) {
      stopThinkingTimer()
    }
  },
  { immediate: true },
)

watch(
  () => props.hasContent,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      stopThinkingTimer()
    }
  },
)

watch(
  () => props.thinkingTime,
  (newVal) => {
    if (newVal && newVal > 0) {
      finalThinkingTime.value = newVal
    }
  },
  { immediate: true },
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
.thinking-container:empty {
  display: none;
}

.thinking-panel {
  --thinking-fg: var(--ui-message-thinking-fg);
  color: var(--thinking-fg);
}

.thinking-status-overlay,
.thinking-status-overlay-inner {
  min-width: 0;
}

.thinking-status-overlay-inner {
  display: flex;
  align-items: center;
}

.thinking-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 18px;
  color: var(--thinking-fg);
}

.thinking-status-row.clickable {
  cursor: pointer;
}

.thinking-text {
  color: currentColor;
  font-size: 12px;
  font-weight: 520;
}

.thinking-text.flowing {
  animation: thinkingTextPulse 1.6s ease-in-out infinite;
}

.thinking-text.thought {
  color: var(--thinking-fg);
}

.thinking-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 28%, transparent);
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
  0%, 100% {
    opacity: 0.76;
  }

  50% {
    opacity: 1;
  }
}

.thinking-time {
  color: color-mix(in srgb, var(--thinking-fg) 76%, transparent);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.thinking-fade-enter-active,
.status-text-fade-enter-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.thinking-fade-leave-active,
.status-text-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.thinking-fade-enter-from,
.thinking-fade-leave-to,
.status-text-fade-enter-from,
.status-text-fade-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

.time-fade-enter-active,
.time-fade-leave-active {
  transition: opacity 0.12s ease;
}

.time-fade-enter-from,
.time-fade-leave-to {
  opacity: 0;
}

.thinking-reasoning-wrapper {
  margin-bottom: 0;
  padding-bottom: 8px;
}

.thinking-reasoning-wrapper.expanded {
  margin-bottom: 0;
}

.thinking-reasoning-inner {
  min-height: 0;
}

.thinking-content {
  padding: 0;
  color: var(--thinking-fg);
  font-size: 12.5px;
  line-height: 1.5;
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
  .time-fade-leave-active {
    transition: none;
  }
}
</style>
