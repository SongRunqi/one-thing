<template>
  <div
    class="app-menu-item-group"
    role="group"
  >
    <div
      v-if="$slots.title || title"
      class="app-menu-item-group-title"
      :style="titleStyle"
    >
      <slot name="title">
        {{ title }}
      </slot>
    </div>

    <div class="app-menu-item-group-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, type StyleValue } from 'vue'
import { subMenuContextKey } from './menu'

defineOptions({
  name: 'MenuItemGroup',
})

withDefaults(defineProps<{
  title?: string
}>(), {
  title: '',
})

const parentSubMenu = inject(subMenuContextKey, null)
const level = computed(() => parentSubMenu ? parentSubMenu.level.value + 1 : 1)

const titleStyle = computed<StyleValue>(() => ({
  paddingInlineStart: `calc(12px + ${level.value - 1} * var(--app-menu-indent-step))`,
}))
</script>

<style scoped>
.app-menu-item-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 4px 0;
}

.app-menu-item-group-title {
  min-width: 0;
  padding-block: 6px 4px;
  color: var(--text-menu-header, var(--ui-text-muted-fg, var(--text-muted)));
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-menu-item-group-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
</style>
