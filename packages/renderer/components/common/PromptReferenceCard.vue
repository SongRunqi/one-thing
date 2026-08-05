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
/* Inline mention set like a spec token: mono, link-colored, thin outline;
   hover for the full card. */
.prompt-ref-card {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  max-width: min(240px, 100%);
  margin: 0 2px;
  padding: 0 5px;
  border: 1px solid color-mix(in srgb, var(--ui-text-link-fg, var(--ui-accent-primary-fg)) 40%, transparent);
  border-radius: 3px;
  background: transparent;
  color: var(--ui-text-link-fg, var(--ui-accent-primary-fg));
  vertical-align: baseline;
  cursor: default;
  outline: none;
  transition: border-color var(--duration-normal) var(--ease-default), background var(--duration-normal) var(--ease-default);
}

.prompt-ref-card:hover,
.prompt-ref-card:focus-visible {
  border-color: color-mix(in srgb, var(--ui-text-link-fg, var(--ui-accent-primary-fg)) 70%, transparent);
  background: color-mix(in srgb, var(--ui-text-link-fg, var(--ui-accent-primary-fg)) 8%, transparent);
}

.prompt-ref-card > svg {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  align-self: center;
}

.prompt-ref-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 0.86em;
  font-weight: 600;
  line-height: inherit;
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
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  background: var(--ui-surface-panel-bg);
  color: var(--ui-text-primary-fg);
  box-shadow: var(--shadow-floating);
  z-index: var(--z-dropdown);
  white-space: normal;
}

.prompt-ref-card:hover .prompt-ref-popover,
.prompt-ref-card:focus-visible .prompt-ref-popover,
.prompt-ref-card:focus-within .prompt-ref-popover {
  display: flex;
}

.prompt-ref-description {
  color: var(--ui-text-muted-fg);
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
