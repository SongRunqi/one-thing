import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type {
  ChatMessage,
  SchedulerCreateTaskRequest,
  SchedulerRunDetailDTO,
  SchedulerRunStepDTO,
  SchedulerRunTimelineEntryDTO,
  SchedulerRunToolCallDTO,
  SchedulerSchedule,
  SchedulerTaskSnapshotDTO,
  SchedulerUpdateTaskRequest,
  SchedulerUserTaskDTO,
} from '../../shared/ipc.js'
import { DEFAULT_AGENT_ID, agentExists } from '../agents/index.js'
import { getEventBus } from '../events/index.js'
import { getStreamEngineSafe } from '../engine/index.js'
import * as store from '../store.js'
import { getScheduler } from './index.js'
import { isValidTimezone, parseCronExpression } from './cron.js'
import type { SchedulerTaskContext, SchedulerTaskHandle } from './types.js'
import { getSchedulerTasksPath } from '../stores/paths.js'
import { saveSchedulerRunDetail } from './run-history.js'

type SchedulerUserTasksFile = {
  version: 1
  tasks: SchedulerUserTaskDTO[]
}

const USER_TASK_TIMEOUT_MS = 30 * 60 * 1000
const userTaskHandles = new Map<string, SchedulerTaskHandle>()
let initialized = false

function nowMs(): number {
  return Date.now()
}

function readTasksFile(): SchedulerUserTasksFile {
  try {
    const filePath = getSchedulerTasksPath()
    if (!fs.existsSync(filePath)) return { version: 1, tasks: [] }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<SchedulerUserTasksFile>
    return {
      version: 1,
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks.map(normalizeStoredTask).filter((task): task is SchedulerUserTaskDTO => Boolean(task))
        : [],
    }
  } catch (error) {
    console.error('[SchedulerUserTasks] Failed to read tasks file:', error)
    return { version: 1, tasks: [] }
  }
}

