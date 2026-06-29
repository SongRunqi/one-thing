import type { AppSettings } from '../../shared/ipc.js'
import type { SoulMemoryLoggingSettings } from '@onething/runtime/memory/types'
import {
  embedOnethingTexts,
  type OnethingEmbeddingRequest,
  type OnethingEmbeddingResult,
} from '@onething/runtime/embeddings'
import { createBoundFetch } from '../providers/bound-fetch.js'
import {
  configureMemoryDiagnosticsLogger,
  createMemoryDiagnosticsFetch,
  logMemoryDiagnostic,
  sanitizeUrlForMemoryLog,
} from '../memory/diagnostics-logger.js'

export type EmbeddingRequest = OnethingEmbeddingRequest<AppSettings>
export type EmbeddingResult = OnethingEmbeddingResult

export async function embedTexts(request: EmbeddingRequest): Promise<EmbeddingResult> {
  return embedOnethingTexts(request, {
    createFetch: context => createMemoryDiagnosticsFetch(createBoundFetch({ policy: 'default' }), context),
    configureDiagnostics: logging => configureMemoryDiagnosticsLogger(logging as SoulMemoryLoggingSettings | undefined),
    logDiagnostic: logMemoryDiagnostic,
    sanitizeUrl: sanitizeUrlForMemoryLog,
  })
}
