/**
 * Skills Module
 *
 * Official Claude Code Skills support
 * Loads SKILL.md files from ~/.claude/skills/ and .claude/skills/
 */

export {
  loadAllSkills,
  createSkill,
  deleteSkill,
  readSkillFile,
  ensureSkillsDirectories,
  getUserSkillsPath,
  getProjectSkillsPath,
} from './loader.js'

// Prompt building utilities
export {
  buildSkillsAwarenessPrompt,
  buildSkillsDirectPrompt,
  formatSkillsList,
} from './prompt-builder.js'

// Re-export types from shared
export type {
  SkillDefinition,
  SkillFile,
  SkillSource,
  SkillSettings,
} from '../../shared/ipc.js'
