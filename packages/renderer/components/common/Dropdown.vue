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
      :class="surfaceClass"
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
            :class="['app-context-item', { danger: item.danger, 'has-submenu': hasChildren(item) }]"
            role="menuitem"
            :disabled="item.disabled"
            :aria-haspopup="hasChildren(item) ? 'menu' : undefined"
            :aria-expanded="hasChildren(item) ? (openSubmenuId === item.id) : undefined"
            @click="onSelect(item, $event)"
            @mouseenter="onRowEnter(item, $event)"
            @mouseleave="onRowLeave(item, $event)"
            @keydown.right="hasChildren(item) && openSubmenu(item, $event)"
          >
            <component
              :is="item.icon"
              v-if="item.icon"
              :size="13"
              :stroke-width="2"
            />
            <span>{{ item.label }}</span>
            <ChevronRight
              v-if="hasChildren(item)"
              class="app-context-item-chevron"
              :size="13"
              :stroke-width="2"
            />
          </button>
        </template>

        <!-- 二级浮层(G3):它是**另一层 Popover**,不是画在行里的绝对定位面 ——
             菜单本身是 overflow 裁剪语境,画在原地必然被切。递归用自己,于是
             三级、四级都不需要新代码。 -->
        <Dropdown
          v-if="openSubmenuItem"
          ref="submenuRef"
          :open="true"
          :anchor="submenuAnchor"
          :items="openSubmenuItem.children"
          placement="right-start"
          :offset="2"
          :z-layer="zLayer"
          :z-offset="zOffset + 1"
          :base-z="baseZ"
          :surface="surface"
          :min-width="minWidth"
          :transition="transition"
          :close-on="SUBMENU_CLOSE_ON"
          :aria-label="openSubmenuItem.label"
          @mouseenter="cancelSubmenuTravel"
          @select="onSubmenuSelect"
        />
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
 *
 * An item carrying `children` opens a second floating menu beside itself — the
 * component recurses into itself, so depth costs no code. See `onRowEnter` for
 * why the safe triangle is the only correct way to hover across the gap.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import Popover from './Popover.vue'
import { popoverSurfaceClasses, type PopoverSurface } from './popover-surface'
import { buildSafeTriangle, isPointInRect, isPointInTriangle, type SafeTriangle } from './safe-triangle'
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
  /**
   * Draw the shared menu surface; off when the caller's class already does.
   * Accepts a Popover surface tier too — Dropdown's default tier is `menu`
   * (the face it has always drawn), so `true` / omitted is unchanged.
   */
  surface?: boolean | PopoverSurface
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

/** 缺省档(menu)不加修饰类,既有调用点的 DOM 与命中规则不变。 */
const surfaceClass = computed(() => popoverSurfaceClasses(props.surface, 'menu'))

/** Same derived-not-mirrored open state as Popover — see the note there. */
const uncontrolled = ref(false)
const isOpen = computed<boolean>({
  get: () => props.open ?? uncontrolled.value,
  set: (value: boolean) => {
    uncontrolled.value = value
    emit('update:open', value)
  },
})

/* ───────────────────────── 二级浮层(G3, 2026-08-11) ─────────────────────────
 * 悬停开、指针可以斜着走过去。斜线会扫过中间那几行 —— 光靠 mouseenter 判断,
 * 半路就把子菜单换掉了。安全三角(./safe-triangle.ts,Tooltip 用了两年的那份)
 * 把"从离开父行的那一点到子面板近边"的楔形认作仍在悬停,是这条路唯一正确的判法。
 *
 * 楔形的顶点必须是**离开父行的那一点**,不是当前指针 —— 拿当前点当顶点的话它
 * 永远是三角形的一个顶,测试恒真,等于没有护栏。
 */

/** 停在楔形里多久算"不去了"。每次落在楔形内的移动都会重新上弦。 */
const SUBMENU_TRAVEL_GRACE_MS = 400

/** 子菜单自己不听外点/滚动:父菜单关时它跟着关,这两条会重复关两次。 */
const SUBMENU_CLOSE_ON = Object.freeze({ esc: false, outside: false, scroll: false })

const openSubmenuId = ref<string | null>(null)
const submenuAnchor = ref<HTMLElement | null>(null)
const submenuRef = ref<{ menuEl: HTMLElement | null } | null>(null)
let submenuTravel: SafeTriangle | null = null
let submenuTravelTimer: ReturnType<typeof setTimeout> | null = null

