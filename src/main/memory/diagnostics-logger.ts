import path from 'node:path'
import { getLogDir } from '../stores/paths.js'
import {
  createMemoryDiagnosticsFetch as createRuntimeMemoryDiagnosticsFetch,
  MemoryDiagnosticsLogger as RuntimeMemoryDiagnosticsLogger,
  type MemoryDiagnosticsFetchContext,
  type MemoryDiagnosticsLoggerOptions,
  type MemoryDiagnosticsLogInput,
  type MemoryDiagnosticLogEntry,
} from '@onething/runtime/memory/diagnostics-logger'
import type { SoulMemoryLoggingSettings } from '@onething/runtime/memory/types'

export {
  sanitizeForMemoryLog,
  sanitizeUrlForMemoryLog,
} from '@onething/runtime/memory/diagnostics-logger'
export type {
  MemoryDiagnosticLevel,
  MemoryDiagnosticLogEntry,
  MemoryDiagnosticStatus,
  MemoryDiagnosticSubsystem,
  MemoryDiagnosticsFetchContext,
  MemoryDiagnosticsLoggerConfig,
  MemoryDiagnosticsLoggerOptions,
  MemoryDiagnosticsLogInput,
  MemoryLogsListRequest,
} from '@onething/runtime/memory/diagnostics-logger'
export type {
  SoulMemoryLoggingSettings,
} from '@onething/runtime/memory/types'

function memoryLogDir(): string {
  return path.join(getLogDir(), 'memory')
}

export class MemoryDiagnosticsLogger extends RuntimeMemoryDiagnosticsLogger {
  constructor(options: MemoryDiagnosticsLoggerOptions = {}) {
    super({
      ...options,
      logDir: options.logDir ?? memoryLogDir,
    })
  }
}

export const memoryDiagnosticsLogger = new MemoryDiagnosticsLogger()

export function configureMemoryDiagnosticsLogger(settings?: SoulMemoryLoggingSettings): void {
  memoryDiagnosticsLogger.configure(settings)
}

export function logMemoryDiagnostic(input: MemoryDiagnosticsLogInput): MemoryDiagnosticLogEntry | null {
  return memoryDiagnosticsLogger.log(input)
}

export function createMemoryDiagnosticsFetch(
  baseFetch: typeof fetch,
  context: MemoryDiagnosticsFetchContext = {},
): typeof fetch {
  return createRuntimeMemoryDiagnosticsFetch(baseFetch, context, memoryDiagnosticsLogger)
}
