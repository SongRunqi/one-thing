<template>
  <div :class="['attachment-thumb', `size-${size}`, { clickable }]">
    <img
      class="attachment-thumb-img"
      :src="src"
      :alt="alt"
      :title="title || alt"
      draggable="false"
      @click="handleClick"
    >
    <Button
      v-if="removable"
      text
      circle
      class="attachment-remove attachment-thumb-remove"
      native-type="button"
      :title="`Remove ${alt}`"
      :aria-label="`Remove ${alt}`"
      :icon="X"
      @mousedown.prevent
      @click.stop="emit('remove')"
    />
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  src: string
  alt: string
  size?: 'sm' | 'md'
  removable?: boolean
  clickable?: boolean
  title?: string
}>(), {
  size: 'md',
  removable: false,
  clickable: false,
  title: '',
})

const emit = defineEmits<{
  (e: 'remove'): void
  (e: 'open'): void
}>()

function handleClick(event: MouseEvent) {
  if (!props.clickable) return
  event.stopPropagation()
  emit('open')
}
</script>

<style scoped>
.attachment-thumb {
  position: relative;
  flex: 0 0 auto;
  line-height: 0;
}

.attachment-thumb-img {
  display: block;
  object-fit: cover;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 45%, transparent);
  background: var(--ui-state-disabled-bg, var(--bg-muted));
  user-select: none;
}

.attachment-thumb.clickable .attachment-thumb-img {
  cursor: zoom-in;
}

.attachment-thumb.size-sm .attachment-thumb-img {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-xs, 4px);
}

.attachment-thumb.size-md .attachment-thumb-img {
  max-width: min(240px, 100%);
  max-height: 240px;
  width: auto;
  height: auto;
  border-radius: var(--radius-xs, 4px);
  box-shadow: var(--ui-content-media-shadow, none);
}

.attachment-thumb-remove {
  --app-button-height: 16px;
  --app-button-min-width: 16px;
  --app-button-padding-x: 0;
  --app-button-shadow: none;
  --app-button-hover-shadow: none;
  --app-button-hover-fill: var(--ui-state-hover-bg);
  --app-button-hover-fg: var(--ui-text-primary-fg);

  position: absolute;
  top: -5px;
  right: -5px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0.5px solid var(--ui-composer-overlay-border);
  border-radius: 999px;
  background: var(--ui-surface-panel-bg);
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.attachment-thumb-remove :deep(svg) {
  width: 10px;
  height: 10px;
}

.attachment-thumb-remove:hover {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
}
</style>
