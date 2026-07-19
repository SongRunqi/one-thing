export type SkillSource = 'user' | 'project' | 'plugin' | 'builtin' | 'custom'

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
  /** Agent this skill is scoped to; null/undefined means available to all agents */
  agentId?: string | null
  instructions: string
  runtimeContext?: string
  files?: SkillFile[]
}

/** A user-managed skills root scanned in addition to the app-owned roots */
export interface SkillDirectoryConfig {
  id: string
  path: string
  label?: string
  /** Bind every skill loaded from this root to one agent; null/undefined = all agents */
  agentId?: string | null
  enabled: boolean
}

export interface SkillSettings {
  enableSkills: boolean
  creationNudgeInterval?: number
  skills: Record<string, { enabled: boolean; agentId?: string | null }>
  customDirectories?: SkillDirectoryConfig[]
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
