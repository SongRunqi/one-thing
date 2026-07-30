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
}