function writeTasksFile(file: SchedulerUserTasksFile): void {
  const filePath = getSchedulerTasksPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify({ version: 1, tasks: file.tasks }, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

function normalizeStoredTask(raw: Partial<SchedulerUserTaskDTO>): SchedulerUserTaskDTO | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  const agentId = typeof raw.agentId === 'string' && raw.agentId.trim() ? raw.agentId.trim() : DEFAULT_AGENT_ID
  if (!id || !name || !prompt || !raw.schedule) return null
  try {
    return {
      id,
      name,
      prompt,
      agentId,
      enabled: raw.enabled !== false,
      schedule: normalizeSchedule(raw.schedule),
      ...(typeof raw.workingDirectory === 'string' && raw.workingDirectory.trim()
        ? { workingDirectory: raw.workingDirectory.trim() }
        : {}),
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : nowMs(),
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : nowMs(),
    }
  } catch {
    return null
  }
}

function normalizeSchedule(schedule: SchedulerSchedule): SchedulerSchedule {
  if (schedule.kind === 'cron') {
    const expr = schedule.expr.trim()
    parseCronExpression(expr)
    const timezone = schedule.timezone?.trim()
    if (timezone && !isValidTimezone(timezone)) throw new Error(`Invalid timezone: ${timezone}`)
    return {
      kind: 'cron',
      expr,
      ...(timezone ? { timezone } : {}),
    }
  }
  if (schedule.kind === 'interval') {
    const everyMs = Math.max(60_000, Math.floor(schedule.everyMs))
    return {
      kind: 'interval',
      everyMs,
      ...(typeof schedule.startDelayMs === 'number'
        ? { startDelayMs: Math.max(0, Math.floor(schedule.startDelayMs)) }
        : {}),
    }
  }
  return {
    kind: 'at',
    atMs: Math.max(0, Math.floor(schedule.atMs)),
  }
}

function validateTaskInput(input: SchedulerCreateTaskRequest | SchedulerUpdateTaskRequest, current?: SchedulerUserTaskDTO): SchedulerUserTaskDTO {
  const timestamp = nowMs()
  const id = current?.id || `user:${uuidv4()}`
  const name = (input.name ?? current?.name ?? '').trim()
  const prompt = (input.prompt ?? current?.prompt ?? '').trim()
  const agentId = (input.agentId ?? current?.agentId ?? DEFAULT_AGENT_ID).trim() || DEFAULT_AGENT_ID
  if (!name) throw new Error('Task name is required')
  if (!prompt) throw new Error('Task prompt is required')
  if (!agentExists(agentId)) throw new Error('Agent not found')
  const schedule = input.schedule ? normalizeSchedule(input.schedule) : current?.schedule
  if (!schedule) throw new Error('Task schedule is required')
  const workingDirectory = input.workingDirectory === null
    ? undefined
    : typeof input.workingDirectory === 'string'
      ? input.workingDirectory.trim() || undefined
      : current?.workingDirectory

  return {
    id,
    name,
    prompt,
    agentId,
    enabled: input.enabled ?? current?.enabled ?? true,
    schedule,
    ...(workingDirectory ? { workingDirectory } : {}),
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

function getUserTask(id: string): SchedulerUserTaskDTO | undefined {
  return readTasksFile().tasks.find(task => task.id === id)
}

function promptPreview(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim()
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized
}

function registerUserTask(task: SchedulerUserTaskDTO): SchedulerTaskSnapshotDTO | undefined {
  userTaskHandles.get(task.id)?.unregister()
  const handle = getScheduler().register({
    id: task.id,
    name: task.name,
    kind: 'agent',
    source: 'user',
    readonly: false,
    agentId: task.agentId,
    prompt: task.prompt,
    promptPreview: promptPreview(task.prompt),
    workingDirectory: task.workingDirectory,
    tags: ['agent', 'user'],
    enabled: () => getUserTask(task.id)?.enabled ?? false,
    schedule: () => getUserTask(task.id)?.schedule ?? null,
    timeoutMs: USER_TASK_TIMEOUT_MS,
    run: context => runAgentTask(task.id, context),
  })
  userTaskHandles.set(task.id, handle)
  return handle.getStatus() as SchedulerTaskSnapshotDTO | undefined
}

function unregisterUserTask(id: string): void {
  userTaskHandles.get(id)?.unregister()
  userTaskHandles.delete(id)
}

export function initializeUserSchedulerTasks(): void {
  if (initialized) return
  initialized = true
  for (const task of readTasksFile().tasks) {
    registerUserTask(task)
  }
}

export function isUserSchedulerTask(id: string): boolean {
  return id.startsWith('user:') || Boolean(getUserTask(id))
}

export function createUserSchedulerTask(input: SchedulerCreateTaskRequest): SchedulerTaskSnapshotDTO {
  const file = readTasksFile()
  const task = validateTaskInput(input)
  file.tasks.push(task)
  writeTasksFile(file)
  const snapshot = registerUserTask(task)
  if (!snapshot) throw new Error('Failed to register scheduled task')
  return snapshot
}

export function updateUserSchedulerTask(input: SchedulerUpdateTaskRequest): SchedulerTaskSnapshotDTO {
  const file = readTasksFile()
  const index = file.tasks.findIndex(task => task.id === input.id)
  if (index < 0) throw new Error('Scheduled task not found')
  const task = validateTaskInput(input, file.tasks[index])
  file.tasks[index] = task
  writeTasksFile(file)
  const snapshot = registerUserTask(task)
  if (!snapshot) throw new Error('Failed to register scheduled task')
  return snapshot
}

export function deleteUserSchedulerTask(id: string): void {
  const file = readTasksFile()
  const nextTasks = file.tasks.filter(task => task.id !== id)
  if (nextTasks.length === file.tasks.length) throw new Error('Scheduled task not found')
  writeTasksFile({ version: 1, tasks: nextTasks })
  unregisterUserTask(id)
}

export function setUserSchedulerTaskEnabled(id: string, enabled: boolean): SchedulerTaskSnapshotDTO {
  return updateUserSchedulerTask({ id, enabled })
}

function previewValue(value: unknown, maxLength = 500): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function timelineEntry(input: Omit<SchedulerRunTimelineEntryDTO, 'id' | 'timestamp'> & { timestamp?: number }): SchedulerRunTimelineEntryDTO {
  return {
    id: uuidv4(),
    timestamp: input.timestamp ?? nowMs(),
    type: input.type,
    title: input.title,
    ...(input.detail ? { detail: input.detail } : {}),
    ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    ...(input.stepId ? { stepId: input.stepId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}

function toRunStep(messageStep: NonNullable<ChatMessage['steps']>[number]): SchedulerRunStepDTO {
  const finishedAt = messageStep.toolCall?.endTime
  const startedAt = messageStep.toolCall?.startTime || messageStep.timestamp
  return {
    id: messageStep.id,
    title: messageStep.title,
    status: messageStep.status,
    timestamp: messageStep.timestamp,
    ...(typeof finishedAt === 'number' ? { finishedAt } : {}),
    ...(typeof finishedAt === 'number' ? { durationMs: Math.max(0, finishedAt - startedAt) } : {}),
    ...(messageStep.toolCallId ? { toolCallId: messageStep.toolCallId } : {}),
    ...(messageStep.result ? { resultPreview: previewValue(messageStep.result, 300) } : {}),
    ...(messageStep.error ? { error: messageStep.error } : {}),
  }
}

function toRunToolCall(toolCall: NonNullable<ChatMessage['toolCalls']>[number]): SchedulerRunToolCallDTO {
  return {
    id: toolCall.id,
    toolName: toolCall.toolName,
    status: toolCall.status,
    ...(typeof toolCall.startTime === 'number' ? { startedAt: toolCall.startTime } : {}),
    ...(typeof toolCall.endTime === 'number' ? { finishedAt: toolCall.endTime } : {}),
    ...(typeof toolCall.startTime === 'number' && typeof toolCall.endTime === 'number'
      ? { durationMs: Math.max(0, toolCall.endTime - toolCall.startTime) }
      : {}),
    argumentsPreview: previewValue(toolCall.arguments, 500),
    ...(toolCall.result !== undefined ? { resultPreview: previewValue(toolCall.result, 500) } : {}),
    ...(toolCall.error ? { error: toolCall.error } : {}),
  }
}

async function runAgentTask(taskId: string, context: SchedulerTaskContext): Promise<Record<string, unknown>> {
  const task = getUserTask(taskId)
  if (!task) throw new Error(`Scheduled task not found: ${taskId}`)

  const startedAt = nowMs()
  const detail: SchedulerRunDetailDTO = {
    runId: context.runId,
    taskId,
    reason: context.reason,
    scheduledFor: context.scheduledFor,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    ok: false,
    status: 'running',
    agentId: task.agentId,
    steps: [],
    toolCalls: [],
    timeline: [
      timelineEntry({
        type: 'run:start',
        title: 'Run started',
        detail: task.name,
        timestamp: startedAt,
      }),
    ],
  }

  const engine = getStreamEngineSafe()
  if (!engine?.hasBoundSender()) {
    detail.status = 'skipped'
    detail.ok = true
    detail.skipped = true
    detail.skippedReason = 'main-window-unavailable'
    detail.error = 'Scheduled task skipped because no app window is available to host the stream.'
    const result = finishRunDetail(detail)
    return {
      status: result.status,
      runId: result.runId,
      error: result.error,
      skippedReason: result.skippedReason,
    }
  }

  const eventBus = getEventBus()
  const previousSessionId = store.getCurrentSessionId()
  const sessionId = uuidv4()
  const session = store.createSession(sessionId, `Scheduled: ${task.name}`)
  store.updateSessionAgent(sessionId, task.agentId)
  if (task.workingDirectory) store.updateSessionWorkingDirectory(sessionId, task.workingDirectory)
  store.updateSessionArchived(sessionId, true, startedAt)
  if (previousSessionId && previousSessionId !== sessionId) store.setCurrentSessionId(previousSessionId)

  detail.sessionId = session.id
  detail.timeline?.push(timelineEntry({
    type: 'session:created',
    title: 'Execution session created',
    detail: session.id,
  }))

  let blocked = false
  let terminalError = ''
  let assistantMessageId = ''

  const terminal = new Promise<void>((resolve) => {
    const cleanupFns: Array<() => void> = []
    let resolved = false
    const startTimer = setTimeout(() => {
      getStreamEngineSafe()?.abort(sessionId)
      complete('Scheduled task did not start within 15 seconds.')
    }, 15_000)
    startTimer.unref?.()
    cleanupFns.push(() => clearTimeout(startTimer))
    const complete = (error?: string) => {
      if (resolved) return
      resolved = true
      terminalError = error || terminalError
      for (const cleanup of cleanupFns) cleanup()
      resolve()
    }

    cleanupFns.push(eventBus.onAny(sessionId, (envelope) => {
      const event = envelope.event
      if (event.type === 'stream:start') {
        clearTimeout(startTimer)
        assistantMessageId = event.assistantMessageId
        detail.assistantMessageId = assistantMessageId
        detail.timeline?.push(timelineEntry({
          type: 'stream:start',
          title: 'Agent stream started',
          detail: event.model,
          timestamp: envelope.timestamp,
        }))
        return
      }
      if (event.type === 'permission:request') {
        blocked = true
        detail.timeline?.push(timelineEntry({
          type: 'permission:blocked',
          title: 'Permission blocked',
          detail: event.title,
          timestamp: envelope.timestamp,
          toolCallId: event.toolCallId,
          metadata: { permissionType: event.permissionType, pattern: event.pattern },
        }))
        eventBus.emit(sessionId, {
          type: 'command:permission-respond',
          channel: 'scheduler',
          requestId: event.requestId,
          decision: 'reject',
          rejectReason: 'Scheduled tasks can only use tools that were already authorized.',
        }).catch(error => console.error('[SchedulerUserTasks] Failed to reject permission:', error))
        return
      }
      if (event.type === 'step:added') {
        detail.timeline?.push(timelineEntry({
          type: 'step:added',
          title: event.step.title,
          status: event.step.status,
          stepId: event.step.id,
          toolCallId: event.step.toolCallId,
          timestamp: envelope.timestamp,
        }))
        return
      }
      if (event.type === 'step:updated') {
        detail.timeline?.push(timelineEntry({
          type: 'step:updated',
          title: event.updates.title || event.stepId,
          status: event.updates.status,
          stepId: event.stepId,
          timestamp: envelope.timestamp,
        }))
        return
      }
      if (event.type === 'tool:call' || event.type === 'tool:result') {
        detail.timeline?.push(timelineEntry({
          type: event.type,
          title: event.toolCall.toolName,
          status: event.toolCall.status,
          toolCallId: event.toolCall.id,
          timestamp: envelope.timestamp,
          detail: event.toolCall.error,
        }))
        return
      }
      if (event.type === 'stream:complete') {
        detail.timeline?.push(timelineEntry({
          type: 'stream:complete',
          title: 'Agent stream completed',
          detail: event.data.error,
          timestamp: envelope.timestamp,
          metadata: event.data.usage ? { usage: event.data.usage } : undefined,
        }))
        complete(event.data.error)
        return
      }
      if (event.type === 'stream:error') {
        detail.timeline?.push(timelineEntry({
          type: 'stream:error',
          title: 'Agent stream failed',
          detail: event.data.error,
          timestamp: envelope.timestamp,
        }))
        complete(event.data.error)
        return
      }
      if (event.type === 'stream:aborted') {
        detail.timeline?.push(timelineEntry({
          type: 'stream:aborted',
          title: 'Agent stream aborted',
          detail: event.reason,
          timestamp: envelope.timestamp,
        }))
        complete(event.reason || 'Stream aborted')
      }
    }, 'SchedulerUserTaskRun'))

    const onAbort = () => {
      getStreamEngineSafe()?.abort(sessionId)
      complete('Scheduled task was cancelled.')
    }
    context.signal.addEventListener('abort', onAbort, { once: true })
    cleanupFns.push(() => context.signal.removeEventListener('abort', onAbort))

    eventBus.emit(sessionId, {
      type: 'command:send-message',
      channel: 'scheduler',
      content: task.prompt,
    }).catch(error => complete(error instanceof Error ? error.message : String(error)))
  })

  await terminal

  const finishedAt = nowMs()
  const finishedSession = store.getSession(sessionId)
  const assistant = assistantMessageId
    ? finishedSession?.messages.find(message => message.id === assistantMessageId)
    : finishedSession?.messages.filter(message => message.role === 'assistant').pop()
  const failedTool = assistant?.toolCalls?.find(toolCall => toolCall.status === 'failed' || toolCall.rejected)

  detail.finishedAt = finishedAt
  detail.durationMs = finishedAt - startedAt
  detail.assistantMessageId = assistant?.id || detail.assistantMessageId
  detail.steps = (assistant?.steps || []).map(toRunStep)
  detail.toolCalls = (assistant?.toolCalls || []).map(toRunToolCall)
  detail.resultPreview = assistant?.content ? previewValue(assistant.content, 1000) : undefined
  detail.error = terminalError || failedTool?.error || failedTool?.rejectionReason
  if (blocked && !detail.error) {
    detail.error = 'Scheduled task requested a tool permission that was not pre-authorized.'
  }
  detail.status = context.signal.aborted
    ? 'cancelled'
    : blocked
      ? 'blocked'
      : detail.error
        ? 'failed'
        : 'succeeded'
  detail.ok = detail.status === 'succeeded'
  detail.timeline?.push(timelineEntry({
    type: 'run:finish',
    title: `Run ${detail.status}`,
    detail: detail.error,
    timestamp: finishedAt,
    durationMs: detail.durationMs,
  }))

  const result = finishRunDetail(detail)
  if (!result.ok && result.error) throw new Error(result.error)
  return {
    status: result.status,
    sessionId: result.sessionId,
    runId: result.runId,
    resultPreview: result.resultPreview,
    error: result.error,
  }
}

function finishRunDetail(detail: SchedulerRunDetailDTO): SchedulerRunDetailDTO {
  const finishedAt = detail.finishedAt || nowMs()
  const next = {
    ...detail,
    finishedAt,
    durationMs: Math.max(0, finishedAt - detail.startedAt),
  }
  saveSchedulerRunDetail(next)
  return next
}

export function genericRunDetailFromRecord(record: {
  runId?: string
  taskId: string
  pluginId?: string
  reason: SchedulerRunDetailDTO['reason']
  scheduledFor: number
  startedAt: number
  finishedAt: number
  durationMs: number
  ok: boolean
  skipped?: boolean
  skippedReason?: string
  error?: string
  result?: unknown
}): SchedulerRunDetailDTO {
  const result = record.result as { report?: unknown; memory?: unknown; timeline?: SchedulerRunTimelineEntryDTO[] } | undefined
  const resultPreview = typeof result?.report === 'string'
    ? result.report
    : typeof result?.memory === 'string'
      ? result.memory
      : record.result === undefined
        ? undefined
        : previewValue(record.result, 1000)
  return {
    ...record,
    status: record.skipped
      ? 'skipped'
      : record.ok
        ? 'succeeded'
        : 'failed',
    resultPreview,
    timeline: Array.isArray(result?.timeline) && result.timeline.length > 0 ? result.timeline : [
      timelineEntry({
        type: 'run:finish',
        title: record.ok ? 'Run completed' : 'Run failed',
        detail: record.error || record.skippedReason,
        timestamp: record.finishedAt,
        durationMs: record.durationMs,
      }),
    ],
  }
}
