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

export interface InputAutosizeConfig {
  minRows?: number
  maxRows?: number
}

export type InputAutosize = boolean | InputAutosizeConfig
export type InputFormatter = (value: string) => string
export type InputParser = (value: string) => string
export type InputIcon = Component
export type InputStyle = StyleValue
