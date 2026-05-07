<template>
  <div class="tool-step-details">
    <ToolDiffPreview
      v-if="activeDiff"
      ref="streamingPreviewRef"
      :diff="activeDiff"
      :lines="activeDiffLines"
      :status="view.status"
    />

    <div
      v-if="view.liveOutput"
      class="detail-section live"
    >
      <pre>{{ view.liveOutput }}</pre>
    </div>

    <div
      v-if="view.step.thinking"
      class="detail-section"
    >
      <div class="detail-label">
        Thinking
      </div>
      <pre class="thinking">{{ view.step.thinking }}</pre>
    </div>

    <div
      v-if="view.argsJson"
      class="detail-section"
    >
      <div class="detail-label">
        {{ view.toolName === 'bash' ? 'Command' : 'Arguments' }}
      </div>
      <pre class="code-block">{{ view.argsJson }}</pre>
    </div>

    <div
      v-if="view.resultText"
      class="detail-section"
    >
      <pre class="code-block">{{ view.resultText }}</pre>
    </div>

    <div
      v-if="view.step.summary"
      class="detail-section"
    >
      <div class="detail-label">
        Analysis
      </div>
      <pre class="summary">{{ view.step.summary }}</pre>
    </div>

    <div
      v-if="view.step.error"
      class="detail-section error"
    >
      <div class="detail-label">
        Error
      </div>
      <pre class="error-text">{{ view.step.error }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ToolStepView } from '@/stores/helpers/tool-step-view'
import ToolDiffPreview from './ToolDiffPreview.vue'

const props = defineProps<{
  view: ToolStepView
}>()

const streamingPreviewRef = ref<InstanceType<typeof ToolDiffPreview> | null>(null)

const activeDiff = computed(() => props.view.diff || props.view.streamingDiff)
const activeDiffLines = computed(() => props.view.diff ? props.view.diffLines : props.view.streamingDiffLines)

watch(
  () => props.view.streamingContent?.content,
  () => {
    nextTick(() => {
      streamingPreviewRef.value?.scrollToBottom()
    })
  },
  { immediate: true },
)
</script>

<style scoped>
.tool-step-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.detail-section {
  min-width: 0;
}

.detail-section.live {
  border-left: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  padding-left: var(--space-2, 8px);
}

.detail-label {
  font-family: var(--type-caption-font, var(--font-body));
  font-size: var(--type-caption-size, 11px);
  font-weight: var(--type-caption-weight, 500);
  color: var(--text-tool-label);
  margin-bottom: var(--space-1, 4px);
}

pre {
  margin: 0;
  padding: 9px 11px;
  border-radius: var(--radius-sm, 8px);
  background: var(--bg-code-block);
  border: 1px solid var(--border-code);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm, 12px);
  line-height: var(--line-height-normal, 1.5);
  color: var(--text-code-block);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow-y: auto;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-elevated) 40%, transparent);
}

.thinking {
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-code-block));
  border-left: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
}

.summary {
  background: color-mix(in srgb, var(--color-success) 8%, var(--bg-code-block));
  border-left: 2px solid color-mix(in srgb, var(--color-success) 45%, transparent);
}

.error-text {
  color: var(--text-error);
  background: color-mix(in srgb, var(--color-danger) 8%, var(--bg-code-block));
  border-left: 2px solid color-mix(in srgb, var(--color-danger) 45%, transparent);
}

</style>
