import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { OnethingLogMonitorPluginApi } from '../log-monitor.js'
import {
  ONETHING_LOG_MONITOR_MANIFEST,
  createOnethingLogMonitorSearchToolParameters,
  registerOnethingLogMonitorPlugin,
} from '../log-monitor.js'

function createTempLogDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'onething-log-monitor-'))
}

describe('runtime log-monitor plugin', () => {
  it('exposes the onething log monitor manifest and zod search parameters', () => {
    expect(ONETHING_LOG_MONITOR_MANIFEST).toMatchObject({
      name: 'log-monitor',
      version: '1.0.0',
    })
    expect(createOnethingLogMonitorSearchToolParameters().safeParse({
      eventType: 'stream:error',
      query: 'boom',
      limit: 10,
    }).success).toBe(true)
  })

  it('registers the log monitor plugin through runtime defaults and host log dir adapter', () => {
    const logDir = createTempLogDir()
    const handlers = new Map<string, (envelope: any) => void>()
    const commands = new Map<string, unknown>()
    const notifications: Array<{ message: string; level?: 'info' | 'warn' | 'error' }> = []
    const api: OnethingLogMonitorPluginApi = {
      on(eventType, handler) {
        handlers.set(eventType, handler)
      },
      registerTool: vi.fn(),
      registerCommand(name, options) {
        commands.set(name, options)
      },
      ui: {
        notify(message, level) {
          notifications.push({ message, level })
        },
      },
    }

    const runtime = registerOnethingLogMonitorPlugin(api, {
      getLogDir: () => logDir,
      logger: { log: vi.fn() },
    })

    try {
      expect(api.registerTool).toHaveBeenCalledWith(expect.objectContaining({
        name: 'search_agent_logs',
        permissionGuard: 'safe',
      }))
      expect(commands.has('/log-tail')).toBe(true)
      expect(commands.has('/log-clear')).toBe(true)
      expect(handlers.has('stream:error')).toBe(true)

      handlers.get('stream:error')?.({
        sessionId: 's1',
        sequence: 1,
        timestamp: 100,
        event: { type: 'stream:error', data: { error: 'boom' } },
      })

      expect(runtime.buffer.entries).toHaveLength(1)
      expect(runtime.diskWriter.pendingLineCount).toBe(1)
      expect(notifications).toEqual([
        { message: '[AgentLog] Stream error: boom', level: 'error' },
      ])
    } finally {
      runtime.diskWriter.flush()
      runtime.diskWriter.close()
    }
  })
})
