import fs from 'node:fs'
import path from 'node:path'
import { getSchedulerRunsDir } from '../stores/paths.js'
import type { SchedulerRunDetailDTO } from '../../shared/ipc.js'

const MAX_RUN_HISTORY_PER_TASK = 200

function safeTaskFileName(taskId: string): string {
  return `${taskId.replace(/[^a-zA-Z0-9._-]/g, '_')}.jsonl`
}

function runHistoryPath(taskId: string): string {
  return path.join(getSchedulerRunsDir(), safeTaskFileName(taskId))
}

function readRuns(taskId: string): SchedulerRunDetailDTO[] {
  try {
    const filePath = runHistoryPath(taskId)
    if (!fs.existsSync(filePath)) return []
    return fs.readFileSync(filePath, 'utf-8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line) as SchedulerRunDetailDTO)
      .filter(run => run && typeof run.runId === 'string')
  } catch (error) {
    console.error('[SchedulerRuns] Failed to read run history:', error)
    return []
  }
}

function writeRuns(taskId: string, runs: SchedulerRunDetailDTO[]): void {
  const filePath = runHistoryPath(taskId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const payload = runs.map(run => JSON.stringify(run)).join('\n')
  fs.writeFileSync(filePath, payload ? `${payload}\n` : '', 'utf-8')
}

export function saveSchedulerRunDetail(detail: SchedulerRunDetailDTO): SchedulerRunDetailDTO {
  if (!detail.runId) throw new Error('Scheduler run id is required')
  const runs = readRuns(detail.taskId)
  const next = runs
    .filter(run => run.runId !== detail.runId)
    .concat(detail)
    .slice(-MAX_RUN_HISTORY_PER_TASK)
  writeRuns(detail.taskId, next)
  return detail
}

export function listSchedulerRunDetails(taskId: string, limit = 50): SchedulerRunDetailDTO[] {
  const safeLimit = Math.max(1, Math.min(MAX_RUN_HISTORY_PER_TASK, Math.floor(limit)))
  return readRuns(taskId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, safeLimit)
}

export function getSchedulerRunDetail(taskId: string, runId: string): SchedulerRunDetailDTO | undefined {
  return readRuns(taskId).find(run => run.runId === runId)
}
