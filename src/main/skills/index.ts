/**
 * Skills Module
 *
 * Exports all skill-related functionality
 */

// Core registry functions
export {
  registerSkill,
  unregisterSkill,
  getSkill,
  getAllSkills,
  getEnabledSkills,
  findSkillByTrigger,
  findSkillsByPartialTrigger,
  executeSkill,
  initializeSkillRegistry,
  isInitialized,
  getStats,
} from './registry.js'

// User skills management
export {
  loadUserSkills,
  addUserSkill,
  updateUserSkill,
  deleteUserSkill,
  getUserSkills,
  getUserSkill,
  isUserSkill,
} from './loader.js'

// Types
export type {
  SkillDefinition,
  SkillExecutionContext,
  SkillExecutionResult,
  PromptTemplateConfig,
  WorkflowConfig,
  SkillHandler,
  RegisteredSkill,
} from './types.js'
