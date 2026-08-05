/**
 * The mount point for the two service-driven overlays (`useConfirm`,
 * `useToast`).
 *
 * Why a self-mounted app instead of two tags in `App.vue`:
 *
 *  - `App.vue` is a switchboard of six mutually exclusive window modes
 *    (settings / image preview / search / todo / voice runtime / main), and the
 *    main branch only renders once `appReady` flips. A host inside it would be
 *    absent in whichever branch nobody remembered to edit, and absent during
 *    boot — exactly when a failure most wants to say something.
 *  - `notice()` / `toast.error()` are called from plain `.ts` (editor
 *    attachments, services). Those must not depend on a particular component
 *    tree having been rendered first.
 *  - Living outside the app tree also means no ancestor's scoped CSS or
 *    stacking context can reach the overlays. Both mount straight to `<body>`
 *    anyway (Dialog teleports), but the toast host would otherwise inherit
 *    whatever container it was declared in.
 *
 * It needs nothing from the main app instance — no Pinia, no provides — so the
 * second `createApp` costs one Vue root and buys unconditional availability.
 * Styling is unaffected: theme variables live on `<html>`.
 */
import { createApp, h, type App } from 'vue'
import ConfirmHost from '@/components/common/ConfirmHost.vue'
import ToastHost from '@/components/common/ToastHost.vue'

const HOST_ID = 'app-ui-overlay-host'

let hostApp: App<Element> | null = null

export function ensureUiOverlayHost(): void {
  if (hostApp || typeof document === 'undefined') return
  const existing = document.getElementById(HOST_ID)
  const container = existing ?? document.createElement('div')
  if (!existing) {
    container.id = HOST_ID
    document.body.appendChild(container)
  }
  hostApp = createApp({
    name: 'UiOverlayHost',
    render: () => [h(ConfirmHost), h(ToastHost)],
  })
  hostApp.mount(container)
}

/** Test/HMR teardown. */
export function destroyUiOverlayHost(): void {
  hostApp?.unmount()
  hostApp = null
  if (typeof document === 'undefined') return
  document.getElementById(HOST_ID)?.remove()
}
