<template>
  <span
    ref="badgeRef"
    :class="['badge', `tone-${tone}`, `size-${size}`]"
  >
    <slot>{{ label }}</slot>
    <!-- detached trigger:徽章是 inline-flex 的叶子,外面套一层 wrapper 会多出一个
         flex 子项并吃掉父级 gap。trigger-el 模式下 Tooltip 自身 display:none,
         只留传送出去的浮层。 -->
    <Tooltip
      :trigger-el="badgeRef"
      :text="title || label"
    />
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Tooltip from '@/components/common/Tooltip.vue'

const badgeRef = ref<HTMLElement | null>(null)

withDefaults(defineProps<{
  label: string
  title?: string
  tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'category-1' | 'category-2' | 'category-3' | 'category-4' | 'category-5' | 'category-6' | 'category-7'
  size?: 'xs' | 'sm'
}>(), {
  tone: 'neutral',
  size: 'xs',
})
</script>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  max-width: 100%;
  border: 1px solid transparent;
  border-radius: 5px;
  font-weight: 750;
  line-height: 1;
  white-space: nowrap;
  text-transform: uppercase;
}

.size-xs {
  min-height: 17px;
  padding: 0 5px;
  font-size: 9.5px;
}

.size-sm {
  min-height: 20px;
  padding: 0 7px;
  font-size: 10.5px;
}

.tone-neutral,
.tone-muted {
  background: color-mix(in srgb, var(--ui-text-muted-fg) 10%, transparent);
  border-color: color-mix(in srgb, var(--ui-text-muted-fg) 16%, transparent);
  color: var(--ui-text-secondary-fg);
}

.tone-accent {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 11%, transparent);
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg) 18%, transparent);
  color: var(--ui-accent-primary-fg);
}

.tone-info {
  background: var(--ui-status-info-bg, transparent);
  border-color: var(--ui-status-info-border, var(--ui-status-info-fg));
  color: var(--ui-status-info-fg, var(--color-info));
}

.tone-success {
  background: var(--ui-status-success-bg, transparent);
  border-color: var(--ui-status-success-border, var(--ui-status-success-fg));
  color: var(--ui-status-success-fg);
}

.tone-warning {
  background: var(--ui-status-warning-bg, transparent);
  border-color: var(--ui-status-warning-border, var(--ui-status-warning-fg));
  color: var(--ui-status-warning-fg);
}

.tone-danger {
  background: var(--ui-status-danger-bg, transparent);
  border-color: var(--ui-status-danger-border, var(--ui-status-danger-fg));
  color: var(--ui-status-danger-fg);
}

.tone-category-1 {
  background: var(--ui-category-1-badge-bg, color-mix(in srgb, var(--ui-category-1-icon, var(--ui-accent-primary-fg)) 12%, transparent));
  border-color: color-mix(in srgb, var(--ui-category-1-icon, var(--ui-accent-primary-fg)) 28%, transparent);
  color: var(--ui-category-1-badge-text, var(--ui-category-1-icon));
}

.tone-category-2 {
  background: var(--ui-category-2-badge-bg, color-mix(in srgb, var(--ui-category-2-icon, var(--ui-status-info-fg, var(--color-info))) 12%, transparent));
  border-color: color-mix(in srgb, var(--ui-category-2-icon, var(--ui-status-info-fg)) 28%, transparent);
  color: var(--ui-category-2-badge-text, var(--ui-category-2-icon));
}

.tone-category-3 {
  background: var(--ui-category-3-badge-bg, color-mix(in srgb, var(--ui-category-3-icon, var(--ui-status-success-fg, var(--color-success))) 12%, transparent));
  border-color: color-mix(in srgb, var(--ui-category-3-icon, var(--ui-status-success-fg)) 28%, transparent);
  color: var(--ui-category-3-badge-text, var(--ui-category-3-icon));
}

.tone-category-4 {
  background: var(--ui-category-4-badge-bg, color-mix(in srgb, var(--ui-category-4-icon, var(--ui-status-warning-fg, var(--color-warning))) 12%, transparent));
  border-color: color-mix(in srgb, var(--ui-category-4-icon, var(--ui-status-warning-fg)) 28%, transparent);
  color: var(--ui-category-4-badge-text, var(--ui-category-4-icon));
}

.tone-category-5 {
  background: var(--ui-category-5-badge-bg, color-mix(in srgb, var(--ui-category-5-icon, var(--ui-status-warning-fg, var(--color-warning))) 12%, transparent));
  border-color: color-mix(in srgb, var(--ui-category-5-icon, var(--ui-status-warning-fg)) 28%, transparent);
  color: var(--ui-category-5-badge-text, var(--ui-category-5-icon));
}

.tone-category-6 {
  background: var(--ui-category-6-badge-bg, color-mix(in srgb, var(--ui-category-6-icon, var(--ui-text-muted-fg)) 12%, transparent));
  border-color: color-mix(in srgb, var(--ui-category-6-icon, var(--ui-text-muted-fg)) 28%, transparent);
  color: var(--ui-category-6-badge-text, var(--ui-category-6-icon));
}

.tone-category-7 {
  background: var(--ui-category-7-badge-bg, color-mix(in srgb, var(--ui-category-7-icon, var(--ui-accent-primary-fg)) 12%, transparent));
  border-color: color-mix(in srgb, var(--ui-category-7-icon, var(--ui-accent-primary-fg)) 28%, transparent);
  color: var(--ui-category-7-badge-text, var(--ui-category-7-icon));
}
</style>
