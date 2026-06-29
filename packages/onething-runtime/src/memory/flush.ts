import type { MemoryWorkspace } from './types.js'
import type { MemoryDiagnosticsLogInput } from './diagnostics-logger.js'
import {
  previewLine,
  sha,
} from './workspace.js'
import {
  appendDailyNoteCaptureBullets,
  dedupeDailyNoteCaptureBullets,
} from './capture-actions.js'
import {
  CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT,
  dailyNoteTimeHeading as coreDailyNoteTimeHeading,
  formatSoulMemoryMessagesForFlush as coreFormatSoulMemoryMessagesForFlush,
  parseDailyNoteBullets as coreParseDailyNoteBullets,
  type CoreSoulMemoryFlushMessage,
} from '../plugins/index.js'

export interface MemoryFlushMessageLike {
  role: string
  content?: unknown
}

export interface MemoryFlushGenerateInput<TProvider> {
  provider: TProvider
  system: string
  prompt: string
  temperature: number
  maxTokens: number
}

export interface MemoryFlushProviderRef<TProvider> {
  provider: TProvider
  providerId: string
  model: string
  source: string
}

export type MemoryFlushResult =
  | { status: 'ok'; flushedAt: number; dailyItems: number; outputHash: string }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; error: string }

function asFlushMessages(messages: MemoryFlushMessageLike[]): CoreSoulMemoryFlushMessage[] {
  return messages.map(message => ({
    role: message.role,
    content: typeof message.content === 'string' ? message.content : String(message.content ?? ''),
  }))
}

async function withTimeout<T>(promise: Promise<T> | T, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Memory flush timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function runMemoryFlush<TProvider>(options: {
  workspace: MemoryWorkspace
  sessionId: string
  messagesToSummarize: MemoryFlushMessageLike[]
  resolveProvider: () => MemoryFlushProviderRef<TProvider> | Promise<MemoryFlushProviderRef<TProvider>>
  generateFlush: (input: MemoryFlushGenerateInput<TProvider>) => string | Promise<string>
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => void
  onIndexableWrite?: (target: { relativePath: string }) => void | Promise<void>
  nowMs?: () => number
  timeoutMs?: number
}): Promise<MemoryFlushResult> {
  const nowMs = options.nowMs ?? Date.now
  const startedAt = nowMs()
  const runId = sha(`flush:${options.sessionId}:${startedAt}`).slice(0, 16)
  const logDiagnostic = (input: Omit<MemoryDiagnosticsLogInput, 'subsystem'>): void => {
    options.logDiagnostic?.({
      subsystem: 'flush',
      ...input,
    })
  }

  if (!options.workspace.settings.enabled || !options.workspace.settings.memoryFlush.enabled) {
    logDiagnostic({
      operation: 'before-context-compact',
      stage: 'gate',
      status: 'skipped',
      sessionId: options.sessionId,
      runId,
      summary: 'Memory flush is disabled.',
    })
    return { status: 'skipped', reason: 'disabled' }
  }

  const formatted = coreFormatSoulMemoryMessagesForFlush(
    asFlushMessages(options.messagesToSummarize),
    options.workspace.settings.memoryFlush.maxInputChars,
  )
  if (!formatted.trim()) {
    logDiagnostic({
      operation: 'before-context-compact',
      stage: 'gate',
      status: 'skipped',
      sessionId: options.sessionId,
      runId,
      summary: 'No compactable messages for memory flush.',
    })
    return { status: 'skipped', reason: 'empty' }
  }

  try {
    const provider = await options.resolveProvider()
    logDiagnostic({
      operation: 'before-context-compact',
      stage: 'model-request',
      status: 'started',
      sessionId: options.sessionId,
      runId,
      request: {
        providerId: provider.providerId,
        model: provider.model,
        modelSource: provider.source,
        inputChars: formatted.length,
        messages: options.messagesToSummarize.length,
      },
    })
    const output = await withTimeout(options.generateFlush({
      provider: provider.provider,
      system: CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT,
      prompt: formatted,
      temperature: 0.1,
      maxTokens: 500,
    }), options.timeoutMs ?? 20000)
    const dailyBullets = await dedupeDailyNoteCaptureBullets({
      workspace: options.workspace,
      bullets: coreParseDailyNoteBullets(output),
    })
    if (dailyBullets.length === 0) {
      logDiagnostic({
        operation: 'before-context-compact',
        stage: 'model-response',
        status: 'skipped',
        durationMs: nowMs() - startedAt,
        sessionId: options.sessionId,
        runId,
        response: {
          bullets: 0,
          outputHash: sha(output).slice(0, 16),
          outputPreview: previewLine(output, 240),
        },
        summary: 'Flush model returned no daily-note-worthy bullets.',
      })
      return { status: 'skipped', reason: 'no-bullets' }
    }

    const daily = await appendDailyNoteCaptureBullets({
      workspace: options.workspace,
      bullets: dailyBullets,
      heading: coreDailyNoteTimeHeading(),
      logDiagnostic: options.logDiagnostic,
      onIndexableWrite: options.onIndexableWrite,
    })
    const flushedAt = nowMs()
    const outputHash = sha(output).slice(0, 16)
    logDiagnostic({
      operation: 'before-context-compact',
      stage: 'finish',
      status: 'ok',
      durationMs: flushedAt - startedAt,
      sessionId: options.sessionId,
      runId,
      response: {
        dailyItems: daily ? dailyBullets.length : 0,
        outputHash,
      },
    })
    return {
      status: 'ok',
      flushedAt,
      dailyItems: daily ? dailyBullets.length : 0,
      outputHash,
    }
  } catch (error: any) {
    const message = error?.message || String(error)
    logDiagnostic({
      operation: 'before-context-compact',
      stage: 'finish',
      status: 'error',
      durationMs: nowMs() - startedAt,
      sessionId: options.sessionId,
      runId,
      error,
    })
    return { status: 'error', error: message }
  }
}
