import { formatWithOptions } from 'node:util'
import {
  createElectronRendererConsoleCapture,
  setElectronAppLogsPath,
  type ElectronRendererConsoleCapture,
} from '@onething/electron-host/logging/console-capture'
import { ensureDir, getLogDir } from '../stores/paths.js'
import { RollingFileLogger, type AppLogLevel } from './rolling-file-logger.js'

type ConsoleMethod = 'debug' | 'info' | 'log' | 'warn' | 'error'
type StreamWrite = typeof process.stdout.write

const ORIGINAL_CONSOLE: Record<ConsoleMethod, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

const METHOD_LEVEL: Record<ConsoleMethod, AppLogLevel> = {
  debug: 'debug',
  info: 'info',
  log: 'info',
  warn: 'warn',
  error: 'error',
}

let consolePatched = false
let initialized = false
let rendererConsoleCapture: ElectronRendererConsoleCapture | null = null
let warningHandler: ((warning: Error) => void) | null = null
let uncaughtMonitorHandler: ((error: Error, origin: NodeJS.UncaughtExceptionOrigin) => void) | null = null
let exitHandler: (() => void) | null = null
let stdoutPatched = false
let stderrPatched = false
let writingThroughConsole = false
const ORIGINAL_STDOUT_WRITE = process.stdout.write.bind(process.stdout)
const ORIGINAL_STDERR_WRITE = process.stderr.write.bind(process.stderr)

function readNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export const appLogger = new RollingFileLogger({
  logDir: getLogDir(),
  baseName: 'app',
  maxFileBytes: Math.floor(readNumberEnv('ONETHING_LOG_MAX_SIZE_MB', 8, 1, 512) * 1024 * 1024),
  maxArchiveFiles: readNumberEnv('ONETHING_LOG_MAX_ARCHIVES', 30, 1, 500),
  retentionDays: readNumberEnv('ONETHING_LOG_RETENTION_DAYS', 14, 1, 365),
  compressArchives: process.env.ONETHING_LOG_COMPRESS !== '0',
  onInternalError: (error) => {
    ORIGINAL_CONSOLE.error('[Logging] internal logger error:', error)
  },
})

export function getAppLogDir(): string {
  return getLogDir()
}

export function getAppLogPath(): string {
  return appLogger.getActiveLogPath()
}

export function initializeAppLogging(): void {
  if (initialized) return
  initialized = true

  const logDir = getLogDir()
  ensureDir(logDir)
  setElectronAppLogsPath(logDir)
  appLogger.start()
  patchProcessOutput()
  patchConsole()
  attachLoggingCapture()

  console.info('[Logging] Writing logs to:', logDir)
}

export async function shutdownAppLogging(): Promise<void> {
  if (!initialized) return
  detachLoggingCapture()
  await appLogger.shutdown()
  detachProcessExitFlush()
  restoreConsole()
  restoreProcessOutput()
  initialized = false
}

export function writeAppLog(level: AppLogLevel, source: string, message: string, metadata?: Record<string, unknown>): void {
  appLogger.log({ level, source, message, metadata })
}

function patchConsole(): void {
  if (consolePatched) return
  for (const method of Object.keys(ORIGINAL_CONSOLE) as ConsoleMethod[]) {
    console[method] = (...args: unknown[]) => {
      let consoleWriteError: unknown
      writingThroughConsole = true
      try {
        ORIGINAL_CONSOLE[method](...args)
      } catch (error) {
        if (isBrokenOutputPipeError(error)) {
          suppressBrokenOutputPipe(error)
        } else {
          consoleWriteError = error
        }
      } finally {
        writingThroughConsole = false
      }
      appLogger.log({ level: METHOD_LEVEL[method], source: 'main', message: formatConsoleArgs(args) })
      if (consoleWriteError) throw consoleWriteError
    }
  }
  consolePatched = true
}

