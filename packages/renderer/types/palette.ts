import type { CommandDefinition } from './commands'
import type { SkillDefinition, UserPrompt } from '@shared/ipc'

export type PaletteItemType = 'command' | 'skill' | 'action' | 'prompt'

export interface PaletteItem {
  id: string
  type: PaletteItemType
  title: string
  description: string
  usage?: string
  keywords?: string[]
  command?: CommandDefinition
  skill?: SkillDefinition
  prompt?: UserPrompt
}
