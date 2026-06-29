import {
  readTextFileAsync,
  readTextFileIfExists,
  relativePath,
} from '@onething/core/storage'
import type { MemoryWorkspace } from './types.js'
import type { MemoryDiagnosticsLogInput } from './diagnostics-logger.js'
import {
  isIndexableMarkdownPath,
  previewLine,
  replaceFileAtomic,
  sha,
} from './workspace.js'
import { appendMemoryNote } from './append.js'
import {
  applyDailyNoteCaptureActionsWithAdapters as coreApplyDailyNoteCaptureActionsWithAdapters,
  buildSoulMemoryCaptureInputWithAdapters as coreBuildSoulMemoryCaptureInputWithAdapters,
  dailyNoteTimeHeading as coreDailyNoteTimeHeading,
  dedupeSoulMemoryDailyNoteBulletsWithAdapters as coreDedupeSoulMemoryDailyNoteBulletsWithAdapters,
  planSoulMemoryDailyNoteAppend as corePlanSoulMemoryDailyNoteAppend,
  runSoulMemoryCapture as coreRunSoulMemoryCapture,
  type CoreSoulMemoryCaptureGenerateInput,
  type CoreSoulMemoryCaptureInputContext,
  type CoreSoulMemoryCaptureProviderRef,
  type CoreSoulMemoryCaptureRunResult,
  type CoreSoulMemoryStatusMutationPlan,
  type CoreDailyNoteCaptureApplyResult,
  type CoreDailyNoteCaptureCandidate,
  type CoreSoulMemoryResolvedPath,
} from '../plugins/index.js'

export interface DailyNoteCaptureApplyResult extends CoreDailyNoteCaptureApplyResult {
  absolutePath: string
  relativePath: string
}

export async function buildMemoryCaptureInput(options: {
  workspace: MemoryWorkspace
  context: CoreSoulMemoryCaptureInputContext
  maxChars: number
}): Promise<string> {
  return coreBuildSoulMemoryCaptureInputWithAdapters({
    context: options.context,
    dailyRelativePath: relativePath(options.workspace.root, options.workspace.todayPath),
    readDailyContent: () => readTextFileAsync(options.workspace.todayPath),
    maxChars: options.maxChars,
  })
}

export async function runMemoryCapture<TProvider>(options: {
  workspace: MemoryWorkspace
  sessionId: string
  assistantMessageId: string
  context: CoreSoulMemoryCaptureInputContext
  resolveProvider: () => CoreSoulMemoryCaptureProviderRef<TProvider> | Promise<CoreSoulMemoryCaptureProviderRef<TProvider>>
  generateCapture: (input: CoreSoulMemoryCaptureGenerateInput<TProvider>) => string | Promise<string>
  applyStatusMutation: (plan: CoreSoulMemoryStatusMutationPlan) => void | Promise<void>
  notify?: (message: string, level?: 'info' | 'warn' | 'error') => void | Promise<void>
  logDiagnostic?: (event: MemoryDiagnosticsLogInput) => void
  onIndexableWrite?: (target: CoreSoulMemoryResolvedPath) => void | Promise<void>
  now?: () => number
}): Promise<CoreSoulMemoryCaptureRunResult> {
  return coreRunSoulMemoryCapture<TProvider>({
    sessionId: options.sessionId,
    assistantMessageId: options.assistantMessageId,
    context: options.context,
    enabled: options.workspace.settings.enabled,
    capture: options.workspace.settings.capture,
    dailyRelativePath: relativePath(options.workspace.root, options.workspace.todayPath),
    readDailyContent: () => readTextFileIfExists(options.workspace.todayPath),
    hash: sha,
    resolveProvider: options.resolveProvider,
    generateCapture: options.generateCapture,
    applyDailyActions: candidates => applyDailyNoteCaptureActions({
      workspace: options.workspace,
      candidates,
      heading: coreDailyNoteTimeHeading(),
      logDiagnostic: options.logDiagnostic,
      onIndexableWrite: options.onIndexableWrite,
    }),
    applyStatusMutation: options.applyStatusMutation,
    notify: options.notify,
    logDiagnostic: options.logDiagnostic
      ? event => options.logDiagnostic?.(event as MemoryDiagnosticsLogInput)
      : undefined,
    now: options.now,
    preview: previewLine,
  })
}

export async function appendDailyNoteCaptureBullets(options: {
  workspace: MemoryWorkspace
  bullets: string[]
  heading?: string
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => void
  onIndexableWrite?: (target: CoreSoulMemoryResolvedPath) => void | Promise<void>
}): Promise<CoreSoulMemoryResolvedPath | null> {
  const plan = corePlanSoulMemoryDailyNoteAppend({
    bullets: options.bullets,
    heading: options.heading,
  })
  if (!plan) return null

  return appendMemoryNote({
    workspace: options.workspace,
    target: 'daily',
    heading: plan.heading,
    content: plan.content,
    logDiagnostic: options.logDiagnostic,
    onIndexableWrite: options.onIndexableWrite,
  })
}

export async function dedupeDailyNoteCaptureBullets(options: {
  workspace: MemoryWorkspace
  bullets: string[]
}): Promise<string[]> {
  return coreDedupeSoulMemoryDailyNoteBulletsWithAdapters({
    bullets: options.bullets,
    readMemoryContent: () => readTextFileAsync(options.workspace.memoryPath),
    readDailyContent: () => readTextFileAsync(options.workspace.todayPath),
  })
}

export async function applyDailyNoteCaptureActions(options: {
  workspace: MemoryWorkspace
  candidates: CoreDailyNoteCaptureCandidate[]
  heading?: string
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => void
  onIndexableWrite?: (target: CoreSoulMemoryResolvedPath) => void | Promise<void>
}): Promise<DailyNoteCaptureApplyResult | null> {
  const dailyRelativePath = relativePath(options.workspace.root, options.workspace.todayPath)
  let wroteDailyContent = false

  const applyResult = await coreApplyDailyNoteCaptureActionsWithAdapters({
    candidates: options.candidates,
    readDailyContent: () => readTextFileAsync(options.workspace.todayPath),
    readMemoryContent: () => readTextFileAsync(options.workspace.memoryPath),
    writeDailyContent: async content => {
      await replaceFileAtomic(options.workspace.todayPath, content)
      wroteDailyContent = true
    },
    appendBullets: async bullets => Boolean(await appendDailyNoteCaptureBullets({
      workspace: options.workspace,
      bullets,
      heading: options.heading || coreDailyNoteTimeHeading(),
      logDiagnostic: options.logDiagnostic,
      onIndexableWrite: options.onIndexableWrite,
    })),
  })
  if (!applyResult) return null

  const {
    applied,
    skipped,
    added,
    replaced,
    removed,
  } = applyResult
  options.logDiagnostic?.({
    subsystem: 'capture',
    operation: 'daily-note-actions',
    stage: 'write',
    status: 'ok',
    response: {
      relativePath: dailyRelativePath,
      added,
      replaced,
      removed,
      skipped,
    },
  })

  if (wroteDailyContent && isIndexableMarkdownPath(dailyRelativePath)) {
    await options.onIndexableWrite?.({
      absolutePath: options.workspace.todayPath,
      relativePath: dailyRelativePath,
    })
  }

  return {
    absolutePath: options.workspace.todayPath,
    relativePath: dailyRelativePath,
    applied,
    skipped,
    added,
    replaced,
    removed,
  }
}
