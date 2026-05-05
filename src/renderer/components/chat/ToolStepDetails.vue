<template>
  <div class="tool-step-details">
    <div
      v-if="view.streamingContent"
      ref="streamingPreviewRef"
      class="detail-section diff-preview"
    >
      <div class="diff-content streaming">
        <div
          v-for="(line, idx) in streamingLines"
          :key="idx"
          class="diff-line diff-add"
        >
          <span class="line-number new">{{ idx + 1 }}</span>
          <span class="line-prefix">+</span>
          <span class="line-content">{{ line }}</span>
        </div>
      </div>
    </div>

    <ToolDiffPreview
      v-else-if="view.diff"
      :diff="view.diff"
      :lines="view.diffLines"
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

const streamingPreviewRef = ref<HTMLElement | null>(null)

const streamingLines = computed(() => {
  const content = props.view.streamingContent?.content
  return content ? content.split('\n') : []
})

watch(
  () => props.view.streamingContent?.content,
  () => {
    nextTick(() => {
      if (streamingPreviewRef.value) {
        streamingPreviewRef.value.scrollTop = streamingPreviewRef.value.scrollHeight
      }
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

.diff-preview {
  margin-top: 2px;
}

.diff-content {
  background: var(--bg-code-block);
  border: 1px solid var(--border-code);
  border-radius: var(--radius-sm, 8px);
  max-height: 240px;
  overflow-y: auto;
  font-size: var(--font-size-sm, 12px);
  line-height: var(--line-height-normal, 1.5);
  font-family: var(--font-mono);
}

.diff-line {
  display: flex;
  white-space: pre;
  padding: 1px 10px 1px 0;
  min-height: 21px;
  align-items: center;
}

.line-number {
  width: 42px;
  text-align: right;
  padding-right: 10px;
  color: var(--text-faint);
  user-select: none;
  flex-shrink: 0;
  font-size: var(--font-size-xs, 11px);
}

.line-prefix {
  width: 18px;
  min-width: 18px;
  text-align: center;
  user-select: none;
  flex-shrink: 0;
  font-weight: 600;
  color: var(--text-success);
}

.line-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding-right: 8px;
}

.diff-add {
  background: var(--diff-add-bg);
  color: var(--diff-add-text);
}

.diff-add .line-number {
  color: rgba(var(--color-success-rgb), 0.6);
}
</style>
