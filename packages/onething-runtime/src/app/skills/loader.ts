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

/**
 * Host injection points for packaged-app resource resolution. Defaults are
 * correct for dev and headless runs (not packaged, no resources dir); the
 * Electron host wires the real getters at startup. Late-bound thunks, so
 * wiring after this module's import-time configure call still takes effect.
 */
export interface SkillsEnvironmentHostPorts {
  isPackaged?: () => boolean
  getResourcesPath?: () => string | undefined
}

let envPorts: SkillsEnvironmentHostPorts = {}

export function configureSkillsEnvironmentHost(ports: SkillsEnvironmentHostPorts): void {
  envPorts = ports
}

let skillsLoaderConfigured = false

/** Explicit assembly step: wire the skills loader to app settings/paths. */
export function configureAppSkillsLoader(): void {
  if (skillsLoaderConfigured) return
  skillsLoaderConfigured = true
  configureOnethingSkillsLoaderRuntime({
    getStorePath,
    listPluginSkillRoots,
    listCustomSkillRoots: () => getSettings().skills?.customDirectories ?? [],
    isPackaged: () => envPorts.isPackaged?.() ?? false,
    getResourcesPath: () => envPorts.getResourcesPath?.(),
    getCwd: () => process.cwd(),
    isBuiltinSkillDirEnabled: dirName => {
      if (!musicSkillDirs.has(dirName)) return true
      return getMusicProvider(getSettings().music?.provider).prose.skillDirName === dirName
    },
  })
}

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
