import { configureCoreBackgroundJobs } from '@onething/runtime/tools/background-jobs'
import { getToolOutputsDir } from '../../stores/paths.js'

let backgroundJobsConfigured = false

/** Explicit assembly step: point background-job logs at the tool outputs dir. */
export function configureAppBackgroundJobs(): void {
  if (backgroundJobsConfigured) return
  backgroundJobsConfigured = true
  configureCoreBackgroundJobs({ getLogRootDir: getToolOutputsDir })
}

export * from '@onething/runtime/tools/background-jobs'
