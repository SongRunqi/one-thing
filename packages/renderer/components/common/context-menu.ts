import type { Component } from 'vue'

/** One row of a floating context menu (see ContextMenu.vue). */
export interface ContextMenuItem {
  /** Returned via the `select` event. */
  id: string
  label: string
  icon?: Component
  /** Renders in the danger tone (destructive action). */
  danger?: boolean
  disabled?: boolean
  /** Draws a hairline above this row — use it to group actions. */
  separatorBefore?: boolean
  /**
   * Nested rows (G3, 2026-08-11). A row that has them opens a SECOND floating
   * menu beside itself instead of emitting `select` — hover to open, and the
   * pointer is protected on the way over by the safe triangle
   * (`./safe-triangle.ts`). Only leaf rows emit `select`, so a `select` handler
   * never has to know how deep the row was.
   *
   * This is the floating form. `SubMenu.vue` is the *inline* collapsible group
   * (the sidebar's shape) and stays what it is — the two are different objects,
   * not two spellings of one.
   */
  children?: ContextMenuItem[]
}
