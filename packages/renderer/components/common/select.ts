export type SelectPrimitiveValue = string | number | boolean | null | undefined
export type SelectObjectValue = Record<string, unknown>
export type SelectValue = SelectPrimitiveValue | SelectObjectValue
export type SelectModelValue = SelectValue | SelectValue[]
export type SelectSize = 'large' | 'default' | 'small'

export type SelectOptionLike = SelectPrimitiveValue | SelectObjectValue

export interface SelectOptionProps {
  value?: string
  label?: string
  disabled?: string
  options?: string
}

export interface SelectNormalizedOption {
  key: string
  value: SelectValue
  label: string
  disabled: boolean
  raw: SelectOptionLike
  created?: boolean
  groupLabel?: string
}

export type SelectFilterMethod = (
  query: string,
  option?: SelectNormalizedOption,
) => boolean

export type SelectRemoteMethod = (query: string) => void | Promise<void>
