/**
 * `useConfirm()` — the replacement for the sixteen native `confirm()`/`alert()`
 * calls (docs/design/ui-system.md §4, rule `native-confirm`).
 *
 * Native dialogs are not merely ugly here: in Electron they block the renderer's
 * event loop, so a stream in flight stalls behind a modal the user has not
 * looked at yet, and they cannot be themed or driven by a test.
 *
 * Shape is promise-first — `if (await confirm({...}))` reads the same as the
 * `if (confirm(...))` it replaces, which is what keeps the migration honest
 * rather than a rewrite of each call site's control flow.
 *
 * The queue lives at module scope, not in a component: `notice()` has to be
 * callable from plain `.ts` (editor/markdown-attachments.ts does exactly that),
 * and a service that only works inside `setup()` would push those call sites
 * back to `window.alert`.
 */
import { ref, type Ref } from 'vue'
import { ensureUiOverlayHost } from '@/services/ui-overlay-host'

export interface ConfirmOptions {
  title?: string
  message?: string
  /** Destructive ask: red confirm button, danger accent. */
  danger?: boolean
  confirmText?: string
  cancelText?: string
  /** `paper` for the settings/ledger areas, `default` elsewhere. */
  variant?: 'default' | 'paper'
}

export interface NoticeOptions {
  title?: string
  message?: string
  /** Single-button label. */
  confirmText?: string
  danger?: boolean
  variant?: 'default' | 'paper'
}

export interface ConfirmRequest {
  id: number
  kind: 'confirm' | 'notice'
  options: ConfirmOptions & NoticeOptions
  resolve: (value: boolean) => void
}

/**
 * A stack, not a single slot: a confirm raised from inside another dialog is a
 * real shape here (delete-from-editor), and dropping the outer one would
 * resolve a promise nobody answered.
 */
export const confirmStack: Ref<ConfirmRequest[]> = ref([])

let nextId = 1

function push(kind: 'confirm' | 'notice', options: ConfirmOptions & NoticeOptions): Promise<boolean> {
  // No DOM (unit tests importing the module, SSR): resolve the way a browser
  // with dialogs disabled would — cancel for a confirm, acknowledged for a
  // notice — instead of hanging the caller on a promise that never settles.
  if (typeof document === 'undefined') return Promise.resolve(kind === 'notice')
  ensureUiOverlayHost()
  return new Promise<boolean>((resolve) => {
    confirmStack.value = [...confirmStack.value, { id: nextId++, kind, options, resolve }]
  })
}

/** Resolve and remove one request. Called by `ConfirmHost`. */
export function settleConfirm(id: number, value: boolean): void {
  const request = confirmStack.value.find(item => item.id === id)
  if (!request) return
  confirmStack.value = confirmStack.value.filter(item => item.id !== id)
  request.resolve(value)
}

/** `await confirm({...})` → true when the user accepted. */
export function confirm(options: ConfirmOptions | string): Promise<boolean> {
  return push('confirm', typeof options === 'string' ? { message: options } : options)
}

/** Single-button acknowledgement; resolves true once dismissed. */
export function notice(options: NoticeOptions | string): Promise<boolean> {
  return push('notice', typeof options === 'string' ? { message: options } : options)
}

export function useConfirm(): { confirm: typeof confirm; notice: typeof notice } {
  return { confirm, notice }
}
