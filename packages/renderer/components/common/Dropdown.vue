<template>
  <Popover
    v-model:open="isOpen"
    :anchor="anchor"
    :placement="placement"
    :offset="offset"
    :flip="flip"
    :clamp="clamp"
    :z-layer="zLayer"
    :z-offset="zOffset"
    :base-z="baseZ"
    :close-on="closeOn"
    :shield="shield"
    :surface="false"
    :transition="transition"
    @close="$emit('close')"
  >
    <div
      ref="menuRef"
      class="app-context-menu"
      :class="{ 'is-surface': surface }"
      role="menu"
      :aria-label="ariaLabel"
      :style="{ minWidth: `${minWidth}px` }"
      v-bind="$attrs"
      @click.stop
      @contextmenu.prevent.stop
    >
      <slot>
        <template
          v-for="(item, index) in items"
          :key="item.id"
        >
          <div
            v-if="item.separatorBefore && index > 0"
            class="app-context-divider"
          />
          <!-- 原生 button 而非 Button.vue:菜单行不需要 Button 的任何能力
               (loading/icon/group),而套上去就要和 `.app-button` 打一场特异性官司。
               当初的直接起因(unstyled 仍把 transparent 刷给 BorderBox,且
               `.border-box.is-interactive:hover` (0,4,0) 压过消费者的 (0,3,0))已在
               P2 根治 —— `unstyled` 现在整条关掉 paint 声明。这里保持原生按钮是因为
               它本来就更合适,不再是绕坑。见 docs/design/ui-system.md §1。 -->
          <button
            type="button"
            :class="['app-context-item', { danger: item.danger }]"
            role="menuitem"
            :disabled="item.disabled"
            @click="onSelect(item)"
          >
            <component
              :is="item.icon"
              v-if="item.icon"
              :size="13"
              :stroke-width="2"
            />
            <span>{{ item.label }}</span>
          </button>
        </template>
      </slot>
    </div>
  </Popover>
</template>

<script setup lang="ts">
/**
 * Dropdown — Popover with menu semantics.
 *
 * What it adds over a bare Popover: `role="menu"` / `menuitem`, roving keyboard
 * navigation (↑↓ Home End Enter, Esc via the kernel) and the shared row look.
 * Anchor it to an element for a button menu or to a `{x, y}` point for a
 * right-click menu — `ContextMenu.vue` is exactly the latter, pre-bound.
 *
 * The surface is drawn on an inner element rather than on the Popover root: a
 * child component's root is a fragile place to hang scoped CSS (Popover's root
 * is a Teleport), and the menu keeps its own class names that consumers and
 * tests already select on.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Popover from './Popover.vue'
import type { ContextMenuItem } from './context-menu'
import type { FloatingAnchor, FloatingCloseOn, FloatingZLayer } from '@/composables/floating/useFloatingLayer'
import type { FloatingPlacement } from '@/composables/floating/compute-position'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  open?: boolean
  anchor?: FloatingAnchor
  items?: ContextMenuItem[]
  placement?: FloatingPlacement
  offset?: number
  flip?: boolean
  clamp?: boolean
  zLayer?: FloatingZLayer
  zOffset?: number
  baseZ?: string
  closeOn?: FloatingCloseOn
  shield?: boolean
  transition?: string
  minWidth?: number
  ariaLabel?: string
  /** Draw the shared menu surface; off when the caller's class already does. */
  surface?: boolean
}>(), {
  open: undefined,
  anchor: undefined,
  items: () => [],
  placement: 'bottom-start',
  offset: 6,
  flip: true,
  clamp: true,
  zLayer: 'dropdown',
  zOffset: 0,
  baseZ: undefined,
  closeOn: () => ({ esc: true, outside: true, scroll: true }),
  shield: false,
  transition: 'app-popover',
  minWidth: 184,
  ariaLabel: undefined,
  surface: true,
})

const emit = defineEmits<{
  'update:open': [boolean]
  select: [id: string]
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)

