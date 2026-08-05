<template>
  <Teleport to="body">
    <Transition :name="transition">
      <div
        v-if="isOpen"
        class="app-dialog-overlay"
        :class="[`is-${variant}`, { 'is-danger': danger }]"
        :style="[overlayStyle, $attrs.style as StyleValue]"
        @click.self="onOverlayClick"
      >
        <div
          ref="panelRef"
          class="app-dialog"
          :class="[
            `is-${variant}`,
            {
              'is-danger': danger,
              'has-header-divider': dividers === true || dividers === 'header',
              'has-actions-divider': dividers === true || dividers === 'actions',
            },
          ]"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          :aria-label="title || undefined"
          v-bind="passthroughAttrs"
          :style="panelStyle"
        >
          <slot name="header">
            <header
              v-if="title || $slots['header-leading'] || $slots['header-extra']"
              class="app-dialog-header"
            >
              <slot name="header-leading" />
              <h3 v-if="title">
                {{ title }}
              </h3>
              <slot name="header-extra" />
            </header>
          </slot>

          <div class="app-dialog-body">
            <slot />
          </div>

          <footer
            v-if="$slots.actions"
            class="app-dialog-actions"
          >
            <slot name="actions" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Dialog — the one modal shell (docs/design/ui-system.md §1).
 *
 * It componentises the `.dialog-overlay` / `.dialog` / `.dialog-header` /
 * `.dialog-body` / `.dialog-actions` convention that sixteen files had each
 * re-implemented, and owns the four things every one of them got slightly
 * differently: Teleport, the `--z-modal` overlay, Esc, and focus.
 *
 * NOT a `useFloatingLayer()` consumer: a dialog is not anchored to anything, so
 * the positioning kernel has nothing to contribute. What it *does* share is
 * focus management — `composables/floating/useFocusTrap` was extracted from the
 * kernel in P2 precisely so this file could reuse the trap instead of growing a
 * second copy of the same Tab arithmetic.
 *
 * Header slots: `title` covers the plain case; `header-leading` /
 * `header-extra` add an icon before / a close button after it while keeping
 * Dialog's header metrics; `header` replaces the whole bar (and then the
 * divider and paddings are the caller's, because a scoped rule in Dialog cannot
 * reach slot content).
 *
 * Skinning contract (方案 §6.1): the panel's own frame is Dialog's; everything
 * inside a slot stays in the CALLER's scoped-CSS scope and keeps working
 * unchanged. What does NOT survive a migration is a caller rule that targeted
 * the skeleton (`.dialog-overlay`, `.dialog`, `.dialog-header` …) — those must
 * be deleted and re-expressed through props or the `--app-dialog-*` custom
 * properties below, which are inherited by header/body/actions:
 *
 *   --app-dialog-width | --app-dialog-max-height | --app-dialog-radius
 *   --app-dialog-bg | --app-dialog-border | --app-dialog-shadow
 *   --app-dialog-padding | --app-dialog-header-padding | --app-dialog-body-padding
 *   --app-dialog-actions-padding | --app-dialog-actions-gap
 *   --app-dialog-actions-justify | --app-dialog-body-overflow
 *   --app-dialog-overlay-bg | --app-dialog-overlay-padding | --app-dialog-divider
 *
 * Pass them through `:style` — it is applied to the overlay (the root), so both
 * the scrim's and the panel's properties land from one object.
 */
