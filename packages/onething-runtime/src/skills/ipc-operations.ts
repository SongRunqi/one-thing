import type {
  SkillDefinition,
  SkillSettings,
  SkillSource,
} from './types.js'

type MaybePromise<T> = T | Promise<T>

export interface OnethingSkillsIpcLogger {
  error?: (...args: unknown[]) => void
}

export type OnethingSkillsIpcResult<TPayload extends object = {}> =
  | ({ success: true } & TPayload)
  | { success: false; error: string }

export interface OnethingSkillDirectoryOpener {
  (path: string): MaybePromise<string | void | null | undefined>
}

export interface OnethingSkillListOptions {
  workingDirectory?: string
  enabledOnly?: boolean
}

export interface ListOnethingSkillsForIpcOptions<TSkill extends SkillDefinition = SkillDefinition> {
  workingDirectory?: string
  ensureInitialized(): MaybePromise<void>
  listSkills(options: OnethingSkillListOptions): MaybePromise<TSkill[]>
  logger?: OnethingSkillsIpcLogger
}

export async function listOnethingSkillsForIpc<TSkill extends SkillDefinition>(
  options: ListOnethingSkillsForIpcOptions<TSkill>,
): Promise<OnethingSkillsIpcResult<{ skills: TSkill[] }>> {
  try {
    await options.ensureInitialized()
    return {
      success: true,
      skills: await options.listSkills({
        workingDirectory: options.workingDirectory,
        enabledOnly: false,
      }),
    }
  } catch (error) {
    return skillsIpcError(options.logger, 'getting skills', error, 'Failed to get skills')
  }
}

export interface RefreshOnethingSkillsForIpcOptions<TSkill extends SkillDefinition = SkillDefinition> {
  invalidateSkillsCache(): MaybePromise<void>
  listSkills(options: OnethingSkillListOptions): MaybePromise<TSkill[]>
  logger?: OnethingSkillsIpcLogger
}

export async function refreshOnethingSkillsForIpc<TSkill extends SkillDefinition>(
  options: RefreshOnethingSkillsForIpcOptions<TSkill>,
): Promise<OnethingSkillsIpcResult<{ skills: TSkill[] }>> {
  try {
    await options.invalidateSkillsCache()
    return {
      success: true,
      skills: await options.listSkills({ enabledOnly: false }),
    }
  } catch (error) {
    return skillsIpcError(options.logger, 'refreshing skills', error, 'Failed to refresh skills')
  }
}

export interface ReadOnethingSkillFileForIpcOptions {
  skillId: string
  fileName: string
  readSkillFile(skillId: string, fileName: string): MaybePromise<string | null>
  logger?: OnethingSkillsIpcLogger
}

export async function readOnethingSkillFileForIpc(
  options: ReadOnethingSkillFileForIpcOptions,
): Promise<OnethingSkillsIpcResult<{ content: string }>> {
  try {
    const content = await options.readSkillFile(options.skillId, options.fileName)
    if (content === null) {
      return { success: false, error: 'File not found or not readable' }
    }
    return { success: true, content }
  } catch (error) {
    return skillsIpcError(options.logger, 'reading skill file', error, 'Failed to read skill file')
  }
}

export interface OpenOnethingSkillDirectoryForIpcOptions<TSkill extends SkillDefinition = SkillDefinition> {
  skillId?: string
  listSkills(options: OnethingSkillListOptions): MaybePromise<TSkill[]>
  getUserSkillsPath(): string
  openPath: OnethingSkillDirectoryOpener
  logger?: OnethingSkillsIpcLogger
}

export async function openOnethingSkillDirectoryForIpc<TSkill extends SkillDefinition>(
  options: OpenOnethingSkillDirectoryForIpcOptions<TSkill>,
): Promise<OnethingSkillsIpcResult> {
  try {
    const skill = options.skillId
      ? (await options.listSkills({ enabledOnly: false })).find(item => item.id === options.skillId)
      : undefined
    const openResult = await options.openPath(skill?.directoryPath || options.getUserSkillsPath())
    if (typeof openResult === 'string' && openResult.trim().length > 0) {
      return { success: false, error: openResult }
    }
    return { success: true }
  } catch (error) {
    return skillsIpcError(options.logger, 'opening skill directory', error, 'Failed to open skill directory')
  }
}

export interface CreateOnethingSkillForIpcOptions<TSkill extends SkillDefinition = SkillDefinition> {
  name: string
  description: string
  instructions: string
  source: SkillSource
  createSkill(
    name: string,
    description: string,
    instructions: string,
    source: SkillSource,
  ): MaybePromise<TSkill>
  invalidateSkillsCache(): MaybePromise<void>
  logger?: OnethingSkillsIpcLogger
}

export async function createOnethingSkillForIpc<TSkill extends SkillDefinition>(
  options: CreateOnethingSkillForIpcOptions<TSkill>,
): Promise<OnethingSkillsIpcResult<{ skill: TSkill }>> {
  try {
    const skill = await options.createSkill(
      options.name,
      options.description,
      options.instructions,
      options.source,
    )
    await options.invalidateSkillsCache()
    return { success: true, skill }
  } catch (error) {
    return skillsIpcError(options.logger, 'creating skill', error, 'Failed to create skill')
  }
}

export interface DeleteOnethingSkillForIpcOptions {
  skillId: string
  deleteSkill(skillId: string): MaybePromise<boolean>
  invalidateSkillsCache(): MaybePromise<void>
  logger?: OnethingSkillsIpcLogger
}

export async function deleteOnethingSkillForIpc(
  options: DeleteOnethingSkillForIpcOptions,
): Promise<OnethingSkillsIpcResult> {
  try {
    const deleted = await options.deleteSkill(options.skillId)
    if (!deleted) return { success: false, error: 'Skill not found' }
    await options.invalidateSkillsCache()
    return { success: true }
  } catch (error) {
    return skillsIpcError(options.logger, 'deleting skill', error, 'Failed to delete skill')
  }
}

export interface ToggleOnethingSkillEnabledForIpcOptions<TSettings extends { skills?: SkillSettings } = { skills?: SkillSettings }> {
  skillId: string
  enabled: boolean
  getSettings(): MaybePromise<TSettings>
  saveSettings(settings: TSettings): MaybePromise<unknown>
  logger?: OnethingSkillsIpcLogger
}

export async function toggleOnethingSkillEnabledForIpc<TSettings extends { skills?: SkillSettings }>(
  options: ToggleOnethingSkillEnabledForIpcOptions<TSettings>,
): Promise<OnethingSkillsIpcResult> {
  try {
    const settings = await options.getSettings()
    if (!settings.skills) {
      settings.skills = { enableSkills: true, skills: {} }
    }
    if (!settings.skills.skills) {
      settings.skills.skills = {}
    }
    settings.skills.skills[options.skillId] = { enabled: options.enabled }
    await options.saveSettings(settings)
    return { success: true }
  } catch (error) {
    return skillsIpcError(options.logger, 'toggling skill', error, 'Failed to toggle skill')
  }
}

function skillsIpcError(
  logger: OnethingSkillsIpcLogger | undefined,
  label: string,
  error: unknown,
  fallback: string,
): { success: false; error: string } {
  logger?.error?.(`[Skills IPC] Error ${label}:`, error)
  return {
    success: false,
    error: error instanceof Error && error.message ? error.message : fallback,
  }
}
