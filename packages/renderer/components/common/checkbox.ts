/**
 * Same value grammar as `switch.ts` (`SwitchValue`): a checkbox is a two-state
 * control, and the pair it toggles between is not always `true`/`false` — some
 * settings store `'on'`/`'off'` or `1`/`0`. Deliberately NOT `unknown`: an
 * object-typed prop forces `withDefaults` into factory defaults, and Vue only
 * calls those for props whose runtime type it knows is Object.
 */
export type CheckboxValue = boolean | string | number | null
export type CheckboxSize = 'default' | 'small'

/**
 * Two registers, picked by context — not by taste.
 *
 * - `rule` (default): the 画线 hanging rule. It reads as a control because a
 *   label sits next to it; the label is what says "there is something to decide
 *   here", the rule only says which way it was decided.
 * - `box`: a real bordered square that fills and ticks. For **label-less dense
 *   rows** — a table's selection column — where P3-B found the bare 7px rule
 *   reads as a divider or a stray hairline, not as "you can select this row".
 *   Sized to match the native `accent-color` square it replaces (15px), so the
 *   affordance survives the migration.
 */
export type CheckboxVariant = 'rule' | 'box'
