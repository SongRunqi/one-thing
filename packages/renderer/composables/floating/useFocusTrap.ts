/**
 * Focus management shared by every layer that takes focus away from the page.
 *
 * Extracted from `useFloatingLayer()` in P2 rather than copied: Dialog needs the
 * exact same Tab arithmetic and the same "give it back when we close" rule, but
 * it is NOT an anchored layer — it centres itself and has no positioning kernel
 * to inherit from. Two copies of a focus trap is how the two drift apart.
 *
 * The pieces are deliberately plain functions over a container element, not a
 * component: `useFloatingLayer` binds its own `keydown` listener already and
 * only wants the arithmetic, while `useFocusTrap()` is the batteries-included
 * form for a standalone layer.
 */
import { onBeforeUnmount, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

/**
 * Tabbable candidates. `[tabindex="-1"]` is excluded on purpose: it is
 * programmatically focusable but must not be a Tab stop.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Visible tab stops inside `container`.
 *
 * `offsetParent === null` is the cheap "not rendered" test (it also catches
 * `display: none` ancestors, which `checkVisibility` support cannot be relied
 * on for in the Electron/jsdom split). The active element is kept regardless —
 * a focused element inside a `position: fixed` subtree reports a null
 * offsetParent and dropping it would strand the trap.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(node => node.offsetParent !== null || node === document.activeElement)
}

/**
 * Wrap Tab / Shift+Tab around inside `container`.
 *
 * Returns true when the event was handled (and `preventDefault`ed), so a caller
 * that has other Tab semantics can tell whether the trap already spoke.
 * With no focusable content at all, Tab is swallowed — letting it escape to the
 * page behind a modal is worse than a dead key.
 */
export function trapTabKey(container: HTMLElement, event: KeyboardEvent): boolean {
  const focusable = getFocusableElements(container)
  if (focusable.length === 0) {
    event.preventDefault()
    return true
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

export interface FocusReturn {
  /** Remember whoever has focus right now. */
  capture: () => void
  /** Hand focus back, if the remembered element is still in the document. */
  restore: () => void
  /** Forget without focusing (the layer closed because the page navigated). */
  clear: () => void
}

export function createFocusReturn(): FocusReturn {
  let target: HTMLElement | null = null
  return {
    capture() {
      target = document.activeElement as HTMLElement | null
    },
    restore() {
      // `isConnected`: the trigger row may have been unmounted while the layer
      // was open (delete-then-confirm is exactly that shape). Focusing a
      // detached node silently moves focus to <body> and loses the keyboard.
      if (target?.isConnected) target.focus()
      target = null
    },
    clear() {
      target = null
    },
  }
}

export interface UseFocusTrapOptions {
  /** The element to keep focus inside. */
  container: Ref<HTMLElement | null>
  /** Trap only while this is true. */
  active: MaybeRefOrGetter<boolean>
  /** Move focus into the container when it activates. Default true. */
  autoFocus?: MaybeRefOrGetter<boolean>
  /** Return focus to the pre-activation element on deactivate. Default true. */
  returnFocus?: MaybeRefOrGetter<boolean>
}

/**
 * Batteries-included trap for a standalone layer (Dialog).
 *
 * Binds one capture-phase `keydown` while active — capture, because a dialog
 * must win Tab before any component inside the page below gets a say.
 */
export function useFocusTrap(options: UseFocusTrapOptions): void {
  const focusReturn = createFocusReturn()
  let bound = false

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const el = options.container.value
    if (!el) return
    trapTabKey(el, event)
  }

  function bind() {
    if (bound) return
    window.addEventListener('keydown', onKeydown, true)
    bound = true
  }

  function unbind() {
    if (!bound) return
    window.removeEventListener('keydown', onKeydown, true)
    bound = false
  }

  function focusInside() {
    const el = options.container.value
    if (!el) return
    if (el.contains(document.activeElement)) return
    const focusable = getFocusableElements(el)
    // Falling back to the container itself needs it to be focusable; Dialog
    // sets `tabindex="-1"` on its panel for exactly this case (a body with no
    // controls at all, e.g. a plain message).
    ;(focusable[0] ?? el).focus()
  }

  watch(
    () => toValue(options.active),
    (isActive, wasActive) => {
      if (isActive) {
        focusReturn.capture()
        bind()
        // The panel is rendered in the same tick the flag flips; wait a frame
        // so the element exists before we go looking for something to focus.
        void Promise.resolve().then(() => {
          if (!toValue(options.active)) return
          if (toValue(options.autoFocus) !== false) focusInside()
        })
        return
      }
      unbind()
      // Only on a real deactivation — the immediate run with `active: false`
      // would otherwise steal focus at mount time.
      if (!wasActive) {
        focusReturn.clear()
        return
      }
      if (toValue(options.returnFocus) !== false) focusReturn.restore()
      else focusReturn.clear()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    unbind()
    // A layer can disappear by being unmounted rather than by flipping its flag
    // (ConfirmHost drops a resolved request out of its `v-for`). The deactivate
    // branch above never runs in that case, so focus is handed back here or not
    // at all — and "not at all" leaves the keyboard on <body>.
    if (toValue(options.active) && toValue(options.returnFocus) !== false) focusReturn.restore()
    else focusReturn.clear()
  })
}
