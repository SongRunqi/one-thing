/**
 * Public entry for the project-dirs subsystem.
 *
 *   - bootstrapProjectDirs() : warms the store cache. Idempotent.
 *   - getProjectsStore()     : read/write access (re-exported)
 *   - buildProjectDirsPromptVars : prompt rendering helpers
 *   - ProjectDirsTool        : AI tool registration target
 *   - IPC wiring lives in ./ipc.js to keep this public module headless-safe
 *
 * The module owns its own storage (`~/.onething/project-dirs/`) and
 * has no dependency on the variables subsystem. Cross-module wiring
 * (workdir auto-touch) is implemented at the variables side via an
 * explicit import — see src/main/variables/gateways.ts.
 */

import { getProjectsStore } from '@onething/runtime/project-dirs/store'

let bootstrapped = false

export function bootstrapProjectDirs(): void {
  if (bootstrapped) return
  bootstrapped = true
  getProjectsStore().initialize()
  console.log('[project-dirs] subsystem bootstrapped')
}

export { getProjectsStore } from '@onething/runtime/project-dirs/store'
export { buildProjectDirsPromptVars } from '@onething/runtime/project-dirs/prompt'
export type {
  ProjectDirsPromptVars,
  ActiveProjectVars,
  KnownProjectsVars,
} from '@onething/runtime/project-dirs/prompt'
export { ProjectDirsTool } from './tool.js'
export type { Project, ProjectIndexEntry, ProjectId } from '@onething/runtime/project-dirs'
