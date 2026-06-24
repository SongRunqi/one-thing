import type { JsonObjectProperty } from '../../../shared/json.js'

export type ToolEffectMetadataValue = JsonObjectProperty | object | object[]
export type ToolEffectMetadata = Record<string, ToolEffectMetadataValue>

export type ToolEffectKind =
  | 'read'
  | 'file_edit'
  | 'file_write'
  | 'file_destructive_edit'
  | 'bash'
  | 'mcp'
  | 'external_directory'
  | 'sensitive_file_read'

export interface ToolEffect {
  kind: ToolEffectKind
  resources: string[]
  barrier: boolean
  external?: boolean
  sensitive?: boolean
  metadata?: ToolEffectMetadata
}

export interface ToolPreview {
  title: string
  diff?: string
  path?: string
  additions?: number
  deletions?: number
  metadata?: ToolEffectMetadata
}

export function isBarrierEffect(effect: ToolEffect): boolean {
  return effect.barrier ||
    effect.kind === 'file_edit' ||
    effect.kind === 'file_write' ||
    effect.kind === 'file_destructive_edit' ||
    effect.kind === 'bash' ||
    effect.kind === 'mcp'
}
