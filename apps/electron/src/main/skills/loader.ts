import {
  getElectronAppIsPackaged,
  getElectronResourcesPath,
} from '@onething/electron-host/skills/environment'
import {
  configureOnethingSkillsLoaderRuntime,
} from '@onething/runtime/skills'
import {
  builtinMusicProviders,
  getMusicProvider,
} from '@onething/runtime/music'
import {
  listPluginSkillRoots,
} from './plugin-roots.js'
import {
  getStorePath,
} from '../stores/paths.js'
import {
  getSettings,
} from '../stores/settings.js'

/** Every provider's CLI skill dir; only the active provider's is exposed. */
const musicSkillDirs = new Set(
  builtinMusicProviders.map(provider => provider.prose.skillDirName),
)

configureOnethingSkillsLoaderRuntime({
  getStorePath,
  listPluginSkillRoots,
  listCustomSkillRoots: () => getSettings().skills?.customDirectories ?? [],
  isPackaged: getElectronAppIsPackaged,
  getResourcesPath: getElectronResourcesPath,
  getCwd: () => process.cwd(),
  isBuiltinSkillDirEnabled: dirName => {
    if (!musicSkillDirs.has(dirName)) return true
    return getMusicProvider(getSettings().music?.provider).prose.skillDirName === dirName
  },
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
