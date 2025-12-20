/**
 * Skill Registry
 *
 * Central registry for managing skills. Supports:
 * - Built-in skills (loaded automatically)
 * - User-defined skills (persisted to config)
 * - Skill execution with template expansion
 */

import type {
  SkillDefinition,
  RegisteredSkill,
  SkillHandler,
  SkillExecutionContext,
  SkillExecutionResult,
} from './types.js'
import { executePromptTemplate } from './types.js'

// Skill registry storage
const skillRegistry: Map<string, RegisteredSkill> = new Map()

// Track if registry has been initialized
let initialized = false

/**
 * Register a skill with its handler
 */
export function registerSkill(definition: SkillDefinition, handler?: SkillHandler): void {
  // Default handler based on skill type
  const skillHandler =
    handler ||
    (definition.type === 'prompt-template' ? (executePromptTemplate as SkillHandler) : undefined)

  if (!skillHandler) {
    console.warn(`[SkillRegistry] Skill "${definition.id}" requires a handler for type "${definition.type}"`)
    return
  }

  if (skillRegistry.has(definition.id)) {
    console.warn(`[SkillRegistry] Skill "${definition.id}" is already registered. Overwriting.`)
  }

  skillRegistry.set(definition.id, {
    definition,
    handler: skillHandler,
  })

  console.log(`[SkillRegistry] Registered skill: ${definition.id}`)
}

/**
 * Unregister a skill
 */
export function unregisterSkill(skillId: string): boolean {
  const removed = skillRegistry.delete(skillId)
  if (removed) {
    console.log(`[SkillRegistry] Unregistered skill: ${skillId}`)
  }
  return removed
}

/**
 * Get a registered skill by ID
 */
export function getSkill(skillId: string): RegisteredSkill | undefined {
  return skillRegistry.get(skillId)
}

/**
 * Get all registered skills
 */
export function getAllSkills(): SkillDefinition[] {
  return Array.from(skillRegistry.values()).map((s) => s.definition)
}

/**
 * Get enabled skills only
 */
export function getEnabledSkills(): SkillDefinition[] {
  return getAllSkills().filter((s) => s.enabled)
}

/**
 * Find skill by trigger pattern
 */
export function findSkillByTrigger(trigger: string): SkillDefinition | undefined {
  const normalizedTrigger = trigger.toLowerCase().trim()

  for (const skill of getAllSkills()) {
    if (!skill.enabled) continue
    for (const t of skill.triggers) {
      if (t.toLowerCase() === normalizedTrigger) {
        return skill
      }
    }
  }
  return undefined
}

/**
 * Find skills matching a partial trigger (for autocomplete)
 */
export function findSkillsByPartialTrigger(partialTrigger: string): SkillDefinition[] {
  const normalized = partialTrigger.toLowerCase().trim()
  const matches: SkillDefinition[] = []

  for (const skill of getAllSkills()) {
    if (!skill.enabled) continue
    for (const t of skill.triggers) {
      if (t.toLowerCase().startsWith(normalized)) {
        matches.push(skill)
        break // Don't add same skill multiple times
      }
    }
  }
  return matches
}

/**
 * Execute a skill by ID
 */
export async function executeSkill(
  skillId: string,
  context: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const registeredSkill = skillRegistry.get(skillId)

  if (!registeredSkill) {
    return {
      success: false,
      error: `Skill "${skillId}" not found`,
    }
  }

  if (!registeredSkill.definition.enabled) {
    return {
      success: false,
      error: `Skill "${skillId}" is disabled`,
    }
  }

  try {
    console.log(`[SkillRegistry] Executing skill: ${skillId}`)
    const result = await registeredSkill.handler(registeredSkill.definition.config, context)
    console.log(`[SkillRegistry] Skill "${skillId}" completed:`, result.success ? 'success' : 'failed')
    return result
  } catch (error: any) {
    console.error(`[SkillRegistry] Skill "${skillId}" execution error:`, error)
    return {
      success: false,
      error: error.message || 'Unknown error during skill execution',
    }
  }
}

/**
 * Initialize the registry with built-in skills
 */
export async function initializeSkillRegistry(): Promise<void> {
  if (initialized) {
    console.log('[SkillRegistry] Already initialized')
    return
  }

  console.log('[SkillRegistry] Initializing...')

  // Import and register built-in skills
  const { registerBuiltinSkills } = await import('./builtin/index.js')
  registerBuiltinSkills()

  // Load user-defined skills
  const { loadUserSkills } = await import('./loader.js')
  await loadUserSkills()

  initialized = true
  console.log(`[SkillRegistry] Initialized with ${skillRegistry.size} skills`)
}

/**
 * Check if registry is initialized
 */
export function isInitialized(): boolean {
  return initialized
}

/**
 * Get registry statistics
 */
export function getStats(): { total: number; enabled: number; builtin: number; user: number } {
  const skills = getAllSkills()
  return {
    total: skills.length,
    enabled: skills.filter((s) => s.enabled).length,
    builtin: skills.filter((s) => s.source === 'builtin').length,
    user: skills.filter((s) => s.source === 'user').length,
  }
}
