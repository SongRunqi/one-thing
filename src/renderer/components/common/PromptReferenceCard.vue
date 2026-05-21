<template>
  <span
    class="prompt-ref-card"
    tabindex="0"
  >
    <NotebookPen :size="13" />
    <span class="prompt-ref-title">{{ title }}</span>
    <span class="prompt-ref-popover">
      <strong>{{ title }}</strong>
      <span
        v-if="description"
        class="prompt-ref-description"
      >{{ description }}</span>
      <span class="prompt-ref-content">{{ content }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { NotebookPen } from 'lucide-vue-next'

defineProps<{
  title: string
  content: string
  description?: string
}>()
</script>

<style scoped>
.prompt-ref-card {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: min(260px, 100%);
  margin: 0 2px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--accent) 9%, var(--bg));
  color: var(--text);
  vertical-align: baseline;
  cursor: default;
  outline: none;
}

.prompt-ref-card:hover,
.prompt-ref-card:focus {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
}

.prompt-ref-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92em;
  font-weight: 650;
}

.prompt-ref-popover {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  width: min(420px, 70vw);
  max-height: 260px;
  display: none;
  flex-direction: column;
  gap: 7px;
  padding: 10px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel, var(--bg));
  color: var(--text);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.2);
  z-index: 50;
  white-space: normal;
}

.prompt-ref-card:hover .prompt-ref-popover,
.prompt-ref-card:focus .prompt-ref-popover,
.prompt-ref-card:focus-within .prompt-ref-popover {
  display: flex;
}

.prompt-ref-description {
  color: var(--muted);
  font-size: 12px;
}

.prompt-ref-content {
  overflow: auto;
  white-space: pre-wrap;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.45;
}
</style>
