import type { Component, StyleValue } from 'vue'

export type InputModelValue = string | number | null | undefined
export type InputSize = 'large' | 'default' | 'small'
export type InputResize = 'none' | 'both' | 'horizontal' | 'vertical'
export type InputMode = 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'
export type InputNativeType =
  | 'text'
  | 'password'
  | 'search'
  | 'email'
  | 'url'
  | 'tel'
  | 'number'
  | 'date'

/**
 * The registers form controls are drawn in (mirrors Select's variant):
 *  - `box`    the rounded input surface (chat, panels) — the default.
 *  - `ledger` the settings-area drafting box: square hairline frame, no fill.
 *             Reproduces what `SettingsPage`'s `:deep(.form-input)` rules drew,
 *             so a migrated tab is visually unchanged.
 *  - `underline` the line IS the control (paper dialogs, room sheets): no
 *             frame, one hairline underneath that inks up on focus.
 */
export type InputVariant = 'box' | 'ledger' | 'underline'

export interface InputAutosizeConfig {
  minRows?: number
  maxRows?: number
}

export type InputAutosize = boolean | InputAutosizeConfig
export type InputFormatter = (value: string) => string
export type InputParser = (value: string) => string
export type InputIcon = Component
export type InputStyle = StyleValue
