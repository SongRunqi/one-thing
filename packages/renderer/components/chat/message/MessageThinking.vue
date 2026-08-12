<template>
  <div class="thinking-container">
    <CollapsePanel
      v-if="shouldShowStatus"
      class="thinking-panel"
      :class="{ 'has-reasoning': !!reasoning }"
      :name="reasoning ? 'message-thinking-reasoning' : 'message-thinking-status'"
      :auto-expanded="reasoning ? isStreaming : undefined"
      :model-value="controlledExpanded"
      default-collapsed
      :collapsible="!!reasoning"
      :eager="!!reasoning"
      :status="reasoning ? (isStreaming && !hasContent ? 'streaming' : 'completed') : (isStreaming && !hasContent ? 'executing' : 'completed')"
      :streaming="!!reasoning && isStreaming && !hasContent"
      variant="plain"
      expand-icon-position="inline-end"
      expand-icon-display="hover"
      @update:model-value="handleExpandedChange"
    >
      <template #title>
        <div class="thinking-status-overlay">
          <div class="thinking-status-overlay-inner">
            <Transition
              name="thinking-fade"
              mode="out-in"
            >
              <div
                v-if="isStreaming && !hasContent && !reasoning"
                key="waiting"
                class="thinking-status-row status-live"
              >
                <ThoughtHeader
                  label="Waiting"
                  :detail="formatThinkingTime(waitingElapsed)"
                  live
                />
              </div>

              <div
                v-else-if="reasoning"
                key="reasoning-status"
                class="thinking-status-row clickable"
                :class="{ 'status-live': isStreaming && !hasContent }"
              >
                <Transition
                  name="status-text-fade"
                  mode="out-in"
                >
                  <ThoughtHeader
                    v-if="isStreaming && !hasContent"
                    key="thinking"
                    label="Thinking"
                    :detail="formatThinkingTime(thinkingElapsed)"
                    live
                  />
                  <ThoughtHeader
                    v-else
                    key="thought"
                    label="Thought"
                    :detail="formatThinkingTime(displayTime)"
                  />
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
            <!-- `thought-body` is the shared skin (published by ThoughtHeader);
                 the inline reasoning parts in MessageBubble wear the same one. -->
            <div class="thinking-content thought-body md-body">
              <MessageMarkdown
                :content="cleanedReasoning"
                :is-user="false"
                :live="useLiveMarkdown"
                :is-streaming="isStreaming"
              />
            </div>
          </div>
        </div>
      </template>
    </CollapsePanel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import CollapsePanel from '@/components/common/CollapsePanel.vue'
import MessageMarkdown from './MessageMarkdown.vue'
import ThoughtHeader from './ThoughtHeader.vue'
import { cleanReasoningContent } from '@/composables/useMarkdownRenderer'
import { resolveExpansion, setExpansionIntent } from '@/stores/helpers/expansion-intent'

interface Props {
  isStreaming: boolean
  hasContent: boolean
  reasoning?: string
  thinkingStartTime?: number
  thinkingTime?: number
  /**
   * Stable address for the user's expansion intent. The panel's `name` flips
   * from `…-status` to `…-reasoning` the moment reasoning arrives, and that
   * flip resets CollapsePanel's `userControlledExpansion` — so a click made
   * during the waiting phase used to be forgotten. Omit the prop and the
   * panel keeps its own local state (unchanged behaviour).
   */
  intentKey?: string
}

const props = defineProps<Props>()

// User record > auto-open while thinking > collapsed.
// `undefined` leaves CollapsePanel uncontrolled.
const controlledExpanded = computed<boolean | undefined>(() => {
  if (!props.intentKey) return undefined
  return resolveExpansion(props.intentKey, props.reasoning ? props.isStreaming : false, false)
})

function handleExpandedChange(expanded: boolean): void {
  setExpansionIntent(props.intentKey, expanded)
}

const emit = defineEmits<{
  updateThinkingTime: [time: number]
}>()

const thinkingElapsed = ref(0)
const waitingElapsed = ref(0)
const finalThinkingTime = ref(0)

let thinkingStartTimeValue: number | null = null
let waitingStartTimeValue: number | null = null
let thinkingTimer: ReturnType<typeof setInterval> | null = null
let waitingTimer: ReturnType<typeof setInterval> | null = null

const displayTime = computed(() => {
  if (finalThinkingTime.value > 0) return finalThinkingTime.value
  return thinkingElapsed.value
})

