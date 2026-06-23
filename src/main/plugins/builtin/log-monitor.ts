/**
 * Built-in Log Monitor plugin.
 *
 * Records session events to an in-memory ring buffer and a daily log file,
 * then exposes a safe LLM tool and slash commands for inspection.
 */

import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import type { PluginAPI } from '../types.js'
import { getLogDir } from '../../stores/paths.js'

interface LogEntry {
  eventType: string
  timestamp: number
  sessionId: string
  sequence: number
  summary: string
  duplicates?: number
}

export const logMonitorManifest = {
  name: 'log-monitor',
  version: '1.0.0',
  description: 'Real-time agent event logging with disk persistence, daily rotation, and LLM-searchable logs',
  author: 'onething',
}

export default function logMonitorPlugin(api: PluginAPI): void {
  const MAX_BUFFER = 500
  const FLUSH_INTERVAL_MS = 1000
  const LOG_RETENTION_DAYS = 7
  const LOG_DIR = getLogDir()

  const logs: LogEntry[] = []
  const writeBuffer: string[] = []
  let flushTimer: NodeJS.Timeout | null = null
  let writeStream: fs.WriteStream | null = null
  let currentLogFile = ''
  let isBackpressure = false
  let droppedCount = 0

  const highFrequencyEvents = new Set([
    'content:part',
    'content:continuation',
    'step:updated',
    'tool:metadata',
    'request:snapshot',
  ])
  const lastHighFrequency = new Map<string, LogEntry>()

  function getTodayLogFile(): string {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return path.join(LOG_DIR, `agent-${year}-${month}-${day}.log`)
  }

  function ensureLogDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true })
    }
  }

  function maybeRotate(): void {
    const today = getTodayLogFile()
    if (today === currentLogFile) return

    if (writeStream) writeStream.end()
    currentLogFile = today
    writeStream = fs.createWriteStream(today, { flags: 'a' })
    writeStream.on('drain', () => {
      isBackpressure = false
    })
    console.log(`[LogMonitor] Rotated to ${path.basename(today)}`)
  }

  function cleanupOldLogs(): void {
    try {
      const now = Date.now()
      for (const file of fs.readdirSync(LOG_DIR)) {
        const match = file.match(/^agent-(\d{4}-\d{2}-\d{2})\.log$/)
        if (!match) continue
        if (now - new Date(match[1]).getTime() > LOG_RETENTION_DAYS * 86400000) {
          fs.unlinkSync(path.join(LOG_DIR, file))
        }
      }
    } catch {
      // Best effort only.
    }
  }

  function flush(): void {
    if (writeBuffer.length === 0) {
      flushTimer = null
      return
    }

    maybeRotate()
    const lines = writeBuffer.splice(0)
    if (writeStream && !writeStream.destroyed) {
      const ok = writeStream.write(lines.join('\n') + '\n')
      if (!ok) isBackpressure = true
    }

    flushTimer = writeBuffer.length > 0
      ? setTimeout(flush, 100)
      : null

    if (!flushTimer && Math.random() < 0.05) cleanupOldLogs()
  }

  function pushToDisk(line: string): void {
    if (isBackpressure) {
      droppedCount++
      return
    }

    writeBuffer.push(line)
    if (!flushTimer) {
      flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
    }
  }

  function summarizeEvent(type: string, event: Record<string, any>): string {
    switch (type) {
      case 'stream:start': return `Stream start (model: ${event.model || '?'})`
      case 'stream:complete': return `Stream complete (${event.data?.usage?.totalTokens || '?'} tokens)`
      case 'stream:error': return `Stream error: ${event.data?.error || 'unknown'}`
      case 'stream:aborted': return `Stream aborted: ${event.reason || 'user'}`
      case 'tool:call': return `Tool call: ${event.toolCall?.toolName || '?'}`
      case 'tool:result': return `${event.toolCall?.isError ? 'ERROR' : 'OK'} Tool: ${event.toolCall?.toolName || '?'}`
      case 'tool_execution_start': return `Tool start: ${event.toolName || '?'}`
      case 'tool_execution_end': return `${event.isError ? 'ERROR' : 'OK'} Tool done: ${event.toolName || '?'}`
      case 'message:user-created': return 'User message'
      case 'message:assistant-created': return `Assistant (model: ${event.message?.model || '?'})`
      case 'skill:activated': return `Skill: ${event.skillName || '?'}`
      case 'permission:request': return `Permission: ${event.title || '?'}`
      case 'step:added': return `Step: ${event.step?.title || '?'}`
      case 'session:renamed': return `Session renamed: "${event.name || ''}"`
      case 'messages:replaced': return `Messages replaced (${event.messages?.length || 0} total)`
      default: return `${type}: ${JSON.stringify(event).slice(0, 80)}`
    }
  }

  function push(eventType: string, envelope: {
    sessionId: string
    sequence: number
    timestamp: number
    event: { type: string; [key: string]: unknown }
  }): void {
    const entry: LogEntry = {
      eventType,
      timestamp: envelope.timestamp,
      sessionId: envelope.sessionId,
      sequence: envelope.sequence,
      summary: summarizeEvent(eventType, envelope.event),
    }

    if (highFrequencyEvents.has(eventType)) {
      const previous = lastHighFrequency.get(eventType)
      if (previous) {
        previous.duplicates = (previous.duplicates || 0) + 1
        previous.timestamp = entry.timestamp
        if (previous.duplicates % 50 === 0) {
          pushToDisk(JSON.stringify({
            t: entry.timestamp,
            type: eventType,
            session: entry.sessionId.slice(0, 8),
            dup: previous.duplicates,
          }))
        }
        return
      }
      lastHighFrequency.set(eventType, entry)
    }

    logs.push(entry)
    if (logs.length > MAX_BUFFER) logs.shift()

    pushToDisk(JSON.stringify({
      t: entry.timestamp,
      type: entry.eventType,
      session: entry.sessionId.slice(0, 8),
      summary: entry.summary,
      seq: entry.sequence,
    }))

    if (eventType === 'stream:error' || (eventType === 'tool_execution_end' && (envelope.event as any).isError)) {
      api.ui.notify(`[LogMonitor] ${entry.summary}`, 'error')
    }
  }

  const trackedEvents = [
    'stream:start',
    'stream:complete',
    'stream:error',
    'stream:aborted',
    'tool:call',
    'tool:result',
    'tool_execution_start',
    'tool_execution_end',
    'message:user-created',
    'message:assistant-created',
    'permission:request',
    'skill:activated',
    'step:added',
    'session:renamed',
    'messages:replaced',
  ]

  for (const type of trackedEvents) {
    api.on(type, (envelope) => push(type, envelope))
  }

  api.registerTool({
    name: 'search_agent_logs',
    description: 'Search recent agent event logs. Use to investigate what tools ran, check for errors, or find what happened in previous turns.',
    parameters: z.object({
      eventType: z.string().optional().describe('Filter by event type, e.g. "tool:call" or "stream:error".'),
      query: z.string().optional().describe('Free-text search in event summaries. Case-insensitive.'),
      limit: z.number().optional().describe('Max results (default 30, max 100).'),
    }),
    permissionGuard: 'safe',
    async execute(args, ctx) {
      ctx.metadata({ title: `Searching logs${args.eventType ? ` for "${args.eventType}"` : ''}...` })
      let filtered = logs
      if (args.eventType) filtered = filtered.filter((entry) => entry.eventType === args.eventType)
      if (args.query) {
        const query = args.query.toLowerCase()
        filtered = filtered.filter((entry) => entry.summary.toLowerCase().includes(query))
      }

      const limit = Math.min(args.limit || 30, 100)
      const results = filtered.slice(-limit)
      if (results.length === 0) {
        return {
          title: 'Logs: no matches',
          output: `No matching logs found. Buffer has ${logs.length} total events.`,
          metadata: { totalHits: 0, shown: 0 },
        }
      }

      const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString()
      return {
        title: `Logs: ${results.length} results`,
        output: `Found ${filtered.length} matching logs (showing last ${results.length}):\n\n${results.map((entry) =>
          `[${formatTime(entry.timestamp)}] ${entry.summary}${entry.duplicates ? ` (x${entry.duplicates + 1})` : ''}`
        ).join('\n')}`,
        metadata: { totalHits: filtered.length, shown: results.length, bufferSize: logs.length },
      }
    },
  })

  api.registerCommand('/log-tail', {
    description: 'Show the last N log entries (default 15)',
    async handler(args, ctx) {
      const count = Math.min(parseInt(args.trim(), 10) || 15, 100)
      const recent = logs.slice(-count)
      if (recent.length === 0) {
        ctx.notify('No logs yet.', 'info')
        return
      }
      const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString()
      ctx.notify(`Last ${recent.length} events:\n${recent.map((entry) => `${formatTime(entry.timestamp)} ${entry.summary}`).join('\n')}`)
    },
  })

  api.registerCommand('/log-errors', {
    description: 'Show recent error events',
    async handler(_args, ctx) {
      const errors = logs
        .filter((entry) => entry.eventType === 'stream:error' || (entry.eventType === 'tool_execution_end' && entry.summary.startsWith('ERROR')))
        .slice(-15)
      ctx.notify(errors.length
        ? errors.map((entry) => `${new Date(entry.timestamp).toLocaleTimeString()} ${entry.summary}`).join('\n')
        : 'No errors found.',
      errors.length ? 'warn' : 'info')
    },
  })

  api.registerCommand('/log-stats', {
    description: 'Show event type statistics',
    async handler(_args, ctx) {
      const counts = new Map<string, number>()
      for (const entry of logs) {
        counts.set(entry.eventType, (counts.get(entry.eventType) || 0) + 1)
      }
      const lines = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `  ${type}: ${count}`)
      const status = isBackpressure ? `disk backpressure, ${droppedCount} writes dropped` : 'disk OK'
      ctx.notify(`${logs.length} events in buffer | ${status}\n${lines.join('\n')}`)
    },
  })

  api.registerCommand('/log-clear', {
    description: 'Clear in-memory log buffer',
    async handler(_args, ctx) {
      const count = logs.length
      logs.length = 0
      lastHighFrequency.clear()
      ctx.notify(`Cleared ${count} events from buffer.`, 'info')
    },
  })

  ensureLogDir()
  maybeRotate()
  console.log(`[LogMonitor] Initialized. Buffer: ${MAX_BUFFER}.`)
}
