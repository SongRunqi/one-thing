import type { CommandDefinition } from './commands'
import type { SkillDefinition } from '@shared/ipc'

export type PaletteItemType = 'command' | 'skill' | 'action'

export interface PaletteItem {
  id: string
  type: PaletteItemType
  title: string
  description: string
  usage?: string
  keywords?: string[]
  command?: CommandDefinition
  skill?: SkillDefinition
}
