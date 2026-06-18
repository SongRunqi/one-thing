<template>
  <div
    class="app-menu-node app-sub-menu"
    :class="subMenuClasses"
    role="none"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <button
      class="app-sub-menu-title"
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      :style="titleStyle"
      :disabled="disabled"
      :tabindex="disabled ? -1 : 0"
      :title="title || undefined"
      :aria-expanded="isOpened ? 'true' : 'false'"
      :aria-disabled="disabled ? 'true' : undefined"
      :data-index="index"
      @click="handleTitleClick"
      @keydown="handleTitleKeydown"
    >
      <ChevronRight
        v-if="expandIconPosition === 'start'"
        class="app-sub-menu-chevron"
        :class="{ 'is-opened': isOpened }"
        :size="15"
        :stroke-width="2"
        aria-hidden="true"
      />

      <span
        v-if="$slots.icon"
        class="app-sub-menu-icon"
        aria-hidden="true"
      >
        <slot name="icon" />
      </span>

      <span class="app-sub-menu-label">
        <slot name="title">{{ title }}</slot>
      </span>

      <ChevronRight
        v-if="expandIconPosition === 'end'"
        class="app-sub-menu-chevron"
        :class="{ 'is-opened': isOpened }"
        :size="15"
        :stroke-width="2"
        aria-hidden="true"
      />
    </button>

    <Transition :name="isPopper ? 'app-menu-popper' : 'app-menu-collapse'">
      <div
        v-if="isOpened"
        class="app-sub-menu-panel"
        :class="panelClasses"
        :style="panelStyle"
        role="menu"
        :aria-label="title || undefined"
      >
        <slot />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { computed, inject, onBeforeUnmount, provide, watch, type StyleValue } from 'vue'
import {
  menuContextKey,
  subMenuContextKey,
  type SubMenuExpandIconPosition,
  type MenuRegisteredSubMenu,
} from './menu'

defineOptions({
  name: 'SubMenu',
})

const props = withDefaults(defineProps<{
  index: string
  title?: string
  disabled?: boolean
  expandIconPosition?: SubMenuExpandIconPosition
  popperOffset?: number
  showTimeout?: number
  hideTimeout?: number
}>(), {
  title: '',
  disabled: false,
  expandIconPosition: 'end',
  popperOffset: undefined,
  showTimeout: undefined,
  hideTimeout: undefined,
})

const menu = inject(menuContextKey, null)
const parentSubMenu = inject(subMenuContextKey, null)

const level = computed(() => parentSubMenu ? parentSubMenu.level.value + 1 : 1)
const indexPath = computed(() => parentSubMenu ? [...parentSubMenu.indexPath.value, props.index] : [props.index])
const disabled = computed(() => props.disabled)
const expandIconPosition = computed(() => props.expandIconPosition)
const isOpened = computed(() => menu?.isSubMenuOpen(props.index) ?? false)
const isActive = computed(() => menu?.isSubMenuActive(props.index) ?? false)
const isHorizontal = computed(() => menu?.mode.value === 'horizontal')
const isCollapsedMenu = computed(() => Boolean(menu?.collapse.value))
const isPopper = computed(() => isHorizontal.value || isCollapsedMenu.value)
const isRootLevel = computed(() => level.value === 1)
const usesHoverTrigger = computed(() => !disabled.value && isPopper.value && menu?.menuTrigger.value === 'hover')
const resolvedPopperOffset = computed(() => Math.max(0, props.popperOffset ?? menu?.popperOffset.value ?? 6))
const resolvedShowTimeout = computed(() => Math.max(0, props.showTimeout ?? menu?.showTimeout.value ?? 300))
const resolvedHideTimeout = computed(() => Math.max(0, props.hideTimeout ?? menu?.hideTimeout.value ?? 300))

const subMenuState: MenuRegisteredSubMenu = {
  index: computed(() => props.index),
  indexPath,
  disabled,
}

let registeredIndex = props.index
let hoverTimer: ReturnType<typeof setTimeout> | undefined
menu?.registerSubMenu(subMenuState)

watch(
  () => props.index,
  (index, oldIndex) => {
    menu?.unregisterSubMenu(oldIndex)
    menu?.registerSubMenu(subMenuState)
    registeredIndex = index
  },
)

onBeforeUnmount(() => {
  clearHoverTimer()
  menu?.unregisterSubMenu(registeredIndex)
})

provide(subMenuContextKey, {
  indexPath,
  level,
})

const subMenuClasses = computed(() => ({
  'is-active': isActive.value,
  'is-opened': isOpened.value,
  'is-disabled': disabled.value,
  'is-root-level': isRootLevel.value,
  'is-nested': level.value > 1,
  'is-horizontal': isHorizontal.value,
  'is-collapsed': isCollapsedMenu.value && isRootLevel.value,
  'is-popper': isPopper.value,
}))