/** Same derived-not-mirrored open state as Popover — see the note there. */
const uncontrolled = ref(false)
const isOpen = computed<boolean>({
  get: () => props.open ?? uncontrolled.value,
  set: (value: boolean) => {
    uncontrolled.value = value
    emit('update:open', value)
  },
})

function onSelect(item: ContextMenuItem) {
  if (item.disabled) return
  emit('select', item.id)
  isOpen.value = false
  emit('close')
}

function enabledRows(): HTMLElement[] {
  const root = menuRef.value
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .filter(row => !row.hasAttribute('disabled'))
}

/** Roving focus rather than a highlight class: the row look already has a
 *  `:focus-visible` state, and focus is what a screen reader follows. */
function moveFocus(delta: number | 'first' | 'last') {
  const rows = enabledRows()
  if (rows.length === 0) return
  if (delta === 'first') { rows[0].focus(); return }
  if (delta === 'last') { rows[rows.length - 1].focus(); return }
  const current = rows.indexOf(document.activeElement as HTMLElement)
  const next = current < 0
    ? (delta > 0 ? 0 : rows.length - 1)
    : (current + delta + rows.length) % rows.length
  rows[next].focus()
}

/** Bound at the window (capture) rather than on the menu: the menu opens with
 *  focus still on the trigger, so a listener inside it would never see the
 *  first ↓. One listener only — two would move the focus twice per press. */
function handleMenuKey(event: KeyboardEvent) {
  if (!isOpen.value) return
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveFocus(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveFocus(-1)
      break
    case 'Home':
      event.preventDefault()
      moveFocus('first')
      break
    case 'End':
      event.preventDefault()
      moveFocus('last')
      break
    default:
      break
  }
}

watch(isOpen, (open) => {
  if (open) window.addEventListener('keydown', handleMenuKey, true)
  else window.removeEventListener('keydown', handleMenuKey, true)
}, { immediate: true })

onBeforeUnmount(() => window.removeEventListener('keydown', handleMenuKey, true))
</script>

<style scoped>
/* 菜单族语言:10px 圆角、纸面、tooltip 影 —— 原 ContextMenu.vue 的样式原样搬来,
   合流后这里是唯一一份。 */
.app-context-menu.is-surface {
  padding: 6px;
  background: var(--ui-surface-menu-bg, var(--ui-surface-elevated-bg));
  border: 1px solid var(--ui-border-subtle-border);
  border-radius: 10px;
  box-shadow: var(--ui-surface-tooltip-shadow);
}

.app-context-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-family: var(--type-label-font);
  font-size: 12.5px;
  text-align: left;
  white-space: nowrap;
  color: var(--ui-text-secondary-fg, var(--ui-text-muted-fg));
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}

/* 悬停三管齐下:底色加深 + 字转主色 + 左缘一道朱砂 —— 单靠 menu-hover token
   在有些主题下与菜单底色几乎同色,分辨不出选中的是哪一行。 */
.app-context-item::before {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background var(--duration-fast) var(--ease-default);
}

.app-context-item:hover:not(:disabled),
.app-context-item:focus-visible:not(:disabled) {
  outline: none;
  color: var(--ui-text-primary-fg);
  background: color-mix(
    in srgb,
    var(--ui-surface-menu-hover-bg, var(--ui-text-primary-fg)) 88%,
    var(--ui-text-primary-fg)
  );
}

.app-context-item:hover:not(:disabled)::before,
.app-context-item:focus-visible:not(:disabled)::before {
  background: var(--ui-accent-primary-fg);
}

.app-context-item.danger {
  color: var(--ui-status-danger-fg, var(--color-danger));
}

.app-context-item.danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--color-danger));
}

.app-context-item.danger:hover:not(:disabled)::before {
  background: var(--ui-status-danger-fg, var(--color-danger));
}

.app-context-item:disabled {
  opacity: 0.45;
  cursor: default;
}

.app-context-item svg {
  flex: 0 0 auto;
}

.app-context-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--ui-border-subtle-border);
}
</style>
