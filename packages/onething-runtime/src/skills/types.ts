export type SkillSource = 'user' | 'project' | 'plugin' | 'builtin'

export interface SkillConditions {
  fallbackForToolsets?: string[]
  requiresToolsets?: string[]
  fallbackForTools?: string[]
  requiresTools?: string[]
}

export interface SkillFile {
  name: string
  path: string
  type: 'markdown' | 'script' | 'template' | 'other'
}

export interface SkillDefinition {
  name: string
  description: string
  allowedTools?: string[]
  category?: string
  tags?: string[]
  relatedSkills?: string[]
  platforms?: string[]
  conditions?: SkillConditions
  disableModelInvocation?: boolean
  id: string
  source: SkillSource
  path: string
  directoryPath: string
  rootPath?: string
  relativePath?: string
  enabled: boolean
  instructions: string
  runtimeContext?: string
  files?: SkillFile[]
}

export interface SkillSettings {
  enableSkills: boolean
  creationNudgeInterval?: number
  skills: Record<string, { enabled: boolean }>
}

export interface PluginSkillInstructionContextInput {
  skillDir: string
  skillPath: string
  rootDir: string
}

export type PluginSkillInstructionContextProvider = (
  input: PluginSkillInstructionContextInput,
) => string | undefined

export interface PluginSkillRoot {
  pluginId: string
  path: string
  source?: SkillSource
  recursive?: boolean
  instructionContext?: PluginSkillInstructionContextProvider
}