function restoreConsole(): void {
  if (!consolePatched) return
  for (const method of Object.keys(ORIGINAL_CONSOLE) as ConsoleMethod[]) {
    console[method] = ORIGINAL_CONSOLE[method] as typeof console[typeof method]
  }
  consolePatched = false
}

function patchProcessOutput(): void {
  if (!stdoutPatched) {
    process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
      if (!writingThroughConsole) logStreamChunk('stdout', 'info', chunk)
      return writeOriginalStream(ORIGINAL_STDOUT_WRITE as StreamWrite, chunk, args)
    }) as typeof process.stdout.write
    stdoutPatched = true
  }
  if (!stderrPatched) {
    process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
      if (!writingThroughConsole) logStreamChunk('stderr', 'error', chunk)
      return writeOriginalStream(ORIGINAL_STDERR_WRITE as StreamWrite, chunk, args)
    }) as typeof process.stderr.write
    stderrPatched = true
  }
}

function restoreProcessOutput(): void {
  if (stdoutPatched) {
    process.stdout.write = ORIGINAL_STDOUT_WRITE as typeof process.stdout.write
    stdoutPatched = false
  }
  if (stderrPatched) {
    process.stderr.write = ORIGINAL_STDERR_WRITE as typeof process.stderr.write
    stderrPatched = false
  }
}

function logStreamChunk(source: 'stdout' | 'stderr', level: AppLogLevel, chunk: unknown): void {
  const text = chunkToString(chunk)
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (line.length === 0) continue
    appLogger.log({ level, source, message: line })
  }
}

function writeOriginalStream(write: StreamWrite, chunk: unknown, args: unknown[]): boolean {
  try {
    return write(chunk as any, ...(args as []))
  } catch (error) {
    if (!isBrokenOutputPipeError(error)) throw error
    suppressBrokenOutputPipe(error)
    return false
  }
}

function isBrokenOutputPipeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EPIPE'
    || code === 'ERR_STREAM_DESTROYED'
    || code === 'ERR_STREAM_WRITE_AFTER_END'
}

function suppressBrokenOutputPipe(error: unknown): void {
  appLogger.log({
    level: 'debug',
    source: 'process',
    message: 'Suppressed broken stdout/stderr pipe during shutdown',
    metadata: error && typeof error === 'object'
      ? { code: (error as NodeJS.ErrnoException).code }
      : undefined,
  })
}

function chunkToString(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  if (Buffer.isBuffer(chunk)) return chunk.toString('utf-8')
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString('utf-8')
  return String(chunk)
}

function formatConsoleArgs(args: unknown[]): string {
  if (args.length === 0) return ''
  return formatWithOptions(
    {
      colors: false,
      depth: 8,
      breakLength: 160,
      compact: 3,
    },
    ...args,
  )
}

function attachLoggingCapture(): void {
  rendererConsoleCapture = createElectronRendererConsoleCapture({
    log: entry => appLogger.log(entry),
  })
  rendererConsoleCapture.attach()

  warningHandler = (warning) => {
    appLogger.log({
      level: 'warn',
      source: 'process',
      message: warning.stack || warning.message,
      metadata: { name: warning.name },
    })
  }
  process.on('warning', warningHandler)

  uncaughtMonitorHandler = (error, origin) => {
    appLogger.log({
      level: 'error',
      source: 'process',
      message: error.stack || error.message,
      metadata: { origin },
    })
  }
  process.on('uncaughtExceptionMonitor', uncaughtMonitorHandler)

  exitHandler = () => {
    appLogger.flushSync()
  }
  process.on('exit', exitHandler)
}

function detachLoggingCapture(): void {
  rendererConsoleCapture?.detach()
  rendererConsoleCapture = null

  if (warningHandler) {
    process.off('warning', warningHandler)
    warningHandler = null
  }
  if (uncaughtMonitorHandler) {
    process.off('uncaughtExceptionMonitor', uncaughtMonitorHandler)
    uncaughtMonitorHandler = null
  }
}

function detachProcessExitFlush(): void {
  if (!exitHandler) return
  process.off('exit', exitHandler)
  exitHandler = null
}
