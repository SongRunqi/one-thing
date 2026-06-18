import type { HTMLAttributes } from 'vue'

export type InputNumberModelValue = number | null | undefined
export type InputNumberSize = 'large' | 'default' | 'small'
export type InputNumberControlsPosition = '' | 'right'
export type InputNumberValueOnClear = 'min' | 'max' | number | null
export type InputNumberAlign = 'left' | 'center' | 'right'
export type InputNumberInputMode = HTMLAttributes['inputmode']
export type InputNumberFormatter = (value: string) => string
export type InputNumberParser = (value: string) => string
export type InputNumberStepValues = number[]
