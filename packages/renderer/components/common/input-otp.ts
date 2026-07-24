import type { VNodeChild } from 'vue'

export type InputOtpModelValue = string | number | undefined
export type InputOtpType = 'outlined' | 'filled' | 'underlined'
export type InputOtpSize = 'large' | 'default' | 'small'
export type InputOtpInputMode = 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
export type InputOtpValidator = (value: string) => boolean
export type InputOtpSeparator = string | VNodeChild | ((index: number) => VNodeChild)
