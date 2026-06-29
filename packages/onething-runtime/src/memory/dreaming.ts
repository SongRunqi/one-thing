import {
  readTextFileAsync,
  statPath,
} from '@onething/core/storage'
import type {
  DreamingSource,
  MemoryWorkspace,
} from './types.js'
import type { MemoryDiagnosticsLogInput } from './diagnostics-logger.js'
import {
  previewLine,
  sha,
} from './workspace.js'
import {
  addHermesMemoryEntry,
  readHermesMemoryFile,
  removeHermesMemoryText,
  replaceHermesMemoryText,
} from './hermes-file-memory.js'
import { listMemoryIndexFiles } from './indexer.js'
import { buildGraphProfileSummary } from './canonical.js'
import {
  applyDreamingMemoryActions as coreApplyDreamingMemoryActions,
  buildSoulMemoryExistingMemorySummary as coreBuildSoulMemoryExistingMemorySummary,
  collectSoulMemoryDailyDreamingSourcesWithAdapters as coreCollectSoulMemoryDailyDreamingSourcesWithAdapters,
  runSoulMemoryDreamingSweep as coreRunSoulMemoryDreamingSweep,
  type CoreDreamingMemoryApplyResult,
  type CoreDreamingMemoryResult,
  type CoreSoulMemoryDreamingGenerateInput,
  type CoreSoulMemoryDreamingProviderRef,
  type CoreSoulMemoryDreamingRunResult,
  type CoreSoulMemoryDreamingRunSettings,
  type CoreSoulMemoryNextRunStatus,
  type CoreSoulMemoryStatusMutationPlan,
} from '../plugins/index.js'

export type DreamingMemoryResult = CoreDreamingMemoryResult
export type DreamingMemoryApplyResult = CoreDreamingMemoryApplyResult
export type DreamingRunResult = CoreSoulMemoryDreamingRunResult

export async function collectDailyDreamingSources(workspace: MemoryWorkspace): Promise<DreamingSource[]> {
  const files = await listMemoryIndexFiles(workspace)
  return coreCollectSoulMemoryDailyDreamingSourcesWithAdapters(files, {
    lookbackDays: workspace.settings.dreaming.lookbackDays,
    maxSourceFiles: workspace.settings.dreaming.maxSourceFiles,
    statFile: absolutePath => statPath(absolutePath),
    readFile: absolutePath => readTextFileAsync(absolutePath),
  }) as Promise<DreamingSource[]>
}

export async function collectDreamingSources(workspace: MemoryWorkspace): Promise<{ sources: DreamingSource[] }> {
  return { sources: await collectDailyDreamingSources(workspace) }
}

export async function buildDreamingExistingMemorySummary(workspace: MemoryWorkspace): Promise<string> {
  const graphSummary = buildGraphProfileSummary(workspace)
  const hermesMemory = await readHermesMemoryFile(workspace, 'memory').catch(() => null)
  return coreBuildSoulMemoryExistingMemorySummary({
    graphSummary,
    memoryContent: hermesMemory?.content,
  })
}

export async function applyDreamingMemoryActions(options: {
  workspace: MemoryWorkspace
  result: DreamingMemoryResult
  runAt: Date
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => void
  onIndexableWrite?: (target: { relativePath: string }) => void | Promise<void>
}): Promise<DreamingMemoryApplyResult> {
  const applyResult = await coreApplyDreamingMemoryActions({
    result: options.result,
    maxPromotions: options.workspace.settings.dreaming.maxPromotions,
    minScore: options.workspace.settings.dreaming.minScore,
    readExisting: () => readHermesMemoryFile(options.workspace, 'memory'),
    add: async content => {
      await addHermesMemoryEntry({
        workspace: options.workspace,
        target: 'memory',
        content,
      })
    },
    replace: (oldText, newText) => replaceHermesMemoryText({
      workspace: options.workspace,
      target: 'memory',
      oldText,
      newText,
      replaceAll: false,
    }),
    remove: text => removeHermesMemoryText({
      workspace: options.workspace,
      target: 'memory',
      text,
      removeAll: false,
    }),
  })

  const {
    applied,
    added,
    replaced,
    removed,
    skipped,
  } = applyResult
  if (applied > 0) {
    await options.onIndexableWrite?.({ relativePath: 'MEMORY.md' })
  }
  options.logDiagnostic?.({
    subsystem: 'dreaming',
    operation: 'memory-actions',
    stage: 'write',
    status: applied > 0 ? 'ok' : 'skipped',
    response: {
      relativePath: 'MEMORY.md',
      applied,
      added,
      replaced,
      removed,
      skipped,
      runAt: options.runAt.toISOString(),
    },
  })

  return {
    applied,
    block: applyResult.block,
    added,
    replaced,
    removed,
    skipped,
  }
}

export async function runMemoryDreamingSweep<TProvider>(options: {
  workspace: MemoryWorkspace
  reason: string
  force?: boolean
  now?: Date
  getNextRunAt: (
    dreaming: CoreSoulMemoryDreamingRunSettings,
    from: Date,
  ) => CoreSoulMemoryNextRunStatus | Promise<CoreSoulMemoryNextRunStatus>
  resolveProvider: () => CoreSoulMemoryDreamingProviderRef<TProvider> | Promise<CoreSoulMemoryDreamingProviderRef<TProvider>>
  generateDreaming: (input: CoreSoulMemoryDreamingGenerateInput<TProvider>) => string | Promise<string>
  applyStatusMutation: (plan: CoreSoulMemoryStatusMutationPlan) => void | Promise<void>
  logDiagnostic?: (event: MemoryDiagnosticsLogInput) => void
  onIndexableWrite?: (target: { relativePath: string }) => void | Promise<void>
  nowMs?: () => number
}): Promise<DreamingRunResult | null> {
  return coreRunSoulMemoryDreamingSweep<TProvider>({
    reason: options.reason,
    enabled: options.workspace.settings.enabled,
    dreaming: options.workspace.settings.dreaming,
    force: options.force,
    now: options.now,
    hash: sha,
    collectSources: async () => (await collectDreamingSources(options.workspace)).sources,
    getNextRunAt: options.getNextRunAt,
    getExistingMemory: () => buildDreamingExistingMemorySummary(options.workspace),
    resolveProvider: options.resolveProvider,
    generateDreaming: options.generateDreaming,
    applyMemoryActions: (result, runAt) => applyDreamingMemoryActions({
      workspace: options.workspace,
      result,
      runAt,
      logDiagnostic: options.logDiagnostic,
      onIndexableWrite: options.onIndexableWrite,
    }),
    applyStatusMutation: options.applyStatusMutation,
    logDiagnostic: options.logDiagnostic
      ? event => options.logDiagnostic?.(event as MemoryDiagnosticsLogInput)
      : undefined,
    nowMs: options.nowMs,
    preview: previewLine,
  })
}
