<template>
  <div
    class="setting-row"
    :class="[
      `setting-row-${layout}`,
      { 'setting-row-disabled': disabled },
    ]"
  >
    <div
      v-if="label || description || $slots.label || $slots.description"
      class="setting-row-copy"
    >
      <div class="setting-row-title">
        <slot name="label">
          {{ label }}
        </slot>
      </div>
      <div
        v-if="description || $slots.description"
        class="setting-row-description"
      >
        <slot name="description">
          {{ description }}
        </slot>
      </div>
    </div>
    <div class="setting-row-control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  description?: string
  layout?: 'split' | 'stack'
  disabled?: boolean
}>(), {
  layout: 'split',
  disabled: false,
})
</script>

<style scoped>
.setting-row {
  display: flex;
  gap: 16px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
}

.setting-row:last-child {
  border-bottom: 0;
}

.setting-row-split {
  align-items: center;
  justify-content: space-between;
}

.setting-row-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 9px;
}

.setting-row-disabled {
  opacity: 0.58;
}

.setting-row-copy {
  min-width: 0;
  flex: 1;
}

.setting-row-title {
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.setting-row-description {
  max-width: 560px;
  margin-top: 3px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  font-size: 12px;
  line-height: 1.45;
}

.setting-row-control {
  min-width: 0;
}

.setting-row-split > .setting-row-control {
  flex-shrink: 0;
}

.setting-row-stack > .setting-row-control {
  width: 100%;
}
</style>