import { computed, onBeforeUnmount, ref, useAttrs, watch, type CSSProperties, type StyleValue } from 'vue'
import { ownsEsc, popEscLayer, pushEscLayer } from '@/composables/floating/esc-stack'
import { useFocusTrap } from '@/composables/floating/useFocusTrap'
import type { FloatingZLayer } from '@/composables/floating/useFloatingLayer'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** Controlled open state (`v-model:open`). */
  open?: boolean
  title?: string
  /** Preset max-width: 400 / 480 / 600px. `width` overrides it. */
  size?: 'sm' | 'md' | 'lg'
  /** Explicit max-width; a number is px. */
  width?: number | string
  /** Tints the shell's accent (`--app-dialog-accent`) for destructive asks. */
  danger?: boolean
  /**
   * Hairlines under the header and above the actions. `'header'` / `'actions'`
   * pick one — the settings dialogs draw the header rule but not the footer's.
   */
  dividers?: boolean | 'header' | 'actions'
  closeOnOverlay?: boolean
  closeOnEsc?: boolean
  /** Move focus into the panel when it opens. */
  autoFocus?: boolean
  /** Hand focus back to the opener on close. */
  returnFocus?: boolean
  /**
   * `paper` = the settings/ledger skin (app-bg panel, strong hairline,
   * `--shadow-paper`, square corners); `default` = the elevated rounded skin of
   * the original global `.dialog` class.
   */
  variant?: 'default' | 'paper'
  zLayer?: FloatingZLayer
  /** Relative order inside the stop: `calc(var(--z-modal) + n)`, n ≤ 30. */
  zOffset?: number
  /** Full z-index expression, for a dialog that must beat its own host. */
  baseZ?: string
  /** Transition name; anything without CSS behaves as no animation. */
  transition?: string
}>(), {
  open: undefined,
  title: undefined,
  size: 'md',
  width: undefined,
  danger: false,
  dividers: true,
  closeOnOverlay: true,
  closeOnEsc: true,
  autoFocus: true,
  returnFocus: true,
  variant: 'default',
  zLayer: 'modal',
  zOffset: 0,
  baseZ: undefined,
  transition: 'app-dialog',
})

const emit = defineEmits<{
  'update:open': [boolean]
  close: ['esc' | 'overlay']
}>()

const panelRef = ref<HTMLElement | null>(null)

/**
 * `class` lands on the panel (that is what a caller means by "my dialog"), but
 * `style` lands on the OVERLAY. Custom properties inherit downwards only, so a
 * caller setting `--app-dialog-overlay-bg` on the panel would silently do
 * nothing; putting the whole style object on the root makes every
 * `--app-dialog-*` reach both the overlay and, by inheritance, the panel.
 */
const attrs = useAttrs()
const passthroughAttrs = computed(() => {
  const { style: _style, ...rest } = attrs
  return rest
})

/**
 * Derived, never a watcher-kept mirror. A mirror desynchronises whenever the
 * owner's value round-trips inside one tick (close-then-reopen on the same
 * click); reading the prop straight through cannot drift. Same rule as
 * `Popover.vue` — it was learned the hard way in P1.
 */
const uncontrolled = ref(false)
const isOpen = computed<boolean>({
  get: () => props.open ?? uncontrolled.value,
  set: (value) => {
    uncontrolled.value = value
    emit('update:open', value)
  },
})

const SIZE_WIDTH: Record<'sm' | 'md' | 'lg', string> = {
  sm: '400px',
  md: '480px',
  lg: '600px',
}

const zIndex = computed(() => {
  if (props.baseZ) return props.baseZ
  return props.zOffset
    ? `calc(var(--z-${props.zLayer}) + ${props.zOffset})`
    : `var(--z-${props.zLayer})`
})

const overlayStyle = computed<CSSProperties>(() => ({ zIndex: zIndex.value }))

const panelStyle = computed<CSSProperties>(() => {
  const width = props.width ?? SIZE_WIDTH[props.size]
  return { '--app-dialog-width': typeof width === 'number' ? `${width}px` : width } as CSSProperties
})

/** This instance's slot in the shared Escape stack. */
const escToken = Symbol('dialog')

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  // Not only other dialogs: a Select panel opened inside this sheet is a layer
  // above it and pushes its own token (composables/floating/esc-stack).
  if (!ownsEsc(escToken)) return
  event.stopPropagation()
  event.preventDefault()
  requestClose('esc')
}

function requestClose(reason: 'esc' | 'overlay') {
  emit('close', reason)
  isOpen.value = false
}

function onOverlayClick() {
  if (!props.closeOnOverlay) return
  requestClose('overlay')
}

function enterEscStack() {
  pushEscLayer(escToken)
  window.addEventListener('keydown', onKeydown, true)
}

function leaveEscStack() {
  popEscLayer(escToken)
  window.removeEventListener('keydown', onKeydown, true)
}

watch(isOpen, (open) => {
  if (open && props.closeOnEsc) enterEscStack()
  else leaveEscStack()
}, { immediate: true })

// `closeOnEsc` can be toggled while open (a form that blocks dismissal only
// while it is saving).
watch(() => props.closeOnEsc, (enabled) => {
  if (isOpen.value && enabled) enterEscStack()
  else leaveEscStack()
})

onBeforeUnmount(leaveEscStack)

useFocusTrap({
  container: panelRef,
  active: isOpen,
  autoFocus: () => props.autoFocus,
  returnFocus: () => props.returnFocus,
})

