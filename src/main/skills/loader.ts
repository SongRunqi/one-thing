/**
 * User Skills Loader
 *
 * Handles loading and persisting user-defined skills
 */

import path from 'path'
import { getStorePath, readJsonFile, writeJsonFile } from '../stores/paths.js'
import { registerSkill, unregisterSkill } from './registry.js'
import type { SkillDefinition } from './types.js'

// Path for user skills storage
function getUserSkillsPath(): string {
  return path.join(getStorePath(), 'user-skills.json')
}

// In-memory cache of user skills
let userSkillsCache: SkillDefinition[] = []

/**
 * Load user-defined skills from config file
 */
export async function loadUserSkills(): Promise<void> {
  const skills = readJsonFile<SkillDefinition[]>(getUserSkillsPath(), [])
  userSkillsCache = skills

  for (const skill of skills) {
    // Ensure source is set to 'user'
    skill.source = 'user'
    registerSkill(skill)
  }

  console.log(`[UserSkills] Loaded ${skills.length} user skills`)
}

/**
 * Save user skills to config file
 */
function saveUserSkills(): void {
  writeJsonFile(getUserSkillsPath(), userSkillsCache)
}

/**
 * Add a new user skill
 */
export function addUserSkill(skill: Omit<SkillDefinition, 'source'>): SkillDefinition {
  const newSkill: SkillDefinition = {
    ...skill,
    source: 'user',
  }

  // Check if ID already exists
  const existingIndex = userSkillsCache.findIndex((s) => s.id === newSkill.id)
  if (existingIndex !== -1) {
    throw new Error(`Skill with ID "${newSkill.id}" already exists`)
  }

  userSkillsCache.push(newSkill)
  saveUserSkills()
  registerSkill(newSkill)

  console.log(`[UserSkills] Added skill: ${newSkill.id}`)
  return newSkill
}

/**
 * Update an existing user skill
 */
export function updateUserSkill(
  skillId: string,
  updates: Partial<SkillDefinition>
): SkillDefinition | null {
  const index = userSkillsCache.findIndex((s) => s.id === skillId)
  if (index === -1) return null

  const existingSkill = userSkillsCache[index]
  const updatedSkill: SkillDefinition = {
    ...existingSkill,
    ...updates,
    id: skillId, // Ensure ID doesn't change
    source: 'user', // Ensure source doesn't change
  }

  userSkillsCache[index] = updatedSkill
  saveUserSkills()

  // Re-register with updated definition
  unregisterSkill(skillId)
  registerSkill(updatedSkill)

  console.log(`[UserSkills] Updated skill: ${skillId}`)
  return updatedSkill
}

/**
 * Delete a user skill
 */
export function deleteUserSkill(skillId: string): boolean {
  const index = userSkillsCache.findIndex((s) => s.id === skillId)
  if (index === -1) return false

  userSkillsCache.splice(index, 1)
  saveUserSkills()
  unregisterSkill(skillId)

  console.log(`[UserSkills] Deleted skill: ${skillId}`)
  return true
}

/**
 * Get all user skills
 */
export function getUserSkills(): SkillDefinition[] {
  return [...userSkillsCache]
}

/**
 * Get a user skill by ID
 */
export function getUserSkill(skillId: string): SkillDefinition | undefined {
  return userSkillsCache.find((s) => s.id === skillId)
}

/**
 * Check if a skill ID belongs to a user skill
 */
export function isUserSkill(skillId: string): boolean {
  return userSkillsCache.some((s) => s.id === skillId)
}
