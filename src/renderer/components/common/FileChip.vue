<template>
  <div
    :class="['file-chip', `size-${size}`]"
    :title="tooltip"
  >
    <span class="file-chip-icon">
      <FileText
        :size="13"
        :stroke-width="2"
      />
    </span>
    <span class="file-chip-name">{{ fileName }}</span>
    <Button
      v-if="removable"
      text
      circle
      class="attachment-remove file-chip-remove"
      native-type="button"
      :title="`Remove ${fileName}`"
      :aria-label="`Remove ${fileName}`"
      :icon="X"
      @mousedown.prevent
      @click.stop="emit('remove')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/common/Button.vue'
import { FileText, X } from 'lucide-vue-next'
import { formatFileSize } from '@/utils/format'

const props = withDefaults(defineProps<{
  fileName: string
  sizeBytes?: number
  size?: 'sm' | 'md'
  removable?: boolean
}>(), {
  sizeBytes: undefined,
  size: 'md',
  removable: false,
})

const emit = defineEmits<{
  (e: 'remove'): void
}>()

const tooltip = computed(() => {
  return props.sizeBytes !== undefined
    ? `${props.fileName} (${formatFileSize(props.sizeBytes)})`
    : props.fileName
})
</script>

<style scoped>
.file-chip {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  height: 28px;
  max-width: min(220px, 100%);
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 45%, transparent);
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
}

.file-chip.size-sm {
  height: 26px;
}

.file-chip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ui-text-muted-fg, var(--muted));
}

.file-chip-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.25;
}

.file-chip-remove {
  --app-button-height: 18px;
  --app-button-min-width: 18px;
  --app-button-padding-x: 0;
  --app-button-shadow: none;
  --app-button-hover-shadow: none;
  --app-button-hover-fill: var(--ui-state-hover-bg, var(--hover));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));

  width: 18px;
  height: 18px;
  margin-right: -3px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.file-chip-remove :deep(svg) {
  width: 12px;
  height: 12px;
}

.file-chip-remove:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}
</style>
