import type { OpenRouterModel } from '@/types'

export interface ModelCapabilityBadge {
  key: string
  label: string
  icon: unknown
}

/**
 * One row's worth of already-resolved display state. The list component stays
 * dumb about capability/override rules so it can be windowed cheaply — every
 * derivation happens once in the parent, not per visible row per scroll frame.
 */
export interface ModelListEntry {
  model: OpenRouterModel
  selected: boolean
  isActive: boolean
  /** Hand-added: present in selectedModels but absent from the fetched catalog. */
  isCustom: boolean
  capabilities: ModelCapabilityBadge[]
  /** Effective context window after overrides; 0 when unknown. */
  contextLength: number
  contextOverridden: boolean
  /** Effective max output after overrides; 0 when unknown. */
  maxOutput: number
  outputOverridden: boolean
}
