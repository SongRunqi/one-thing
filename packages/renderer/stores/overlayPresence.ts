/**
 * Overlay presence — which modal overlays currently float over the main window.
 * The embedded browser's WebContentsView is a native layer ABOVE all DOM, so a
 * modal that overlaps the workbench region would be hidden behind the web view.
 * Modals register here (one line each) and BrowserPanel hides the native view
 * while any is present. Transient popovers/tooltips deliberately do NOT register
 * — they're too high-frequency and rarely overlap the panel.
 * See docs/design/browser-v2.md §8.2.
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useOverlayPresenceStore = defineStore('overlayPresence', () => {
  const active = ref<Set<string>>(new Set())

  /** True while any registered modal overlay is open. */
  const present = computed(() => active.value.size > 0)

  function setOverlay(key: string, open: boolean): void {
    if (open === active.value.has(key)) return
    const next = new Set(active.value)
    if (open) next.add(key)
    else next.delete(key)
    active.value = next
  }

  return { present, setOverlay }
})
