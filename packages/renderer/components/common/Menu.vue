<template>
  <component
    :is="as"
    ref="rootRef"
    class="app-menu"
    :class="menuClasses"
    :style="menuStyle"
    :role="resolvedMode === 'horizontal' ? 'menubar' : 'menu'"
    :aria-orientation="resolvedMode"
    :data-active-index="activeIndex || undefined"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch,
  type Component,
  type StyleValue,
} from 'vue'
import {
  menuContextKey,
  type MenuCloseEvent,
  type MenuItemClicked,
  type MenuMode,
  type MenuOpenEvent,
  type MenuRegisteredItem,
  type MenuRegisteredSubMenu,
  type MenuSelectEvent,
  type MenuTrigger,
} from './menu'

defineOptions({
  name: 'AppMenu',
})

const props = withDefaults(defineProps<{
  as?: string | Component
  modelValue?: string
  defaultActive?: string
  defaultOpeneds?: string[]
  mode?: MenuMode
  collapse?: boolean
  uniqueOpened?: boolean
  menuTrigger?: MenuTrigger
  closeOnClickOutside?: boolean
  ellipsis?: boolean
  popperOffset?: number
  showTimeout?: number
  hideTimeout?: number
  backgroundColor?: string
  textColor?: string
  activeTextColor?: string
}>(), {
  as: 'nav',
  modelValue: undefined,
  defaultActive: '',
  defaultOpeneds: () => [],
  mode: 'vertical',
  collapse: false,
  uniqueOpened: false,
  menuTrigger: 'hover',
  closeOnClickOutside: false,
  ellipsis: true,
  popperOffset: 6,
  showTimeout: 300,
  hideTimeout: 300,
  backgroundColor: undefined,
  textColor: undefined,
  activeTextColor: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [index: string]
  select: Parameters<MenuSelectEvent>
  open: Parameters<MenuOpenEvent>
  close: Parameters<MenuCloseEvent>
}>()

const rootRef = ref<HTMLElement | null>(null)
const activeIndex = ref(props.modelValue ?? props.defaultActive)
const openedIndexes = ref(new Set(props.defaultOpeneds))
const itemMap = new Map<string, MenuRegisteredItem>()
const subMenuMap = new Map<string, MenuRegisteredSubMenu>()

const isControlled = computed(() => props.modelValue !== undefined)
const resolvedMode = computed(() => props.mode)
const isCollapsed = computed(() => props.collapse && resolvedMode.value === 'vertical')
const isUniqueOpened = computed(() => props.uniqueOpened)
const resolvedMenuTrigger = computed(() => props.menuTrigger)
const resolvedPopperOffset = computed(() => Math.max(0, props.popperOffset))
const resolvedShowTimeout = computed(() => Math.max(0, props.showTimeout))
const resolvedHideTimeout = computed(() => Math.max(0, props.hideTimeout))

const menuClasses = computed(() => [
  `app-menu--${resolvedMode.value}`,
  {
    'app-menu--collapse': isCollapsed.value,
    'app-menu--ellipsis': props.ellipsis && resolvedMode.value === 'horizontal',
  },
])

const menuStyle = computed<StyleValue>(() => {
  const style: Record<string, string> = {}

  if (props.backgroundColor) {
    style['--app-menu-bg'] = props.backgroundColor
  }
  if (props.textColor) {
    style['--app-menu-item-fg'] = props.textColor
  }
  if (props.activeTextColor) {
    style['--app-menu-active-fg'] = props.activeTextColor
  }

  return style
})

watch(
  () => props.modelValue,
  value => {
    if (value !== undefined) activeIndex.value = value
  },
)

watch(
  () => props.defaultActive,
  value => {
    if (!isControlled.value) activeIndex.value = value
  },
)

watch(
  () => props.defaultOpeneds,
  value => {
    openedIndexes.value = new Set(value)
  },
  { deep: true },
)

function registerItem(item: MenuRegisteredItem) {
  itemMap.set(item.index.value, item)
}

function unregisterItem(index: string) {
  itemMap.delete(index)
}

function registerSubMenu(subMenu: MenuRegisteredSubMenu) {
  subMenuMap.set(subMenu.index.value, subMenu)
}

function unregisterSubMenu(index: string) {
  subMenuMap.delete(index)
}

function getActivePath(): string[] {
  if (!activeIndex.value) return []
  return itemMap.get(activeIndex.value)?.indexPath.value ?? [activeIndex.value]
}

function isItemActive(index: string): boolean {
  return activeIndex.value === index
}

function isSubMenuActive(index: string): boolean {
  return getActivePath().includes(index)
}

function isSubMenuOpen(index: string): boolean {
  return openedIndexes.value.has(index)
}

function setActiveIndex(index: string) {
  if (!isControlled.value) {
    activeIndex.value = index
  }
  emit('update:modelValue', index)
}

function selectItem(item: MenuItemClicked) {
  setActiveIndex(item.index)
  emit('select', item.index, item.indexPath, item)

  if (resolvedMode.value === 'horizontal' || isCollapsed.value) {
    closeAllSubMenus()
  }
}

function toggleSubMenu(index: string, indexPath: string[], open?: boolean) {
  const nextOpen = open ?? !openedIndexes.value.has(index)

  if (nextOpen) {
    const previous = openedIndexes.value
    const next = isUniqueOpened.value ? new Set<string>() : new Set(openedIndexes.value)
    for (const pathIndex of indexPath) {
      next.add(pathIndex)
    }
    openedIndexes.value = next
    if (isUniqueOpened.value) {
      for (const openedIndex of previous) {
        if (!next.has(openedIndex)) {
          const subMenu = subMenuMap.get(openedIndex)
          emit('close', openedIndex, subMenu?.indexPath.value ?? [openedIndex])
        }
      }
    }
    emit('open', index, indexPath)
    return
  }

  const next = new Set(openedIndexes.value)
  for (const openedIndex of openedIndexes.value) {
    const openedPath = subMenuMap.get(openedIndex)?.indexPath.value ?? [openedIndex]
    if (openedIndex === index || openedPath.includes(index)) {
      next.delete(openedIndex)
    }
  }
  openedIndexes.value = next
  emit('close', index, indexPath)
}

function open(index: string) {
  const subMenu = subMenuMap.get(index)
  toggleSubMenu(index, subMenu?.indexPath.value ?? [index], true)
}

function close(index: string) {
  const subMenu = subMenuMap.get(index)
  toggleSubMenu(index, subMenu?.indexPath.value ?? [index], false)
}

function closeAllSubMenus() {
  if (openedIndexes.value.size === 0) return

  const previous = openedIndexes.value
  openedIndexes.value = new Set()

  for (const index of previous) {
    const subMenu = subMenuMap.get(index)
    emit('close', index, subMenu?.indexPath.value ?? [index])
  }
}

function updateActiveIndex(index: string) {
  setActiveIndex(index)
}

function handleResize() {
  // Kept for API parity with Element Plus; layout is CSS-driven here.
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!props.closeOnClickOutside) return

  const root = rootRef.value
  const target = event.target
  if (root && target instanceof Node && !root.contains(target)) {
    closeAllSubMenus()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

provide(menuContextKey, {
  activeIndex,
  mode: resolvedMode,
  collapse: isCollapsed,
  uniqueOpened: isUniqueOpened,
  menuTrigger: resolvedMenuTrigger,
  popperOffset: resolvedPopperOffset,
  showTimeout: resolvedShowTimeout,
  hideTimeout: resolvedHideTimeout,
  registerItem,
  unregisterItem,
  registerSubMenu,
  unregisterSubMenu,
  isItemActive,
  isSubMenuActive,
  isSubMenuOpen,
  selectItem,
  toggleSubMenu,
  closeAllSubMenus,
})

defineExpose({
  open,
  close,
  handleResize,
  updateActiveIndex,
})
</script>

<style scoped>
.app-menu {
  --app-menu-bg: var(--ui-surface-menu-bg);
  --app-menu-item-bg: transparent;
  --app-menu-item-fg: var(--text-menu-item, var(--ui-text-secondary-fg));
  --app-menu-item-hover-bg: var(--ui-surface-menu-hover-bg);
  --app-menu-item-hover-fg: var(--text-menu-item-hover, var(--ui-text-primary-fg));
  --app-menu-active-bg: var(--bg-menu-item-active, var(--ui-surface-menu-hover-bg, var(--ui-state-hover-bg)));
  --app-menu-active-fg: var(--text-menu-item-active, var(--ui-accent-primary-fg));
  --app-menu-disabled-fg: var(--ui-text-muted-fg);
  --app-menu-border: var(--ui-border-subtle-border, var(--ui-border-default-border));
  --app-menu-shadow: var(--ui-surface-tooltip-shadow, var(--shadow-lg));
  --app-menu-item-height: 34px;
  --app-menu-item-radius: 7px;
  --app-menu-item-gap: 9px;
  --app-menu-indent-step: 18px;
  --app-menu-padding: 6px;
  --app-menu-horizontal-height: 40px;
  --app-menu-width: 220px;
  --app-menu-collapse-width: 48px;
  --app-menu-popper-min-width: 184px;

  display: flex;
  box-sizing: border-box;
  min-width: 0;
  color: var(--app-menu-item-fg);
  background: var(--app-menu-bg);
  border: 1px solid var(--app-menu-border);
  border-radius: 8px;
}

.app-menu--vertical {
  flex-direction: column;
  width: var(--app-menu-width);
  padding: var(--app-menu-padding);
}

.app-menu--horizontal {
  flex-direction: row;
  align-items: stretch;
  width: 100%;
  min-height: var(--app-menu-horizontal-height);
  padding: 0 6px;
  border-radius: 0;
  border-inline: 0;
}

.app-menu--collapse {
  width: var(--app-menu-collapse-width);
}

.app-menu--ellipsis {
  overflow: visible;
}
</style>
