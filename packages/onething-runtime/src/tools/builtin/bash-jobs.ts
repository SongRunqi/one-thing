/**
 * Built-in Tools: BashOutput / KillBash
 *
 * Companions to bash's run_in_background: read incremental output from a
 * managed background job, or stop it. Jobs are registered in
 * background-jobs.ts (explicitly via run_in_background, or auto-detected
 * when a foreground command leaves processes behind with `&`).
 */

import { z } from 'zod'
import { Tool } from '../tool.js'
import {
  listBackgroundJobs,
  readBackgroundJobOutput,
  refreshBackgroundJob,
  stopBackgroundJob,
  type BackgroundJob,
} from '../background-jobs.js'

export interface BashJobMetadata {
  jobId: string
  command: string
  status: string
  output: string
  ports?: number[]
  logPath?: string
}

/**
 * Jobs are visible only to the session that started them (gateway users must
 * never see or control desktop jobs). Jobs without an owner (edge/legacy
 * registrations) stay visible everywhere.
 */
function jobVisibleToSession(job: BackgroundJob, sessionId: string | undefined): boolean {
  return job.sessionId === undefined || job.sessionId === sessionId
}

function describeKnownJobs(sessionId: string | undefined): string {
  const known = listBackgroundJobs({ includeInactive: true })
    .filter(job => jobVisibleToSession(job, sessionId))
    .map(job => `- ${job.id}: ${job.command} [${job.status}]`)
  return known.length > 0
    ? `Known background jobs:\n${known.join('\n')}`
    : 'No background jobs are registered.'
}

function jobStatusLine(job: BackgroundJob): string {
  const ports = job.ports?.length ? `, listening on port(s) ${job.ports.join(', ')}` : ''
  return `job: ${job.id} (${job.status}${ports})\ncommand: ${job.command}`
}

const BashOutputParameters = z.object({
  job_id: z
    .string()
    .min(1)
    .describe('Background job id returned by bash (e.g. "bg-1").'),
  from_start: z
    .boolean()
    .optional()
    .describe('Re-read the log from the beginning instead of only output since the last read.'),
})

export const BashOutputTool = Tool.define<typeof BashOutputParameters, BashJobMetadata>('bash_output', {
  name: 'BashOutput',
  description: `Read new output from a background bash job started with run_in_background. Each call returns only output produced since the last read (capped at the last 30KB), plus the job's current status and listening ports. Call it again to poll a starting service until it is ready.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'parallel',
  renderKind: 'bash',

  parameters: BashOutputParameters,

  async execute(args, ctx) {
    // Visibility check before reading: readBackgroundJobOutput advances the
    // incremental read cursor, so another session must not even peek.
    const existing = refreshBackgroundJob(args.job_id)
    if (!existing || !jobVisibleToSession(existing, ctx.sessionId)) {
      throw new Error(`Unknown background job "${args.job_id}". ${describeKnownJobs(ctx.sessionId)}`)
    }

    const read = readBackgroundJobOutput(args.job_id, { fromStart: args.from_start })
    if (!read) {
      throw new Error(`Unknown background job "${args.job_id}". ${describeKnownJobs(ctx.sessionId)}`)
    }

    const { job, output } = read
    const body = output.trim() ? output : '(no new output)'
    const finalOutput = `${body}\n\n<bash_metadata>\n${jobStatusLine(job)}\n</bash_metadata>`

    return {
      title: `${job.id}: ${job.command}`,
      output: finalOutput,
      metadata: {
        jobId: job.id,
        command: job.command,
        status: job.status,
        output: body,
        ports: job.ports,
        logPath: job.logPath,
      },
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid bash_output parameters:\n${issues.join('\n')}`
  },
})

const KillBashParameters = z.object({
  job_id: z
    .string()
    .min(1)
    .describe('Background job id to stop (e.g. "bg-1").'),
})

export const KillBashTool = Tool.define<typeof KillBashParameters, BashJobMetadata>('kill_bash', {
  name: 'KillBash',
  description: `Stop a background bash job started with run_in_background. Sends SIGTERM to the job's process group, escalating to SIGKILL after 1.5s if it does not exit.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'sequential',
  renderKind: 'text',

  parameters: KillBashParameters,

  async execute(args, ctx) {
    const job = refreshBackgroundJob(args.job_id)
    if (!job || !jobVisibleToSession(job, ctx.sessionId)) {
      throw new Error(`Unknown background job "${args.job_id}". ${describeKnownJobs(ctx.sessionId)}`)
    }

    if (job.status !== 'running') {
      const output = `Background job ${job.id} is already ${job.status}.`
      return {
        title: `${job.id} already ${job.status}`,
        output,
        metadata: {
          jobId: job.id,
          command: job.command,
          status: job.status,
          output,
          logPath: job.logPath,
        },
      }
    }

    stopBackgroundJob(args.job_id)
    const output = `Stopped background job ${job.id} (${job.command}).`
    return {
      title: `Stopped ${job.id}`,
      output,
      metadata: {
        jobId: job.id,
        command: job.command,
        status: 'killed',
        output,
        logPath: job.logPath,
      },
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid kill_bash parameters:\n${issues.join('\n')}`
  },
})