defineExpose({
  /** The panel element, for a caller that needs to measure or focus into it. */
  panel: panelRef,
  close: () => { isOpen.value = false },
})
</script>

<style scoped>
.app-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--app-dialog-overlay-padding, 20px);
  background: var(--app-dialog-overlay-bg, rgb(0 0 0 / 0.6));
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  /* A modal is never part of the window's drag region. */
  -webkit-app-region: no-drag;
}

/* A 60%-black scrim over a light theme reads as a blackout. The migrated
   dialogs disagreed on this (0.6 / 0.5 / 0.3); one theme-aware default settles
   it. No `:global()` needed — the overlay IS Dialog's root, so it carries the
   scope id and `html[…]` is just an ancestor. (`:global(X) .y` is also a known
   silent-truncation trap in this repo.) */
html[data-theme='light'] .app-dialog-overlay {
  background: var(--app-dialog-overlay-bg, rgb(0 0 0 / 0.3));
}

/* The ledger skin: the overlay is a wash of the app background, not a black
   scrim — that is what keeps the settings area feeling like paper. */
.app-dialog-overlay.is-paper {
  background: var(
    --app-dialog-overlay-bg,
    color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 55%, transparent)
  );
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.app-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--app-dialog-width, 480px);
  max-height: var(--app-dialog-max-height, 85vh);
  min-width: 0;
  /* For the "one padded card, no sections" shape (the room dialogs); the
     per-section paddings are then set to 0 by the caller. */
  padding: var(--app-dialog-padding, 0);
  border-radius: var(--app-dialog-radius, var(--radius-lg));
  border: 1px solid var(--app-dialog-border, var(--ui-border-default-border, var(--border)));
  background: var(--app-dialog-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  /* Matches the original global `.dialog` exactly (components.css:124) so the
     sixteen migrations are pixel-equivalent; `--shadow-elevated` is the last
     resort rather than the first, per 方案 §2.2. */
  box-shadow: var(--app-dialog-shadow, var(--ui-surface-elevated-shadow, var(--shadow-elevated)));
  outline: none;
}

.app-dialog.is-paper {
  border-radius: var(--app-dialog-radius, 0);
  border-color: var(--app-dialog-border, var(--ui-border-strong-border, var(--border-strong, var(--border))));
  background: var(--app-dialog-bg, var(--ui-surface-app-bg, var(--bg)));
  box-shadow: var(--app-dialog-shadow, var(--shadow-paper));
}

.app-dialog.is-danger {
  --app-dialog-accent: var(--ui-status-danger-fg, var(--danger));
}

.app-dialog-header {
  display: flex;
  align-items: center;
  justify-content: var(--app-dialog-header-justify, space-between);
  gap: 12px;
  flex-shrink: 0;
  padding: var(--app-dialog-header-padding, 20px 24px);
}

.app-dialog.has-header-divider .app-dialog-header {
  border-bottom: 1px solid var(--app-dialog-divider, var(--ui-border-default-border, var(--border)));
}

.app-dialog.is-paper.has-header-divider .app-dialog-header {
  border-bottom: 1px solid var(
    --app-dialog-divider,
    color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent)
  );
}

/* The ledger metrics the six settings dialogs all hand-wrote identically.
   Baking them into the variant is the point of the variant — a caller that
   needs different numbers still sets the same custom properties. */
.app-dialog.is-paper .app-dialog-header {
  padding: var(--app-dialog-header-padding, 14px 18px 12px);
}

.app-dialog.is-paper .app-dialog-body {
  padding: var(--app-dialog-body-padding, 16px 18px 4px);
}

.app-dialog.is-paper .app-dialog-actions {
  padding: var(--app-dialog-actions-padding, 14px 18px 16px);
  gap: var(--app-dialog-actions-gap, 18px);
}

.app-dialog-header :deep(h3) {
  margin: 0;
  /* `--app-dialog-title-font` exists because the pre-P2 dialogs disagreed: the
     ones built on the global `.dialog-header h3` were display/serif, while the
     two that rolled their own title (`RejectReasonDialog`, `Settings`) inherited
     the body sans. Those two pass `inherit` rather than being quietly restyled. */
  font-family: var(--app-dialog-title-font, var(--type-headline-font));
  font-size: var(--app-dialog-title-size, var(--type-headline-size));
  font-weight: var(--type-headline-weight);
  line-height: var(--type-headline-line-height);
  color: var(--app-dialog-accent, var(--ui-text-primary-fg, var(--text)));
}