function hasChildren(item: ContextMenuItem): boolean {
  return !!item.children && item.children.length > 0
}

const openSubmenuItem = computed<ContextMenuItem | null>(
  () => props.items.find(item => item.id === openSubmenuId.value && hasChildren(item)) ?? null,
)

function cancelSubmenuTravel() {
  if (submenuTravelTimer) clearTimeout(submenuTravelTimer)
  submenuTravelTimer = null
  submenuTravel = null
}

function closeSubmenu() {
  cancelSubmenuTravel()
  openSubmenuId.value = null
  submenuAnchor.value = null
}

function openSubmenu(item: ContextMenuItem, event: Event) {
  if (item.disabled) return
  cancelSubmenuTravel()
  submenuAnchor.value = event.currentTarget as HTMLElement
  openSubmenuId.value = item.id
}

function onRowEnter(item: ContextMenuItem, event: MouseEvent) {
  if (hasChildren(item)) {
    openSubmenu(item, event)
    return
  }
  if (!openSubmenuId.value) return
  // 正走向已开的子面板:楔形里(或已经贴到面板边上)就不打断。
  const panel = submenuRef.value?.menuEl?.getBoundingClientRect()
  const point = { x: event.clientX, y: event.clientY }
  if (panel && isPointInRect(point, panel, 8)) return
  if (submenuTravel && isPointInTriangle(point, submenuTravel)) {
    if (panel) submenuTravel = buildSafeTriangle(point, panel, 'right')
    if (submenuTravelTimer) clearTimeout(submenuTravelTimer)
    submenuTravelTimer = setTimeout(closeSubmenu, SUBMENU_TRAVEL_GRACE_MS)
    return
  }
  closeSubmenu()
}

function onRowLeave(item: ContextMenuItem, event: MouseEvent) {
  if (!hasChildren(item) || openSubmenuId.value !== item.id) return
  const panel = submenuRef.value?.menuEl?.getBoundingClientRect()
  if (!panel) return
  submenuTravel = buildSafeTriangle({ x: event.clientX, y: event.clientY }, panel, 'right')
  if (submenuTravelTimer) clearTimeout(submenuTravelTimer)
  submenuTravelTimer = setTimeout(closeSubmenu, SUBMENU_TRAVEL_GRACE_MS)
}

/** 叶子行才发 `select` —— 处理器因此永远不必知道这一行藏在第几层。 */
function onSubmenuSelect(id: string) {
  closeSubmenu()
  emit('select', id)
  isOpen.value = false
  emit('close')
}

function onSelect(item: ContextMenuItem, event: MouseEvent) {
  if (item.disabled) return
  if (hasChildren(item)) {
    // 有子项的行不是动作,是一道门:点击等于把门推开(键盘 → 同理)。
    openSubmenu(item, event)
    return
  }
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
  // 子菜单开着时,方向键归它 —— 两层各自装一个 window 监听,不让位就每按一下
  // 走两格。← 是回到父层的那一步,所以它由父层收。
  if (openSubmenuId.value) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      closeSubmenu()
      ;(submenuAnchor.value as HTMLElement | null)?.focus()
    }
    return
  }
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
  else {
    window.removeEventListener('keydown', handleMenuKey, true)
    closeSubmenu()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleMenuKey, true)
  cancelSubmenuTravel()
})

/** 二级浮层要量父面板的 rect(安全三角),所以父层把自己的面板元素露出来。 */
defineExpose({ menuEl: menuRef })
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

/* 非缺省档:与 Popover 的档位表同一套配方(那里是唯一出处),这里只是把它
   落到菜单自己的内框上 —— Dropdown 的面画在内元素而不是 Popover 根上,
   理由见文件头注。 */
.app-context-menu.is-surface.is-surface-floating {
  background: var(--ui-surface-floating-bg);
  box-shadow: var(--shadow-floating);
}

.app-context-menu.is-surface.is-surface-elevated {
  background: var(--ui-surface-elevated-bg);
  box-shadow: var(--shadow-elevated);
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

/* 有子项的行:右端一枚人字符号,和"这一行是道门"是同一件事(G3)。 */
.app-context-item-chevron {
  margin-left: auto;
  opacity: 0.6;
}

.app-context-item.has-submenu[aria-expanded='true'] .app-context-item-chevron,
.app-context-item.has-submenu:hover .app-context-item-chevron {
  opacity: 1;
}

.app-context-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--ui-border-subtle-border);
}
</style>
