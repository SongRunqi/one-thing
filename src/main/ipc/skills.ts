/**
 * Skills IPC Handlers
 *
 * Handles IPC communication for Claude Code Skills operations
 */

import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SkillDefinition, SkillSource } from '../../shared/ipc.js'
import {
  loadAllSkills,
  createSkill,
  deleteSkill,
  readSkillFile,
  ensureSkillsDirectories,
  getUserSkillsPath,
} from '../skills/index.js'
import { getSettings, saveSettings } from '../stores/settings.js'

// Cache of loaded skills
let skillsCache: SkillDefinition[] = []
let isInitialized = false

/**
 * Initialize the skill system
 */
export async function initializeSkills(): Promise<void> {
  if (isInitialized) return

  // Ensure skills directories exist
  ensureSkillsDirectories()

  // Load all skills
  skillsCache = loadAllSkills()

  // Apply enabled state from settings
  const settings = getSettings()
  if (settings.skills?.skills) {
    for (const skill of skillsCache) {
      const skillSettings = settings.skills.skills[skill.id]
      if (skillSettings !== undefined) {
        skill.enabled = skillSettings.enabled
      }
    }
  }

  isInitialized = true
  console.log('[Skills IPC] Initialized with', skillsCache.length, 'skills')
}

/**
 * Register all skill-related IPC handlers
 */
export function registerSkillHandlers() {
  // Get all available skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_GET_ALL, async () => {
    try {
      if (!isInitialized) {
        await initializeSkills()
      }

      return {
        success: true,
        skills: skillsCache,
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
      skillsCache = loadAllSkills()

      // Apply enabled state from settings
      const settings = getSettings()
      if (settings.skills?.skills) {
        for (const skill of skillsCache) {
          const skillSettings = settings.skills.skills[skill.id]
          if (skillSettings !== undefined) {
            skill.enabled = skillSettings.enabled
          }
        }
      }

      return {
        success: true,
        skills: skillsCache,
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
      const skill = skillsCache.find(s => s.id === skillId)

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

      const skill = createSkill(name, description, instructions, source as SkillSource)
      skillsCache.push(skill)

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
      const deleted = deleteSkill(skillId)

      if (deleted) {
        skillsCache = skillsCache.filter(s => s.id !== skillId)
      }

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

      // Update cache
      const skill = skillsCache.find(s => s.id === skillId)
      if (skill) {
        skill.enabled = enabled
      }

      // Update settings
      const settings = getSettings()
      if (!settings.skills) {
        settings.skills = { enableSkills: true, skills: {} }
      }
      if (!settings.skills.skills) {
        settings.skills.skills = {}
      }
      settings.skills.skills[skillId] = { enabled }
      await saveSettings(settings)

      return { success: true }
    } catch (error: any) {
      console.error('[Skills IPC] Error toggling skill:', error)
      return {
        success: false,
        error: error.message || 'Failed to toggle skill',
      }
    }
  })

  console.log('[Skills IPC] Handlers registered')
}

/**
 * Get all loaded skills (for use in chat context)
 * @deprecated Use getSkillsForSession for session-aware skill loading
 */
export function getLoadedSkills(): SkillDefinition[] {
  return skillsCache.filter(s => s.enabled)
}

/**
 * Get skills for a specific session, including project skills based on workingDirectory
 * This function dynamically loads project skills using upward traversal
 *
 * @param workingDirectory - Session's working directory for project skill discovery
 * @returns Array of enabled skills (user + project + plugin)
 */
export function getSkillsForSession(workingDirectory?: string): SkillDefinition[] {
  // Load skills with workingDirectory for upward traversal
  const allSkills = loadAllSkills(workingDirectory)

  // Apply enabled state from settings
  const settings = getSettings()
  if (settings.skills?.skills) {
    for (const skill of allSkills) {
      const skillSettings = settings.skills.skills[skill.id]
      if (skillSettings !== undefined) {
        skill.enabled = skillSettings.enabled
      }
    }
  }

  // Return only enabled skills
  return allSkills.filter(s => s.enabled)
}
