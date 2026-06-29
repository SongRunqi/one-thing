import { configureCoreBackgroundJobs } from '@onething/runtime/tools/background-jobs'
import { getToolOutputsDir } from '../../stores/paths.js'

configureCoreBackgroundJobs({ getLogRootDir: getToolOutputsDir })

export * from '@onething/runtime/tools/bash-executor'
