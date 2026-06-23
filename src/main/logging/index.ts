import { app, type WebContents } from 'electron'
import { formatWithOptions } from 'node:util'
import { ensureDir, getLogDir } from '../stores/paths.js'
import { RollingFileLogger, type AppLogLevel } from './rolling-file-logger.js'

type ConsoleMethod = 'debug' | 'info' | 'log' | 'warn' | 'error'

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

const NUMERIC_RENDERER_LEVELS: Record<number, AppLogLevel> = {
  0: 'debug',
  1: 'info',
  2: 'warn',
  3: 'error',
}

const STRING_RENDERER_LEVELS: Record<string, AppLogLevel> = {
  debug: 'debug',
  info: 'info',
  warning: 'warn',
  warn: 'warn',
  error: 'error',
}

const attachedWebContents = new WeakSet<WebContents>()

let consolePatched = false
let initialized = false
let webContentsCreatedHandler: ((event: Electron.Event, webContents: WebContents) => void) | null = null
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
  app.setAppLogsPath(logDir)
  appLogger.start()
  patchProcessOutput()
  patchConsole()
  attachElectronConsoleCapture()

  console.info('[Logging] Writing logs to:', logDir)
}

export async function shutdownAppLogging(): Promise<void> {
  if (!initialized) return
  detachElectronConsoleCapture()
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
      writingThroughConsole = true
      try {
        ORIGINAL_CONSOLE[method](...args)
      } finally {
        writingThroughConsole = false
      }
      appLogger.log({ level: METHOD_LEVEL[method], source: 'main', message: formatConsoleArgs(args) })
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
      return ORIGINAL_STDOUT_WRITE(chunk as any, ...(args as []))
    }) as typeof process.stdout.write
    stdoutPatched = true
  }
  if (!stderrPatched) {
    process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
      if (!writingThroughConsole) logStreamChunk('stderr', 'error', chunk)
      return ORIGINAL_STDERR_WRITE(chunk as any, ...(args as []))
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

function attachElectronConsoleCapture(): void {
  webContentsCreatedHandler = (_event, webContents) => attachWebContentsLogging(webContents)
  app.on('web-contents-created', webContentsCreatedHandler)

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

function detachElectronConsoleCapture(): void {
  if (webContentsCreatedHandler) {
    app.off('web-contents-created', webContentsCreatedHandler)
    webContentsCreatedHandler = null
  }
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

function attachWebContentsLogging(webContents: WebContents): void {
  if (attachedWebContents.has(webContents)) return
  attachedWebContents.add(webContents)

  webContents.on('console-message', (event, legacyLevel, legacyMessage, legacyLine, legacySourceId) => {
    const details = event as Electron.Event & {
      level?: string
      message?: string
      lineNumber?: number
      sourceId?: string
    }
    const message = typeof details.message === 'string' ? details.message : legacyMessage
    if (!message) return

    const rawLevel = typeof details.level === 'string' ? details.level : legacyLevel
    const level = typeof rawLevel === 'number'
      ? NUMERIC_RENDERER_LEVELS[rawLevel] ?? 'info'
      : STRING_RENDERER_LEVELS[rawLevel] ?? 'info'
    const lineNumber = typeof details.lineNumber === 'number' ? details.lineNumber : legacyLine
    const sourceId = details.sourceId || legacySourceId

    appLogger.log({
      level,
      source: `renderer:${webContents.id}`,
      message,
      metadata: {
        ...(sourceId ? { sourceId } : {}),
        ...(lineNumber ? { lineNumber } : {}),
        url: webContents.getURL(),
      },
    })
  })
}
