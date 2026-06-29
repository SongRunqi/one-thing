import {
  CoreSoulMemoryActiveMemoryRuntime,
  formatSoulMemoryHits as coreFormatSoulMemoryHits,
  runSoulMemoryActiveMemoryRecall as coreRunSoulMemoryActiveMemoryRecall,
  type CoreActiveMemoryFilterGenerationInput,
  type CoreActiveMemoryMessage,
  type CoreActiveMemoryRecallDiagnostic,
  type CoreActiveMemoryRecallLogger,
  type CoreActiveMemoryRecallSearchInput,
} from '../plugins/index.js'
import type {
  ResolvedSoulMemorySettings,
  SearchHit,
} from './types.js'
import {
  previewLine,
  sha,
} from './workspace.js'

type MaybePromise<T> = T | Promise<T>

const defaultActiveMemoryRuntime = new CoreSoulMemoryActiveMemoryRuntime()
const formatHits = coreFormatSoulMemoryHits as (hits: SearchHit[]) => string

export interface RunMemoryActiveMemoryRecallOptions<TProvider> {
  sessionId: string
  agentId: string
  messages: CoreActiveMemoryMessage[]
  settings: ResolvedSoulMemorySettings
  sessionDisabled?: boolean
  runtime?: CoreSoulMemoryActiveMemoryRuntime
  search(input: CoreActiveMemoryRecallSearchInput): MaybePromise<SearchHit[]>
  resolveProvider(): MaybePromise<TProvider | null>
  providerId(provider: TProvider): string | undefined
  providerModel(provider: TProvider): string | undefined
  generateFilter(input: CoreActiveMemoryFilterGenerationInput<TProvider>): MaybePromise<string>
  logDiagnostic?: (event: CoreActiveMemoryRecallDiagnostic) => void
  logger?: CoreActiveMemoryRecallLogger
}

export async function runMemoryActiveMemoryRecall<TProvider>(
  options: RunMemoryActiveMemoryRecallOptions<TProvider>,
): Promise<string | null> {
  return coreRunSoulMemoryActiveMemoryRecall<SearchHit, TProvider>({
    sessionId: options.sessionId,
    agentId: options.agentId,
    messages: options.messages,
    pluginEnabled: options.settings.enabled,
    sessionDisabled: Boolean(options.sessionDisabled),
    settings: {
      ...options.settings.activeMemory,
      searchMaxResults: options.settings.search.maxResults,
    },
    runtime: options.runtime ?? defaultActiveMemoryRuntime,
    hash: sha,
    search: options.search,
    formatHits,
    resolveProvider: options.resolveProvider,
    providerId: options.providerId,
    providerModel: options.providerModel,
    generateFilter: options.generateFilter,
    logDiagnostic: options.logDiagnostic,
    logger: options.logger,
    preview: previewLine,
  })
}