.app-dialog.is-paper .app-dialog-header :deep(h3) {
  /* Byte-for-byte the declaration all six settings dialogs carried before P2. */
  font-family: var(--app-dialog-title-font, var(--font-display, var(--font-serif, serif)));
  font-size: var(--app-dialog-title-size, 15px);
  font-weight: var(--font-weight-semibold, 600);
}

.app-dialog-header :deep(svg) {
  flex-shrink: 0;
}

.app-dialog-body {
  /* `flex` for a body that manages its own scrolling regions (the MCP import
     dialog's tab pane); `block` — the default — for ordinary form content. */
  display: var(--app-dialog-body-display, block);
  flex-direction: column;
  flex: 1 1 auto;
  padding: var(--app-dialog-body-padding, 20px 24px);
  max-height: var(--app-dialog-body-max-height, none);
  overflow: var(--app-dialog-body-overflow, hidden auto);
  min-width: 0;
  min-height: 0;
}

.app-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: var(--app-dialog-actions-justify, flex-end);
  gap: var(--app-dialog-actions-gap, 10px);
  flex-shrink: 0;
  padding: var(--app-dialog-actions-padding, 16px 24px);
}

.app-dialog.has-actions-divider .app-dialog-actions {
  border-top: 1px solid var(--app-dialog-divider, var(--ui-border-default-border, var(--border)));
}

.app-dialog.is-paper.has-actions-divider .app-dialog-actions {
  border-top: 1px solid var(
    --app-dialog-divider,
    color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 55%, transparent)
  );
}

.app-dialog-enter-active,
.app-dialog-leave-active {
  transition: opacity var(--duration-fast) var(--ease-default);
}

.app-dialog-enter-active .app-dialog,
.app-dialog-leave-active .app-dialog {
  transition: transform var(--duration-fast) var(--ease-default);
}

.app-dialog-enter-from,
.app-dialog-leave-to {
  opacity: 0;
}

.app-dialog-enter-from .app-dialog,
.app-dialog-leave-to .app-dialog {
  transform: scale(0.98);
}
</style>

<!--
  A second, NON-scoped block. Everything above is scoped to Dialog's own
  skeleton; this one publishes a class that callers put on THEIR buttons, so it
  must not carry a scope id.
-->
<style>
/*
 * The ledger footer button — shared, NOT scoped, and deliberately outside the
 * global `.btn` namespace.
 *
 * Why it exists: the paper dialogs each carried a scoped `.btn { background:
 * transparent; … }`, which collides with `styles/components.css`'s
 * `.btn.primary { background: <accent> }`. Both compute to (0,2,0) — a scoped
 * single class gains exactly one unit from its `[data-v-…]` attribute, which is
 * precisely what a second global class is worth — so the winner was decided by
 * stylesheet injection order. That order held by luck until P2 added components
 * and reshuffled it, and the tie flipped: the global solid `background` won
 * while the scoped `color` still won, i.e. accent text on an accent block.
 *
 * Raising specificity would only pick the other side of the same coin flip. The
 * fix is to stop sharing a name with the global button at all. `is-*` modifiers
 * (rather than `.primary` / `.danger`) keep the compound form out of every
 * global namespace too.
 *
 * Not in components.css on purpose: that file is the global surface whose
 * crowding caused this, and this recipe belongs to the Dialog system — it ships
 * exactly when Dialog does.
 */
.app-dialog-text-btn {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default);
}

.app-dialog-text-btn:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.app-dialog-text-btn.is-primary,
.app-dialog-text-btn.is-primary:hover:not(:disabled) {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.app-dialog-text-btn.is-danger,
.app-dialog-text-btn.is-danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--text-error));
  text-decoration-color: var(--ui-status-danger-fg, var(--text-error));
}

.app-dialog-text-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Carried over from the global `.btn:focus-visible` these buttons used to
   inherit — leaving the `.btn` namespace must not cost keyboard users the ring.
   (P4 replaces this body with the shared `.u-focus-ring` utility.) */
.app-dialog-text-btn:focus-visible {
  outline: none;
  /* Kept on one line: `shadow-literal-floating` reads line-by-line, and a
     wrapped value hides the `var(--…)` that proves this is not a literal. */
  box-shadow: 0 0 0 2px var(--ui-surface-app-bg, var(--bg-app)), 0 0 0 4px var(--ui-state-focus-ring, var(--ui-accent-primary-fg, var(--accent)));
}
</style>
