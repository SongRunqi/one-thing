import type { Component } from 'vue'

export type SwitchValue = boolean | string | number
/** `mini` = the 32×18 compact rail the old global `.mini-toggle-switch` drew. */
export type SwitchSize = '' | 'mini' | 'small' | 'default' | 'large'
/**
 * `pill` = the filled rail + shadowed knob (chat/panels).
 * `ledger` = the settings-area ink toggle: dashed rule + hollow ring off, solid
 * accent rule + filled dot on. It is the look SettingsPage hand-draws today
 * through `:deep(.native-toggle input[type="checkbox"])`, lifted into the
 * component so the ~30 files that copy that markup have somewhere to land.
 */
export type SwitchVariant = 'pill' | 'ledger'
export type SwitchIcon = string | Component
export type SwitchBeforeChange = () => boolean | Promise<boolean>

