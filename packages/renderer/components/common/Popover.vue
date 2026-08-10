<template>
  <span
    v-if="$slots.trigger"
    ref="triggerRef"
    class="app-popover-trigger"
    @click="onTriggerClick"
  >
    <slot
      name="trigger"
      :open="layer.open.value"
    />
  </span>

  <Teleport to="body">
    <!-- Shield: swallows the dismissing press instead of letting it through to
         whatever is underneath. Menus opened over a list need it (a stray click
         would both close the menu and select a row); plain panels do not. -->
    <div
      v-if="shield && layer.open.value"
      class="app-popover-shield"
      :style="shieldStyle"
      @pointerdown.stop="layer.hide()"
      @contextmenu.prevent.stop="layer.hide()"
      @wheel.stop="layer.hide()"
    />
    <Transition :name="transition">
      <div
        v-if="layer.open.value"
        :ref="layer.setFloatingEl"
        class="app-popover"
        :class="surfaceClass"
        :data-placement="layer.placement.value ?? undefined"
        v-bind="$attrs"
        :style="[$attrs.style as StyleValue, layer.floatingStyle.value]"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Popover — the thin shell over `useFloatingLayer()`.
 *
 * It owns exactly two things: the floating surface (background / hairline /
 * `--shadow-floating` / `--radius-sm`) and the wiring to the kernel. Everything
 * about *where* it lands lives in `composables/floating/`; everything about
 * *what* is in it comes from the default slot.
 *
 * Slot content stays in the CALLER's scoped-CSS scope (that is how a migrated
 * panel keeps its own styling — see docs/design/ui-system-consolidation.md
 * §6.1); pass `:surface="false"` when the content already draws its own frame,
 * so the two do not stack.
 *
 * **Surface tiers (G6/G1, 2026-08-10).** The Popover ROOT cannot carry the
 * caller's scoped-CSS scope — its root is a Teleport and Vue hands the scopeId
 * to a single root element only (docs/design/ui-system.md §1). That is why every
 * consumer that wanted a different face had to draw its own inner frame with
 * `:surface="false"`. `surface` now also accepts a tier name so the face comes
 * from HERE instead:
 *
 *   `'floating'` (= `true` = default) 锚定浮层的通用面 —— unchanged from before
 *   `'menu'`      菜单族面(S 带 / trigger / ⋯ 菜单,2026-08-09 拍板的族色)
 *   `'elevated'`  抬起的卡片面(内容卡 / 预览卡,更重的投影)
 *
 * Instance-level `--app-popover-{bg,border,radius,shadow,padding}` still win
 * over every tier — the tiers only move the FALLBACK.
 */
import { computed, ref, type StyleValue } from 'vue'
import {
  useFloatingLayer,
  type FloatingAnchor,
  type FloatingCloseOn,
  type FloatingCloseReason,
  type FloatingZLayer,
} from '@/composables/floating/useFloatingLayer'
import type { ComputedPosition, FloatingPlacement } from '@/composables/floating/compute-position'
import { popoverSurfaceClasses, type PopoverSurface } from './popover-surface'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** Controlled open state (`v-model:open`). Omit to let the trigger own it. */
  open?: boolean
  /** Element or `{x, y}` point to hang off. Defaults to the `trigger` slot. */
  anchor?: FloatingAnchor
  placement?: FloatingPlacement
  offset?: number
  flip?: boolean
  clamp?: boolean
  margin?: number
  zLayer?: FloatingZLayer
  zOffset?: number
  /** Full z-index expression — the "follow the host's level" escape hatch. */
  baseZ?: string
  width?: number | string | 'anchor'
  closeOn?: FloatingCloseOn
  trapFocus?: boolean
  returnFocus?: boolean
  /**
   * Draw the shared floating surface. `false` = off (content brings its own);
   * `true` = the `floating` tier; a tier name picks the face explicitly.
   */
  surface?: boolean | PopoverSurface
  /** Full-viewport catcher under the layer that eats the dismissing click. */
  shield?: boolean
  /** `click` needs the trigger slot; `manual` is driven by `v-model:open`. */
  trigger?: 'click' | 'manual'
  /** Transition name; `none` disables (no CSS defined for it). */
  transition?: string
}>(), {
  open: undefined,
  anchor: undefined,
  placement: 'bottom-start',
  offset: 6,
  flip: true,
  clamp: true,
  margin: 8,
  zLayer: 'dropdown',
  zOffset: 0,
  baseZ: undefined,
  width: undefined,
  closeOn: () => ({ esc: true, outside: true }),
  trapFocus: false,
  returnFocus: false,
  surface: true,
  shield: false,
  trigger: 'manual',
  transition: 'app-popover',
})

