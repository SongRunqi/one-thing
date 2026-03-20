/**
 * Skills IPC Handlers
 *
 * Thin IPC layer that delegates all business logic to skills-manager.
 */

import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SkillSource } from '../../shared/ipc.js'
import { readSkillFile, getUserSkillsPath } from '../skills/index.js'
import {
  ensureInitialized,
  getSkillsCache,
  refreshSkills,
  addSkillToCache,
  removeSkillFromCache,
  toggleSkillEnabled,
  findSkillById,
} from '../skills/skills-manager.js'

// Re-export for backward compatibility (used by handlers.ts)
export { initializeSkills, getSkillsForSession } from '../skills/skills-manager.js'

/**
 * Register all skill-related IPC handlers
 */
export function registerSkillHandlers() {
  // Get all available skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_GET_ALL, async () => {
    try {
      await ensureInitialized()

      return {
        success: true,
        skills: getSkillsCache(),
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error getting skills:', error)
      return {
        success: false,
        error: error.message || 'Failed to get skills',
      }
    }
  })

  // Refresh skills from filesystem
  ipcMain.handle(IPC_CHANNELS.SKILLS_REFRESH, async () => {
    try {
      const skills = refreshSkills()

      return {
        success: true,
        skills,
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error refreshing skills:', error)
      return {
        success: false,
        error: error.message || 'Failed to refresh skills',
      }
    }
  })

  // Read a file from a skill directory
  ipcMain.handle(IPC_CHANNELS.SKILLS_READ_FILE, async (_event, request) => {
    try {
      const { skillId, fileName } = request
      const content = readSkillFile(skillId, fileName)

      if (content === null) {
        return {
          success: false,
          error: 'File not found or not readable',
        }
      }

      return {
        success: true,
        content,
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error reading skill file:', error)
      return {
        success: false,
        error: error.message || 'Failed to read skill file',
      }
    }
  })

  // Open skill directory in file manager
  ipcMain.handle(IPC_CHANNELS.SKILLS_OPEN_DIRECTORY, async (_event, request) => {
    try {
      const { skillId } = request
      const skill = findSkillById(skillId)

      if (!skill) {
        // If no skill specified, open user skills directory
        await shell.openPath(getUserSkillsPath())
        return { success: true }
      }

      await shell.openPath(skill.directoryPath)
      return { success: true }
    } catch (error: any) {
      console.error('[Skills IPC] Error opening skill directory:', error)
      return {
        success: false,
        error: error.message || 'Failed to open skill directory',
      }
    }
  })

  // Create a new skill
  ipcMain.handle(IPC_CHANNELS.SKILLS_CREATE, async (_event, request) => {
    try {
      const { name, description, instructions, source } = request
      const skill = addSkillToCache(name, description, instructions, source as SkillSource)

      return {
        success: true,
        skill,
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error creating skill:', error)
      return {
        success: false,
        error: error.message || 'Failed to create skill',
      }
    }
  })

  // Delete a skill
  ipcMain.handle(IPC_CHANNELS.SKILLS_DELETE, async (_event, request) => {
    try {
      const { skillId } = request
      const deleted = removeSkillFromCache(skillId)

      return {
        success: deleted,
        error: deleted ? undefined : 'Skill not found',
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error deleting skill:', error)
      return {
        success: false,
        error: error.message || 'Failed to delete skill',
      }
    }
  })

  // Toggle skill enabled state
  ipcMain.handle(IPC_CHANNELS.SKILLS_TOGGLE_ENABLED, async (_event, request) => {
    try {
      const { skillId, enabled } = request
      await toggleSkillEnabled(skillId, enabled)

      return { success: true }
    } catch (error: any) {
      console.error('[Skills IPC] Error toggling skill:', error)
      return {
        success: false,
        error: error.message || 'Failed to toggle skill',
      }
    }
  })

}
