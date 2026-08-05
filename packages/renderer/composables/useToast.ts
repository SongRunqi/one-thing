/**
 * `useToast()` — transient notification service (docs/design/ui-system.md §1).
 *
 * The `.toast` skin already existed in `styles/components.css`; what was missing
 * was a host and a queue, so every page that wanted one re-declared a `v-if`
 * ribbon and its own timer. Everything here is module scope for the same reason
 * as `useConfirm`: a toast is routinely fired from a store action or a plain
 * `.ts` service, not only from `setup()`.
 */
import { ref, type Ref } from 'vue'
import { ensureUiOverlayHost } from '@/services/ui-overlay-host'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastOptions {
  /** ms on screen; 0 keeps it until dismissed. Defaults by type. */
  duration?: number
}

export interface ToastItem {
  id: number
  type: ToastType
  message: string
  duration: number
}

/** Oldest is dropped past this — a column of toasts is noise, not information. */
const MAX_VISIBLE = 4

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 2600,
  info: 3200,
  // Errors get longer: they usually carry something the user must read.
  error: 5000,
}

export const toasts: Ref<ToastItem[]> = ref([])

let nextId = 1

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter(item => item.id !== id)
}

export function clearToasts(): void {
  toasts.value = []
}

function show(type: ToastType, message: string, options?: ToastOptions): number {
  if (typeof document === 'undefined') return -1
  ensureUiOverlayHost()
  const id = nextId++
  const item: ToastItem = {
    id,
    type,
    message,
    duration: options?.duration ?? DEFAULT_DURATION[type],
  }
  const next = [...toasts.value, item]
  // Trim from the front: the newest message is the one the user is waiting for.
  toasts.value = next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
  return id
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show('success', message, options),
  error: (message: string, options?: ToastOptions) => show('error', message, options),
  info: (message: string, options?: ToastOptions) => show('info', message, options),
  dismiss: dismissToast,
  clear: clearToasts,
}

export function useToast(): typeof toast {
  return toast
}