const panelClasses = computed(() => ({
  'is-popper': isPopper.value,
  'is-horizontal-root': isHorizontal.value && isRootLevel.value,
}))

const titleStyle = computed<StyleValue>(() => {
  if (isHorizontal.value || (isCollapsedMenu.value && isRootLevel.value)) return undefined

  return {
    paddingInlineStart: `calc(12px + ${level.value - 1} * var(--app-menu-indent-step))`,
  }
})

const panelStyle = computed<StyleValue>(() => {
  if (!isPopper.value) return undefined

  const offset = `${resolvedPopperOffset.value}px`
  if (isHorizontal.value && isRootLevel.value) {
    return {
      top: `calc(100% + ${offset})`,
      left: '0',
    }
  }

  return {
    top: '0',
    left: `calc(100% + ${offset})`,
  }
})

function clearHoverTimer() {
  if (!hoverTimer) return
  clearTimeout(hoverTimer)
  hoverTimer = undefined
}

function setOpen(open: boolean, delay: number) {
  clearHoverTimer()

  if (delay <= 0) {
    menu?.toggleSubMenu(props.index, indexPath.value, open)
    return
  }

  hoverTimer = setTimeout(() => {
    menu?.toggleSubMenu(props.index, indexPath.value, open)
    hoverTimer = undefined
  }, delay)
}

function toggleOpen() {
  if (disabled.value) return
  menu?.toggleSubMenu(props.index, indexPath.value)
}

function handleMouseEnter() {
  if (!usesHoverTrigger.value) return
  setOpen(true, resolvedShowTimeout.value)
}

function handleMouseLeave() {
  if (!usesHoverTrigger.value) return
  setOpen(false, resolvedHideTimeout.value)
}

function handleTitleClick() {
  toggleOpen()
}

function handleTitleKeydown(event: KeyboardEvent) {
  if (disabled.value) return

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleOpen()
    return
  }

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    menu?.toggleSubMenu(props.index, indexPath.value, true)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    menu?.toggleSubMenu(props.index, indexPath.value, false)
  }
}
</script>

<style scoped>
.app-menu-node,
.app-sub-menu,
.app-sub-menu-title,
.app-sub-menu-panel {
  box-sizing: border-box;
  min-width: 0;
}

.app-sub-menu {
  position: relative;
}

.app-sub-menu-title {
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

.app-sub-menu-title:hover,
.app-sub-menu-title:focus-visible {
  background: var(--app-menu-item-hover-bg);
  color: var(--app-menu-item-hover-fg);
}

.app-sub-menu-title:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-menu-active-fg) 34%, transparent);
}

.app-sub-menu.is-active > .app-sub-menu-title {
  color: var(--app-menu-active-fg);
  font-weight: 600;
}

.app-sub-menu.is-disabled > .app-sub-menu-title {
  color: var(--app-menu-disabled-fg);
  cursor: not-allowed;
  opacity: 0.58;
}

.app-sub-menu-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.app-sub-menu-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-sub-menu-chevron {
  flex: 0 0 auto;
  color: currentColor;
  opacity: 0.72;
  transition: transform 0.14s ease;
}

.app-sub-menu-chevron.is-opened {
  transform: rotate(90deg);
}

.app-sub-menu-panel {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 2px 0 4px;
  padding: 2px 0 0;
}

.app-sub-menu-panel.is-popper {
  position: absolute;
  z-index: var(--z-dropdown);
  min-width: var(--app-menu-popper-min-width);
  margin: 0;
  padding: var(--app-menu-padding);
  background: var(--app-menu-bg);
  border: 1px solid var(--app-menu-border);
  border-radius: 8px;
  box-shadow: var(--app-menu-shadow);
}

.app-sub-menu.is-horizontal {
  display: flex;
  align-items: stretch;
}

.app-sub-menu.is-horizontal > .app-sub-menu-title {
  height: var(--app-menu-horizontal-height);
  border-radius: 0;
  border-bottom: 2px solid transparent;
  padding: 0 14px;
}

.app-sub-menu.is-horizontal.is-active > .app-sub-menu-title,
.app-sub-menu.is-horizontal.is-opened > .app-sub-menu-title {
  border-bottom-color: var(--app-menu-active-fg);
}

.app-sub-menu.is-collapsed > .app-sub-menu-title {
  justify-content: center;
  padding: 0;
}

.app-sub-menu.is-collapsed .app-sub-menu-label,
.app-sub-menu.is-collapsed > .app-sub-menu-title > .app-sub-menu-chevron {
  width: 0;
  opacity: 0;
}

.app-menu-collapse-enter-active,
.app-menu-collapse-leave-active {
  overflow: hidden;
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.app-menu-collapse-enter-from,
.app-menu-collapse-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

.app-menu-popper-enter-active,
.app-menu-popper-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.app-menu-popper-enter-from,
.app-menu-popper-leave-to {
  opacity: 0;
  transform: translateY(-2px) scale(0.98);
}
</style>
