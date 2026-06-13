<template>
  <div :class="['context-compact-event', statusClass]">
    <div class="event-row">
      <span
        class="event-mark"
        aria-hidden="true"
      >
        <span
          v-if="isCompacting"
          class="event-dot"
        />
        <AlertCircle
          v-else-if="isFailed"
          :size="14"
          :stroke-width="2"
        />
        <Archive
          v-else
          :size="14"
          :stroke-width="2"
        />
      </span>

      <Button
        v-if="canExpand"
        unstyled
        class="event-toggle"
        native-type="button"
        :aria-expanded="isExpanded"
        :title="isExpanded ? 'Hide summary' : 'Show summary'"
        @click="isExpanded = !isExpanded"
      >
        <span class="event-text">
          <span class="event-title">{{ title }}</span>
          <span class="event-meta">{{ meta }}</span>
        </span>
        <ChevronDown
          class="event-chevron"
          :class="{ expanded: isExpanded }"
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <div
        v-else
        class="event-static"
      >
        <span class="event-title">{{ title }}</span>
        <span class="event-meta">{{ meta }}</span>
      </div>
    </div>

    <Transition name="summary">
      <div
        v-if="canExpand && isExpanded"
        class="summary-content md-inline-code-scope"
        v-html="renderedSummary"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed } from 'vue'
import { AlertCircle, Archive, ChevronDown } from 'lucide-vue-next'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'

interface Props {
  summary: string
  status?: 'compacting' | 'completed' | 'failed'
  error?: string
  compactedMessageCount?: number
}

const props = defineProps<Props>()

const isExpanded = ref(false)
const isCompacting = computed(() => props.status === 'compacting')
const isFailed = computed(() => props.status === 'failed')
const canExpand = computed(() => !isCompacting.value && !isFailed.value && props.summary.trim().length > 0)

const statusClass = computed(() => ({
  compacting: isCompacting.value,
  failed: isFailed.value,
  completed: !isCompacting.value && !isFailed.value,
}))

const title = computed(() => {
  if (isCompacting.value) return 'Compacting context'
  if (isFailed.value) return 'Context compact failed'
  return 'Context compacted'
})

const meta = computed(() => {
  if (isCompacting.value) {
    return props.compactedMessageCount
      ? `Summarizing ${props.compactedMessageCount} older messages...`
      : 'Summarizing older messages...'
  }
  if (isFailed.value) return props.error || 'Conversation history was left unchanged'
  return props.compactedMessageCount
    ? `${props.compactedMessageCount} older messages summarized`
    : 'Older messages summarized'
})

const renderedSummary = computed(() => renderMarkdown(props.summary, false))
</script>

<style scoped>
.context-compact-event {
  width: min(760px, 100%);
  margin: 16px auto 18px;
  color: var(--ui-text-muted-fg, var(--muted));
  animation: fadeIn 0.18s ease-out;
}

.event-row {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 28px;
}

.event-mark {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 82%, var(--ui-text-primary-fg, var(--text)) 18%);
}

.event-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  animation: compactBreath 1.35s ease-in-out infinite;
}

.context-compact-event.failed .event-mark {
  color: rgb(220, 38, 38);
}

.event-toggle,
.event-static {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  color: inherit;
}

.event-toggle {
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.event-toggle:hover .event-title {
  color: var(--ui-text-primary-fg, var(--text));
}

.event-text {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.event-title {
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 72%, var(--ui-text-muted-fg, var(--muted)) 28%);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.event-meta {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  line-height: 1.4;
}

.context-compact-event.compacting .event-meta {
  animation: textBreath 1.8s ease-in-out infinite;
}

.context-compact-event.failed .event-title {
  color: rgb(220, 38, 38);
}

.event-chevron {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  transform: rotate(-90deg);
  transition: transform 0.16s ease, color 0.16s ease;
}

.event-chevron.expanded {
  transform: rotate(0deg);
}

.event-toggle:hover .event-chevron {
  color: var(--ui-text-primary-fg, var(--text));
}

.summary-content {
  margin: 8px 0 0 27px;
  padding: 9px 0 2px 12px;
  border-left: 1px solid color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 28%, transparent);
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 86%, var(--ui-text-muted-fg, var(--muted)) 14%);
  font-size: 13px;
  line-height: 1.55;
}

.summary-content :deep(h1),
.summary-content :deep(h2),
.summary-content :deep(h3),
.summary-content :deep(h4) {
  margin: 0.75em 0 0.35em;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 1em;
  font-weight: 600;
}

.summary-content :deep(p) {
  margin: 0 0 0.58em;
}

.summary-content :deep(p:last-child) {
  margin-bottom: 0;
}

.summary-content :deep(ul),
.summary-content :deep(ol) {
  margin: 0.45em 0;
  padding-left: 1.25em;
}

.summary-content :deep(li) {
  margin: 0.2em 0;
}

.summary-content :deep(strong) {
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 600;
}

.summary-content {
  --md-inline-code-padding: 1px 5px;
  --md-inline-code-bg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 16%, transparent);
  --md-inline-code-fg: var(--ui-text-primary-fg, var(--text));
}

.summary-enter-active,
.summary-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.summary-enter-from,
.summary-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

@keyframes compactBreath {
  0%, 100% {
    opacity: 0.35;
    transform: scale(0.82);
  }
  50% {
    opacity: 0.9;
    transform: scale(1);
  }
}

@keyframes textBreath {
  0%, 100% {
    opacity: 0.62;
  }
  50% {
    opacity: 1;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .context-compact-event {
    margin: 14px auto 16px;
  }

  .event-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
}
</style>
