/**
 * Skills IPC Handlers
 *
 * Handles IPC communication for Hermes Agent SKILL.md operations
 */

import { openElectronPath } from '@onething/electron-host/shell/operations'
import {
  registerElectronSkillsIpcHandlers,
  type ElectronSkillDeleteRequest,
  type ElectronSkillOpenDirectoryRequest,
  type ElectronSkillReadFileRequest,
  type ElectronSkillToggleEnabledRequest,
  type ElectronSkillsGetAllRequest,
} from '@onething/electron-host/ipc/skills'
import {
  createOnethingSkillForIpc,
  deleteOnethingSkillForIpc,
  listOnethingSkillsForIpc,
  openOnethingSkillDirectoryForIpc,
  readOnethingSkillFileForIpc,
  refreshOnethingSkillsForIpc,
  type SkillSource,
  toggleOnethingSkillEnabledForIpc,
} from '@onething/runtime/skills'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SkillDefinition } from '../../shared/ipc.js'
import {
  createSkill,
  deleteSkill,
  readSkillFile,
  getUserSkillsPath,
} from '../skills/index.js'
import { getSettings, saveSettings } from '../stores/settings.js'
import {
  getAllSkillsForDisplay,
  getSkillsForSession as getRuntimeSkillsForSession,
  initializeSessionSkills,
  invalidateSessionSkillsCache,
} from '../skills/session-skills.js'

let skillsIpcInitialized = false

/**
 * Initialize the skill system
 */
export async function initializeSkills(): Promise<void> {
  if (skillsIpcInitialized) return
  await initializeSessionSkills()
  skillsIpcInitialized = true
  console.log('[Skills IPC] Initialized')
}

/**
 * Register all skill-related IPC handlers
 */
export function registerSkillHandlers() {
  registerElectronSkillsIpcHandlers({
    channels: {
      getAll: IPC_CHANNELS.SKILLS_GET_ALL,
      refresh: IPC_CHANNELS.SKILLS_REFRESH,
      readFile: IPC_CHANNELS.SKILLS_READ_FILE,
      openDirectory: IPC_CHANNELS.SKILLS_OPEN_DIRECTORY,
      create: IPC_CHANNELS.SKILLS_CREATE,
      delete: IPC_CHANNELS.SKILLS_DELETE,
      toggleEnabled: IPC_CHANNELS.SKILLS_TOGGLE_ENABLED,
    },
    getAll: async (request?: ElectronSkillsGetAllRequest) => {
      return listOnethingSkillsForIpc({
        workingDirectory: request?.workingDirectory,
        ensureInitialized: initializeSkills,
        listSkills: options => getAllSkillsForDisplay(options),
        logger: console,
      })
    },
    refresh: async () => {
      return refreshOnethingSkillsForIpc({
        invalidateSkillsCache,
        listSkills: options => getAllSkillsForDisplay(options),
        logger: console,
      })
    },
    readFile: async (request: ElectronSkillReadFileRequest) => {
      return readOnethingSkillFileForIpc({
        skillId: request.skillId,
        fileName: request.fileName,
        readSkillFile,
        logger: console,
      })
    },
    openDirectory: async (request?: ElectronSkillOpenDirectoryRequest) => {
      return openOnethingSkillDirectoryForIpc({
        skillId: request?.skillId,
        listSkills: options => getAllSkillsForDisplay(options),
        getUserSkillsPath,
        openPath: path => openElectronPath(path),
        logger: console,
      })
    },
    create: async (request: unknown) => {
      const typedRequest = request as {
        name: string
        description: string
        instructions: string
        source: SkillSource
      }
      return createOnethingSkillForIpc({
        name: typedRequest.name,
        description: typedRequest.description,
        instructions: typedRequest.instructions,
        source: typedRequest.source,
        createSkill,
        invalidateSkillsCache,
        logger: console,
      })
    },
    delete: async (request: ElectronSkillDeleteRequest) => {
      return deleteOnethingSkillForIpc({
        skillId: request.skillId,
        deleteSkill,
        invalidateSkillsCache,
        logger: console,
      })
    },
    toggleEnabled: async (request: ElectronSkillToggleEnabledRequest) => {
      return toggleOnethingSkillEnabledForIpc({
        skillId: request.skillId,
        enabled: request.enabled,
        getSettings,
        saveSettings,
        logger: console,
      })
    },
  })

  console.log('[Skills IPC] Handlers registered')
}

/**
 * Get all loaded skills (for use in chat context)
 * @deprecated Use getSkillsForSession for session-aware skill loading
 */
export function getLoadedSkills(): SkillDefinition[] {
  return getAllSkillsForDisplay({ enabledOnly: true })
}

/**
 * Invalidate skills cache for a specific workingDirectory or all caches
 */
export function invalidateSkillsCache(workingDirectory?: string): void {
  invalidateSessionSkillsCache(workingDirectory)
  console.log(workingDirectory
    ? `[Skills] Cache invalidated for: ${workingDirectory}`
    : '[Skills] All caches invalidated'
  )
}

/**
 * Get skills for a specific session, including project skills based on workingDirectory
 * Uses per-workingDirectory caching to avoid repeated filesystem traversal
 *
 * @param workingDirectory - Session's working directory for project skill discovery
 * @returns Array of enabled skills (user + project + plugin)
 */
export function getSkillsForSession(workingDirectory?: string): SkillDefinition[] {
  return getRuntimeSkillsForSession(workingDirectory)
}
