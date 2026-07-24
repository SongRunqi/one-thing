import type { StyleValue } from 'vue'

export type SliderModelValue = number | [number, number]
export type SliderSize = 'large' | 'default' | 'small'
export type SliderPlacement = 'top' | 'bottom' | 'left' | 'right'
export type SliderStep = number | 'mark'
export type SliderMarkLabel = string | number

export interface SliderMark {
  label?: SliderMarkLabel
  style?: StyleValue
}

export type SliderMarks = Record<number, SliderMarkLabel | SliderMark>
export type SliderFormatTooltip = (value: number) => string | number
export type SliderFormatValueText = (value: number, index: number) => string
