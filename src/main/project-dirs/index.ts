/**
 * Public entry for the project-dirs subsystem.
 *
 *   - bootstrapProjectDirs() : warms the store cache. Idempotent.
 *   - getProjectsStore()     : read/write access (re-exported)
 *   - buildProjectDirsPromptVars : prompt rendering helpers
 *   - ProjectDirsTool        : AI tool registration target
 *   - registerProjectDirsHandlers : IPC wiring
 *
 * The module owns its own storage (`~/.onething/project-dirs/`) and
 * has no dependency on the variables subsystem. Cross-module wiring
 * (workdir auto-touch) is implemented at the variables side via an
 * explicit import — see src/main/variables/gateways.ts.
 */

import { getProjectsStore } from './store/index.js'

let bootstrapped = false

export function bootstrapProjectDirs(): void {
  if (bootstrapped) return
  bootstrapped = true
  getProjectsStore().initialize()
  console.log('[project-dirs] subsystem bootstrapped')
}

export { getProjectsStore } from './store/index.js'
export { buildProjectDirsPromptVars } from './prompt.js'
export type {
  ProjectDirsPromptVars,
  ActiveProjectVars,
  KnownProjectsVars,
} from './prompt.js'
export { ProjectDirsTool } from './tool.js'
export { registerProjectDirsHandlers } from './ipc.js'
export type { Project, ProjectIndexEntry, ProjectId } from './types.js'
