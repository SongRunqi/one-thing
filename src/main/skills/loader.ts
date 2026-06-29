import {
  getElectronAppIsPackaged,
  getElectronResourcesPath,
} from '@onething/electron-host/skills/environment'
import {
  configureOnethingSkillsLoaderRuntime,
} from '@onething/runtime/skills'
import {
  listPluginSkillRoots,
} from './plugin-roots.js'
import {
  getStorePath,
} from '../stores/paths.js'

configureOnethingSkillsLoaderRuntime({
  getStorePath,
  listPluginSkillRoots,
  isPackaged: getElectronAppIsPackaged,
  getResourcesPath: getElectronResourcesPath,
  getCwd: () => process.cwd(),
})

export {
  configureOnethingSkillsLoaderRuntime,
  createSkill,
  deleteSkill,
  ensureSkillsDirectories,
  findProjectSkillPaths,
  getBuiltinSkillsPath,
  getEnvSkillsPath,
  getExternalSkillsPaths,
  getHermesConfigPath,
  getHermesHome,
  getProjectSkillsPath,
  getUserSkillsPath,
  loadAllSkills,
  loadProjectSkillsForDirectory,
  readSkillFile,
} from '@onething/runtime/skills'
export type {
  OnethingSkillsLoaderAdapters,
} from '@onething/runtime/skills'
