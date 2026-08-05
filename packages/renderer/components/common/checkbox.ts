/**
 * Same value grammar as `switch.ts` (`SwitchValue`): a checkbox is a two-state
 * control, and the pair it toggles between is not always `true`/`false` — some
 * settings store `'on'`/`'off'` or `1`/`0`. Deliberately NOT `unknown`: an
 * object-typed prop forces `withDefaults` into factory defaults, and Vue only
 * calls those for props whose runtime type it knows is Object.
 */
export type CheckboxValue = boolean | string | number | null
export type CheckboxSize = 'default' | 'small'
