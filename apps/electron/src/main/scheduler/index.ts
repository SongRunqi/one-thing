import path from 'node:path'
import type { Scheduler } from '@onething/runtime/scheduler'
import {
  configureOnethingScheduler,
  getOnethingScheduler,
} from '@onething/runtime/scheduler'
import { getStorePath } from '../stores/paths.js'

configureOnethingScheduler({
  stateFilePath: () => path.join(getStorePath(), 'scheduler', 'state.json'),
  logger: console,
})

export {
  configureOnethingScheduler,
  getOnethingScheduler,
  Scheduler,
} from '@onething/runtime/scheduler'
export type {
  SchedulerOptions,
  SchedulerRunOptions,
  SchedulerRunReason,
  SchedulerRunRecord,
  SchedulerSchedule,
  SchedulerTaskContext,
  SchedulerTaskHandle,
  SchedulerTaskRegistration,
  SchedulerTaskSnapshot,
} from '@onething/runtime/scheduler'
export {
  cronRunKey,
  currentCronRunAt,
  isValidTimezone,
  nextCronRunAt,
  parseCronExpression,
} from '@onething/runtime/scheduler'

export function getScheduler(): Scheduler {
  return getOnethingScheduler()
}
