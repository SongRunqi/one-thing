import type { SkillDefinition } from '../../shared/ipc.js'
import { createOnethingSessionSkillsRuntime } from '@onething/runtime/skills'
import { getSettings } from '../stores/settings.js'
import {
  ensureSkillsDirectories,
  loadAllSkills,
  loadProjectSkillsForDirectory,
} from './index.js'

const sessionSkillsRuntime = createOnethingSessionSkillsRuntime<SkillDefinition>({
  ensureSkillsDirectories,
  loadAllSkills,
  loadProjectSkillsForDirectory,
  getSkillSettings: () => getSettings().skills,
  logger: console,
})

export async function initializeSessionSkills(): Promise<void> {
  await sessionSkillsRuntime.initialize()
}

export function getSkillsForSession(workingDirectory?: string): SkillDefinition[] {
  return sessionSkillsRuntime.getForSession(workingDirectory)
}

export function getAllSkillsForDisplay(options: {
  workingDirectory?: string
  enabledOnly?: boolean
} = {}): SkillDefinition[] {
  return sessionSkillsRuntime.getAll(options)
}

export function invalidateSessionSkillsCache(workingDirectory?: string): void {
  sessionSkillsRuntime.invalidateCache(workingDirectory)
}
