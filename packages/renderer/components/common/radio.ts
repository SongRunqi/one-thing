import type { InjectionKey } from 'vue'

export type RadioValue = string | number | boolean
export type RadioSize = 'default' | 'small'

/**
 * `RadioGroup` is the repo's `*Group` convention (`ButtonGroup`,
 * `MenuItemGroup`, `CollapseGroup`, `Tabs`/`TabPane`): the group owns the value,
 * the name and the disabled flag; the children read them through provide /
 * inject and never mirror them into local state.
 *
 * A `Radio` outside a group still works standalone with its own `v-model` —
 * that is the native `name`-attribute dialect, and the two settings radios that
 * exist today use it. Group membership is therefore additive, never required.
 */
export interface RadioGroupContext {
  name: () => string
  value: () => unknown
  disabled: () => boolean
  size: () => RadioSize
  select: (value: unknown) => void
}

export const radioGroupKey: InjectionKey<RadioGroupContext> = Symbol('radio-group')
