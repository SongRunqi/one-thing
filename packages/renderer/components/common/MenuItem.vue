<template>
  <div
    class="app-menu-node app-menu-item-node"
    :class="nodeClasses"
    role="none"
  >
    <component
      :is="itemAs"
      class="app-menu-item"
      :type="itemAs === 'button' ? 'button' : undefined"
      role="menuitem"
      :style="itemStyle"
      :disabled="itemAs === 'button' ? disabled : undefined"
      :tabindex="disabled ? -1 : 0"
      :title="title || undefined"
      :aria-disabled="disabled ? 'true' : undefined"
      :aria-current="isActive ? 'page' : undefined"
      :data-index="index"
      :data-active="isActive ? 'true' : undefined"
      @click="handleClick"
      @keydown="handleKeydown"
    >
      <template v-if="raw">
        <slot>
          <slot name="title">
            {{ title }}
          </slot>
        </slot>
      </template>
      <template v-else>
        <span
          v-if="$slots.icon"
          class="app-menu-item-icon"
          aria-hidden="true"
        >
          <slot name="icon" />
        </span>

        <span class="app-menu-item-label">
          <slot>
            <slot name="title">{{ title }}</slot>
          </slot>
        </span>
      </template>
    </component>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, watch, type StyleValue } from 'vue'
import {
  menuContextKey,
  subMenuContextKey,
  type MenuItemClicked,
  type MenuRoute,
  type MenuRegisteredItem,
} from './menu'
import { isEditableTarget } from '@/utils/editable-target'

defineOptions({
  name: 'MenuItem',
})

const props = withDefaults(defineProps<{
  index: string
  itemAs?: 'button' | 'div'
  raw?: boolean
  title?: string
  route?: MenuRoute
  disabled?: boolean
}>(), {
  itemAs: 'button',
  raw: false,
  title: '',
  route: undefined,
  disabled: false,
})

const emit = defineEmits<{
  click: [item: MenuItemClicked, event: MouseEvent]
}>()

const menu = inject(menuContextKey, null)
const parentSubMenu = inject(subMenuContextKey, null)

const itemLevel = computed(() => parentSubMenu ? parentSubMenu.level.value + 1 : 1)
const indexPath = computed(() => parentSubMenu ? [...parentSubMenu.indexPath.value, props.index] : [props.index])
const isActive = computed(() => menu?.isItemActive(props.index) ?? false)
const isCollapsedRootItem = computed(() => Boolean(menu?.collapse.value && itemLevel.value === 1))
const itemAs = computed(() => props.itemAs)
const route = computed(() => props.route)
const disabled = computed(() => props.disabled)

const itemState: MenuRegisteredItem = {
  index: computed(() => props.index),
  indexPath,
  disabled,
  route,
}

let registeredIndex = props.index
menu?.registerItem(itemState)

watch(
  () => props.index,
  (index, oldIndex) => {
    menu?.unregisterItem(oldIndex)
    menu?.registerItem(itemState)
    registeredIndex = index
  },
)

onBeforeUnmount(() => {
  menu?.unregisterItem(registeredIndex)
})

const nodeClasses = computed(() => ({
  'is-active': isActive.value,
  'is-disabled': disabled.value,
  'is-collapsed': isCollapsedRootItem.value,
  'is-root-level': itemLevel.value === 1,
  'is-nested': itemLevel.value > 1,
  'is-horizontal': menu?.mode.value === 'horizontal',
  'is-raw': props.raw,
}))

const itemStyle = computed<StyleValue>(() => {
  if (menu?.mode.value === 'horizontal' || isCollapsedRootItem.value) return undefined

  return {
    paddingInlineStart: `calc(12px + ${itemLevel.value - 1} * var(--app-menu-indent-step))`,
  }
})

function buildClickedItem(): MenuItemClicked {
  return {
    index: props.index,
    indexPath: indexPath.value,
    route: props.route,
  }
}

function handleClick(event: MouseEvent) {
  if (disabled.value) return

  const item = buildClickedItem()
  menu?.selectItem(item)
  emit('click', item, event)
}

function handleKeydown(event: KeyboardEvent) {
  if (disabled.value) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  // raw 插槽里可能嵌了输入控件（如会话重命名框），Enter/Space 属于它们，不能当菜单激活键吞掉
  if (isEditableTarget(event.target)) return

  event.preventDefault()
  const item = buildClickedItem()
  menu?.selectItem(item)
}
</script>

<style scoped>
.app-menu-node,
.app-menu-item {
  box-sizing: border-box;
  min-width: 0;
}

.app-menu-item-node {
  position: relative;
}

.app-menu-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--app-menu-item-gap);
  width: 100%;
  min-width: 0;
  height: var(--app-menu-item-height);
  padding: 0 12px;
  border: 0;
  border-radius: var(--app-menu-item-radius);
  background: var(--app-menu-item-bg);
  color: var(--app-menu-item-fg);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  text-align: left;
  cursor: pointer;
  outline: none;
  transition: background 0.12s ease, color 0.12s ease;
}

.app-menu-item:hover,
.app-menu-item:focus-visible {
  background: var(--app-menu-item-hover-bg);
  color: var(--app-menu-item-hover-fg);
}

.app-menu-item:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-menu-active-fg) 34%, transparent);
}

.app-menu-item-node.is-active > .app-menu-item {
  background: var(--app-menu-active-bg);
  color: var(--app-menu-active-fg);
  font-weight: 600;
}

.app-menu-item-node.is-disabled > .app-menu-item {
  color: var(--app-menu-disabled-fg);
  cursor: not-allowed;
  opacity: 0.58;
}

.app-menu-item-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.app-menu-item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-menu-item-node.is-horizontal {
  display: flex;
  align-items: stretch;
}

.app-menu-item-node.is-horizontal > .app-menu-item {
  height: var(--app-menu-horizontal-height);
  border-radius: 0;
  border-bottom: 2px solid transparent;
  padding: 0 14px;
}

.app-menu-item-node.is-horizontal.is-active > .app-menu-item {
  background: transparent;
  border-bottom-color: var(--app-menu-active-fg);
}

.app-menu-item-node.is-raw > .app-menu-item {
  display: block;
  height: auto;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: inherit;
}

.app-menu-item-node.is-raw > .app-menu-item:hover,
.app-menu-item-node.is-raw > .app-menu-item:focus-visible,
.app-menu-item-node.is-raw.is-active > .app-menu-item {
  background: transparent;
  color: inherit;
  font-weight: inherit;
}

.app-menu-item-node.is-collapsed > .app-menu-item {
  justify-content: center;
  padding: 0;
}

.app-menu-item-node.is-collapsed .app-menu-item-label {
  width: 0;
  opacity: 0;
}
</style>
