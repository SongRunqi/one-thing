import { app, type WebContents } from 'electron'

export type ElectronAppLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ElectronAppLogEntry {
  level: ElectronAppLogLevel
  source: string
  message: string
  metadata?: Record<string, unknown>
}

export interface ElectronLoggingAppLike {
  setAppLogsPath(path: string): void
  on(event: 'web-contents-created', listener: (event: unknown, webContents: ElectronLoggingWebContents) => void): void
  off(event: 'web-contents-created', listener: (event: unknown, webContents: ElectronLoggingWebContents) => void): void
}

export interface ElectronLoggingWebContents {
  id: number
  getURL(): string
  on(event: 'console-message', listener: (
    event: unknown,
    legacyLevel: number,
    legacyMessage: string,
    legacyLine: number,
    legacySourceId: string,
  ) => void): void
}

export interface ElectronRendererConsoleCaptureOptions {
  log(entry: ElectronAppLogEntry): void
  app?: ElectronLoggingAppLike
}

export interface ElectronRendererConsoleCapture {
  attach(): void
  detach(): void
  attachWebContentsLogging(webContents: ElectronLoggingWebContents): void
}

const NUMERIC_RENDERER_LEVELS: Record<number, ElectronAppLogLevel> = {
  0: 'debug',
  1: 'info',
  2: 'warn',
  3: 'error',
}

const STRING_RENDERER_LEVELS: Record<string, ElectronAppLogLevel> = {
  debug: 'debug',
  info: 'info',
  warning: 'warn',
  warn: 'warn',
  error: 'error',
}

export function setElectronAppLogsPath(logDir: string, electronApp: Pick<ElectronLoggingAppLike, 'setAppLogsPath'> = app): void {
  electronApp.setAppLogsPath(logDir)
}

export function createElectronRendererConsoleCapture(
  options: ElectronRendererConsoleCaptureOptions,
): ElectronRendererConsoleCapture {
  const electronApp = options.app ?? app
  const attachedWebContents = new WeakSet<ElectronLoggingWebContents>()
  let webContentsCreatedHandler: ((event: unknown, webContents: ElectronLoggingWebContents) => void) | null = null

  function attachWebContentsLogging(webContents: ElectronLoggingWebContents): void {
    if (attachedWebContents.has(webContents)) return
    attachedWebContents.add(webContents)

    webContents.on('console-message', (event, legacyLevel, legacyMessage, legacyLine, legacySourceId) => {
      const details = event as {
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

      options.log({
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

  return {
    attach(): void {
      if (webContentsCreatedHandler) return
      webContentsCreatedHandler = (_event, webContents) => attachWebContentsLogging(webContents)
      electronApp.on('web-contents-created', webContentsCreatedHandler)
    },
    detach(): void {
      if (!webContentsCreatedHandler) return
      electronApp.off('web-contents-created', webContentsCreatedHandler)
      webContentsCreatedHandler = null
    },
    attachWebContentsLogging,
  }
}

export type ElectronWebContents = WebContents
