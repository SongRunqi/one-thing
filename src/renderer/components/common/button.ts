import type { ComputedRef, InjectionKey } from 'vue'

export type ButtonType = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
export type ButtonSize = 'small' | 'default' | 'large'
export type ButtonNativeType = 'button' | 'submit' | 'reset'

export interface ButtonGroupContext {
  type: ComputedRef<ButtonType | undefined>
  size: ComputedRef<ButtonSize | undefined>
  plain: ComputedRef<boolean>
  round: ComputedRef<boolean>
  dashed: ComputedRef<boolean>
  circle: ComputedRef<boolean>
  text: ComputedRef<boolean>
  disabled: ComputedRef<boolean>
  color: ComputedRef<string | undefined>
  textColor: ComputedRef<string | undefined>
}

export const buttonGroupContextKey = Symbol('ButtonGroupContext') as InjectionKey<ButtonGroupContext>
