import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { getToolOutputsDir } from '../../stores/paths.js'

export type BackgroundJobStatus = 'running' | 'exited' | 'killed' | 'unknown'

export interface BackgroundJob {
  id: string
  command: string
  cwd: string
  shellPid: number
  pgid: number
  childPids: number[]
  status: BackgroundJobStatus
  startedAt: number
  endedAt?: number
  logPath?: string
  ports?: number[]
}

const jobs = new Map<string, BackgroundJob>()
let nextId = 1

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf-8', timeout: 3000 })
  return result.status === 0 ? result.stdout : ''
}

function killProcessGroup(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!pid) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        detached: true,
        windowsHide: true,
      }).unref()
    } catch {
      // Ignore kill failures; process may already be gone.
    }
    return
  }
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // Process already exited.
    }
  }
}

export function getProcessGroupPids(pgid: number): number[] {
  if (!pgid || process.platform === 'win32') return []
  const output = run('ps', ['-o', 'pid=', '-g', String(pgid)])
  return output
    .split(/\r?\n/)
    .map(line => Number(line.trim()))
    .filter(pid => Number.isInteger(pid) && pid > 0)
}

export function getListeningPortsForPids(pids: number[]): number[] {
  if (pids.length === 0 || process.platform === 'win32') return []
  const ports = new Set<number>()
  for (const pid of pids) {
    const output = run('lsof', ['-Pan', '-p', String(pid), '-iTCP', '-sTCP:LISTEN'])
    for (const match of output.matchAll(/:(\d+)\s+\(LISTEN\)/g)) {
      ports.add(Number(match[1]))
    }
  }
  return [...ports].sort((a, b) => a - b)
}

export function createBackgroundLogPath(): string {
  const dir = path.join(getToolOutputsDir(), 'background-jobs')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `background-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`)
}

export function registerBackgroundJob(input: {
  command: string
  cwd: string
  shellPid: number
  pgid: number
  childPids?: number[]
  logPath?: string
}): BackgroundJob {
  const childPids = input.childPids ?? getProcessGroupPids(input.pgid).filter(pid => pid !== input.shellPid)
  const job: BackgroundJob = {
    id: `bg-${nextId++}`,
    command: input.command,
    cwd: input.cwd,
    shellPid: input.shellPid,
    pgid: input.pgid,
    childPids,
    status: childPids.length > 0 ? 'running' : 'unknown',
    startedAt: Date.now(),
    logPath: input.logPath,
    ports: getListeningPortsForPids(childPids),
  }
  jobs.set(job.id, job)
  return job
}

export function refreshBackgroundJob(id: string): BackgroundJob | undefined {
  const job = jobs.get(id)
  if (!job) return undefined
  if (job.status === 'killed') return job
  const pids = getProcessGroupPids(job.pgid).filter(pid => pid !== job.shellPid)
  job.childPids = pids
  job.ports = getListeningPortsForPids(pids)
  if (pids.length === 0 && job.status === 'running') {
    job.status = 'exited'
    job.endedAt = Date.now()
  } else if (pids.length > 0) {
    job.status = 'running'
  }
  return job
}

export function listBackgroundJobs(options: { includeInactive?: boolean } = {}): BackgroundJob[] {
  for (const id of jobs.keys()) refreshBackgroundJob(id)
  return [...jobs.values()]
    .filter(job => options.includeInactive || job.status === 'running')
    .map(job => ({ ...job, childPids: [...job.childPids], ports: [...(job.ports ?? [])] }))
}

export function stopBackgroundJob(id: string): boolean {
  const job = jobs.get(id)
  if (!job) return false
  killProcessGroup(job.pgid, 'SIGTERM')
  setTimeout(() => {
    const refreshed = refreshBackgroundJob(id)
    if (refreshed?.status === 'running') killProcessGroup(refreshed.pgid, 'SIGKILL')
  }, 1500).unref?.()
  job.status = 'killed'
  job.endedAt = Date.now()
  return true
}

export function clearBackgroundJobsForTests(): void {
  jobs.clear()
  nextId = 1
}