const emit = defineEmits<{
  'update:open': [boolean]
  close: [FloatingCloseReason]
  positioned: [ComputedPosition]
}>()

const triggerRef = ref<HTMLElement | null>(null)

/** 缺省档不加修饰类 —— 见 popover-surface.ts 的零破坏说明。 */
const surfaceClass = computed(() => popoverSurfaceClasses(props.surface, 'floating'))

/**
 * Controlled when `open` is passed, self-owned otherwise — *derived*, never a
 * mirror kept in sync by a watcher. A mirror silently desynchronises whenever
 * the owner's value round-trips inside one tick (close → reopen on the same
 * right-click: the prop ends where it started, the watcher never fires, and the
 * copy is left closed). Reading the prop straight through cannot drift.
 */
const uncontrolled = ref(false)
const isOpen = computed<boolean>({
  get: () => props.open ?? uncontrolled.value,
  set: (value) => {
    uncontrolled.value = value
    emit('update:open', value)
  },
})

const anchor = computed<FloatingAnchor>(() => props.anchor ?? triggerRef.value)

const layer = useFloatingLayer({
  open: isOpen,
  anchor,
  placement: () => props.placement,
  offset: () => props.offset,
  flip: () => props.flip,
  clamp: () => props.clamp,
  margin: () => props.margin,
  zLayer: () => props.zLayer,
  zOffset: () => props.zOffset,
  baseZ: () => props.baseZ,
  width: () => props.width,
  closeOn: () => props.closeOn,
  trapFocus: () => props.trapFocus,
  returnFocus: () => props.returnFocus,
  onPositioned: position => emit('positioned', position),
  onRequestClose: reason => void emit('close', reason),
})

const shieldStyle = computed<StyleValue>(() => ({
  position: 'fixed',
  inset: 0,
  // One stop under the layer itself, whatever stop that turned out to be.
  zIndex: `calc(${layer.zIndex.value} - 1)`,
}))

function onTriggerClick() {
  if (props.trigger !== 'click') return
  layer.toggle()
}

defineExpose({
  show: layer.show,
  hide: layer.hide,
  toggle: layer.toggle,
  update: layer.update,
})
</script>

<style scoped>
.app-popover-trigger {
  display: inline-flex;
}

/* Positioning comes from the kernel as an inline style; this rule is only the
   surface. Instances override through the three custom properties rather than
   re-declaring background/border/shadow — that is what keeps one look. */
.app-popover.is-surface {
  padding: var(--app-popover-padding, 6px);
  border: 1px solid var(--app-popover-border, var(--ui-border-subtle-border));
  border-radius: var(--app-popover-radius, var(--radius-sm));
  background: var(--app-popover-bg, var(--ui-surface-floating-bg));
  box-shadow: var(--app-popover-shadow, var(--shadow-floating));
}

/* 非缺省档:只改「面色 / 边框 / 圆角 / 阴影」四项,几何(padding)仍归上面那条
   基规则,所以换档不会把内容挤位。四条声明照旧把 `--app-popover-*` 排在最前 ——
   实例级覆写(StatusChip 的 `.status-chip-flyout` 那种)必须继续赢过档位。
   基规则一个字未动,缺省档因此与改动前逐字节相同。 */
.app-popover.is-surface.is-surface-menu {
  /* 菜单族面:2026-08-09 拍板的"S 带 / trigger / ctx 统一菜单面"。边框比 floating
     重一档、圆角 10px —— 与 more-menu / plugin-trigger-panel 现有配方对齐。 */
  border-color: var(--app-popover-border, var(--ui-border-strong-border));
  border-radius: var(--app-popover-radius, var(--radius-md));
  background: var(--app-popover-bg, var(--ui-surface-menu-bg, var(--ui-surface-elevated-bg)));
  box-shadow: var(--app-popover-shadow, var(--shadow-floating));
}

.app-popover.is-surface.is-surface-elevated {
  /* 抬起的卡片面:内容卡 / 预览卡这类"读一段字"的浮层,投影走对话框那一档。 */
  border-color: var(--app-popover-border, var(--ui-border-subtle-border));
  border-radius: var(--app-popover-radius, var(--radius-md));
  background: var(--app-popover-bg, var(--ui-surface-elevated-bg));
  box-shadow: var(--app-popover-shadow, var(--shadow-elevated));
}

/* A floating layer is never part of the window's drag region — a menu you
   cannot click because the frame swallowed the press is the worst kind of bug. */
.app-popover {
  -webkit-app-region: no-drag;
}

.app-popover-enter-active {
  transition:
    opacity var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-spring);
}

.app-popover-leave-active {
  transition:
    opacity var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.app-popover-enter-from,
.app-popover-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
