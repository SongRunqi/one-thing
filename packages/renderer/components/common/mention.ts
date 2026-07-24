export type MentionOptionLike = string | Record<string, unknown>

export interface MentionOptionProps {
  value?: string
  label?: string
  disabled?: string
}

export interface MentionNormalizedOption {
  key: string
  value: string
  label: string
  disabled: boolean
  raw: MentionOptionLike
}

export type MentionFilterOption =
  | false
  | ((pattern: string, option: MentionNormalizedOption) => boolean)

export type MentionCheckIsWhole = (pattern: string, prefix: string) => boolean

export interface MentionTrigger {
  prefix: string
  pattern: string
  start: number
  end: number
}
