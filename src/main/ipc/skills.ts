/**
 * Skills IPC Handlers
 *
 * Handles IPC communication for skill-related operations
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SkillExecutionContext } from '../../shared/ipc.js'
import {
  getAllSkills,
  executeSkill,
  initializeSkillRegistry,
  isInitialized,
  addUserSkill,
  updateUserSkill,
  deleteUserSkill,
  isUserSkill,
} from '../skills/index.js'

/**
 * Register all skill-related IPC handlers
 */
export function registerSkillHandlers() {
  // Get all available skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_GET_ALL, async () => {
    try {
      // Ensure registry is initialized
      if (!isInitialized()) {
        await initializeSkillRegistry()
      }

      const skills = getAllSkills()
      return {
        success: true,
        skills,
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error getting skills:', error)
      return {
        success: false,
        error: error.message || 'Failed to get skills',
      }
    }
  })

  // Execute a skill
  ipcMain.handle(IPC_CHANNELS.SKILLS_EXECUTE, async (_event, request) => {
    try {
      const { skillId, context } = request
      const result = await executeSkill(skillId, context as SkillExecutionContext)
      return {
        success: result.success,
        result,
        error: result.error,
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error executing skill:', error)
      return {
        success: false,
        error: error.message || 'Failed to execute skill',
      }
    }
  })

  // Add a user skill
  ipcMain.handle(IPC_CHANNELS.SKILLS_ADD_USER, async (_event, request) => {
    try {
      const { skill } = request
      const newSkill = addUserSkill(skill)
      return {
        success: true,
        skill: newSkill,
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error adding user skill:', error)
      return {
        success: false,
        error: error.message || 'Failed to add skill',
      }
    }
  })

  // Update a user skill
  ipcMain.handle(IPC_CHANNELS.SKILLS_UPDATE_USER, async (_event, request) => {
    try {
      const { skillId, updates } = request

      // Check if it's a user skill
      if (!isUserSkill(skillId)) {
        return {
          success: false,
          error: 'Cannot update built-in skills',
        }
      }

      const updatedSkill = updateUserSkill(skillId, updates)
      if (!updatedSkill) {
        return {
          success: false,
          error: 'Skill not found',
        }
      }
      return {
        success: true,
        skill: updatedSkill,
      }
    } catch (error: any) {
      console.error('[Skills IPC] Error updating user skill:', error)
      return {
        success: false,
        error: error.message || 'Failed to update skill',
      }
    }
  })

  // Delete a user skill
  ipcMain.handle(IPC_CHANNELS.SKILLS_DELETE_USER, async (_event, request) => {
    try {
      const { skillId } = request

      // Check if it's a user skill
      if (!isUserSkill(skillId)) {
        return {
          success: false,
          error: 'Cannot delete built-in skills',
        }
      }

      const deleted = deleteUserSkill(skillId)
      if (!deleted) {
        return {
          success: false,
          error: 'Skill not found',
        }
      }
      return { success: true }
    } catch (error: any) {
      console.error('[Skills IPC] Error deleting user skill:', error)
      return {
        success: false,
        error: error.message || 'Failed to delete skill',
      }
    }
  })

  console.log('[Skills IPC] Handlers registered')
}

/**
 * Initialize the skill system
 */
export async function initializeSkills(): Promise<void> {
  if (!isInitialized()) {
    await initializeSkillRegistry()
  }
}