const cleanedReasoning = computed(() =>
  props.reasoning ? cleanReasoningContent(props.reasoning) : '',
)

// Reasoning goes through the incremental StreamingMarkdown pipeline (same as
// MessageBubble's inline reasoning) instead of a v-html blob: v-html replaces
// the whole subtree on every chunk, which destroys each <pre> and resets its
// scrollLeft, making code blocks impossible to scroll while streaming.
// Sticky: once live, stay live so the DOM isn't swapped out at stream end.
const hasBeenStreaming = ref(false)
watch(
  () => props.isStreaming,
  (streaming) => {
    if (streaming) hasBeenStreaming.value = true
  },
  { immediate: true },
)
const useLiveMarkdown = computed(() => props.isStreaming || hasBeenStreaming.value)

const shouldShowStatus = computed(() => {
  const showWaiting = props.isStreaming && !props.hasContent && !props.reasoning
  const showReasoning = !!props.reasoning
  return showWaiting || showReasoning
})

const isWaitingLive = computed(() => props.isStreaming && !props.hasContent && !props.reasoning)
const isThinkingLive = computed(() => props.isStreaming && !props.hasContent && !!props.reasoning)

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
  thinkingStartTimeValue = props.thinkingStartTime ?? Date.now()
  thinkingElapsed.value = (Date.now() - thinkingStartTimeValue) / 1000
  thinkingTimer = setInterval(() => {
    if (thinkingStartTimeValue !== null) {
      thinkingElapsed.value = (Date.now() - thinkingStartTimeValue) / 1000
    }
  }, 100)
}

function startWaitingTimer() {
  if (waitingTimer) return
  waitingStartTimeValue = Date.now()
  waitingElapsed.value = 0
  waitingTimer = setInterval(() => {
    if (waitingStartTimeValue !== null) {
      waitingElapsed.value = (Date.now() - waitingStartTimeValue) / 1000
    }
  }, 100)
}

function stopWaitingTimer() {
  if (!waitingTimer) return
  clearInterval(waitingTimer)
  waitingTimer = null
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
  isWaitingLive,
  (newVal) => {
    if (newVal) {
      startWaitingTimer()
    } else {
      stopWaitingTimer()
    }
  },
  { immediate: true },
)

watch(
  isThinkingLive,
  (newVal) => {
    if (newVal) {
      startThinkingTimer()
    } else {
      stopThinkingTimer()
    }
  },
  { immediate: true },
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
})

onUnmounted(() => {
  if (thinkingTimer) {
    clearInterval(thinkingTimer)
    thinkingTimer = null
  }
  if (waitingTimer) {
    clearInterval(waitingTimer)
    waitingTimer = null
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

/* 恒定一行(22px = ThoughtHeader 的行盒高度,与 rail 内的 `.generation-waiting`
   同一个数)。锁高有两个理由:
   1. 外层 Transition 是 `mode="out-in"` —— 旧行离场和新行入场之间有一帧空容器,
      不锁高那一帧整块塌成 0,周围元素跟着上下抖一次;
   2. Waiting → Thinking → Thought 三态换行时行高必须一致,状态变化不能是块级
      变化。真内容到来时这一行整体让位,高度差正好是一行。 */
.thinking-status-overlay-inner {
  display: flex;
  align-items: center;
  min-height: 22px;
}

.thinking-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 22px;
  color: var(--thinking-fg);
}

.thinking-status-row.clickable {
  cursor: pointer;
}

/* The row's own paint (label, detail, live dot, hover) lives in ThoughtHeader
   — this component only places it. */

.thinking-fade-enter-active,
.status-text-fade-enter-active {
  transition: opacity var(--duration-normal) var(--ease-default), transform var(--duration-normal) var(--ease-default);
}

.thinking-fade-leave-active,
.status-text-fade-leave-active {
  transition: opacity var(--duration-fast) var(--ease-default), transform var(--duration-fast) var(--ease-default);
}

.thinking-fade-enter-from,
.thinking-fade-leave-to,
.status-text-fade-enter-from,
.status-text-fade-leave-to {
  opacity: 0;
  transform: translateY(-2px);
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

/* Typography and the blueprint outline come from `.thought-body`; the
   markdown child rules live there too, so nothing is written twice. */

@media (prefers-reduced-motion: reduce) {
  .thinking-fade-enter-active,
  .thinking-fade-leave-active,
  .status-text-fade-enter-active,
  .status-text-fade-leave-active {
    transition: none;
  }
}
</style>
