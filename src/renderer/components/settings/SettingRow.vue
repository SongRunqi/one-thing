<template>
  <div
    class="setting-row"
    :class="[
      `setting-row-${layout}`,
      { 'setting-row-disabled': disabled },
      { 'setting-row-no-copy': !hasCopy },
    ]"
  >
    <div
      v-if="hasCopy"
      class="setting-row-head"
    >
      <div class="setting-row-title">
        <slot name="label">
          {{ label }}
        </slot>
      </div>
      <div
        v-if="layout === 'split'"
        class="setting-row-control"
      >
        <slot />
      </div>
    </div>

    <div
      v-if="hasDescription"
      class="setting-row-description"
    >
      <slot name="description">
        {{ description }}
      </slot>
    </div>

    <div
      v-if="!hasCopy || layout === 'stack'"
      class="setting-row-control"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  description?: string
  layout?: 'split' | 'stack'
  disabled?: boolean
}>(), {
  layout: 'split',
  disabled: false,
})

const slots = useSlots()
const hasCopy = computed(() => Boolean(props.label || props.description || slots.label || slots.description))
const hasDescription = computed(() => Boolean(props.description || slots.description))
</script>

<style scoped>
.setting-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
}

.setting-row:last-child {
  border-bottom: 0;
}

.setting-row-split {
  min-height: 58px;
  justify-content: center;
}

.setting-row-stack {
  gap: 9px;
}

.setting-row-no-copy {
  min-height: 0;
}

.setting-row-disabled {
  opacity: 0.58;
}

.setting-row-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 420px);
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.setting-row-stack > .setting-row-head {
  grid-template-columns: minmax(0, 1fr);
}

.setting-row-title {
  min-width: 0;
  overflow: hidden;
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-row-description {
  max-width: min(760px, 100%);
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  font-size: 12px;
  line-height: 1.4;
}

.setting-row-control {
  display: flex;
  align-items: center;
  min-width: 0;
  width: 100%;
}

.setting-row-split > .setting-row-head > .setting-row-control {
  justify-content: flex-end;
}

.setting-row-stack > .setting-row-control {
  width: 100%;
}

.setting-row-no-copy > .setting-row-control {
  justify-content: flex-start;
  justify-self: stretch;
}

.setting-row-control :deep(input:not([type='checkbox']):not([type='radio']),
select,
textarea) {
  width: 100%;
}

@media (max-width: 720px) {
  .setting-row-head {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .setting-row-title {
    white-space: normal;
  }

  .setting-row-control,
  .setting-row-split > .setting-row-head > .setting-row-control {
    justify-content: flex-start;
  }
}
</style>
