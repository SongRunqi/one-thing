/**
 * Log Monitor Plugin — real-time agent event logging with disk persistence.
 *
 * Install: ln -s $(pwd)/sample-plugins/log-monitor ~/.onething/plugins/log-monitor
 *
 * Features:
 *   1. Real-time event tracking (12+ event types, non-blocking WriteStream)
 *   2. Daily log rotation + 7-day cleanup (~/.onething/log/agent-YYYY-MM-DD.log)
 *   3. In-memory ring buffer (500 entries) for fast queries
 *   4. search_logs tool — LLM can query logs during conversation
 *   5. Commands: /log-tail, /log-errors, /log-stats, /log-export, /log-clear
 *   6. Real-time error notifications via api.ui.notify()
 *   7. Persistent export snapshots via api.store
 */

import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'

/** @param {import('../../apps/electron/src/main/plugins/types').PluginAPI} api */
export default function logMonitorPlugin(api) {
  // ── Configuration ──────────────────────────────────
  const MAX_BUFFER = 500
  const FLUSH_INTERVAL_MS = 1000
  const LOG_RETENTION_DAYS = 7
  const LOG_DIR = path.join(process.env.HOME || '~', '.onething', 'log')

  // ── State ──────────────────────────────────────────
  const logs = []                       // In-memory ring buffer
  const writeBuffer = []                // Disk write buffer
  let flushTimer = null                 // Flush debounce timer
  let writeStream = null                // Current day's WriteStream
  let currentLogFile = ''               // Track when to rotate
  let isBackpressure = false            // WriteStream drain flag
  let droppedCount = 0                  // How many writes skipped during backpressure

  // High-frequency events: store only the most recent per type
  const HIGH_FREQ = new Set([
    'content:part', 'content:continuation',
    'step:updated', 'tool:metadata',
    'request:snapshot',
  ])
  const lastHighFreq = new Map()

  // ── File I/O ───────────────────────────────────────

  function getTodayLogFile() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return path.join(LOG_DIR, `agent-${y}-${m}-${day}.log`)
  }

  function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true })
    }
  }

  function maybeRotate() {
    const today = getTodayLogFile()
    if (today !== currentLogFile) {
      // Close current stream
      if (writeStream) {
        writeStream.end()
      }
      currentLogFile = today
      writeStream = fs.createWriteStream(today, { flags: 'a' })
      writeStream.on('drain', () => {
        isBackpressure = false
      })
      console.log(`[LogMonitor] Rotated to ${path.basename(today)}`)
    }
  }

  /**
   * Non-blocking write to disk via WriteStream.
   * Uses a 1-second debounce to batch writes, reducing syscalls.
   * During backpressure, writes are silently dropped (prefer loss over blocking).
   */
  function pushToDisk(line: string) {
    if (isBackpressure) {
      droppedCount++
      return
    }

    writeBuffer.push(line)

    if (!flushTimer) {
      flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
    }
  }

  function flush() {
    if (writeBuffer.length === 0) {
      flushTimer = null
      return
    }

    maybeRotate()

    const lines = writeBuffer.splice(0)
    if (writeStream && !writeStream.destroyed) {
      const ok = writeStream.write(lines.join('\n') + '\n')
      if (!ok) {
        isBackpressure = true
        // During backpressure, remaining buffer will be tried on next flush
      }
    }

    // If more data arrived during flush, schedule another flush
    if (writeBuffer.length > 0) {
      flushTimer = setTimeout(flush, 100)
    } else {
      flushTimer = null
      // Periodic cleanup check (cheap: only reads directory on first call)
      if (Math.random() < 0.05) cleanupOldLogs()
    }
  }

  function cleanupOldLogs() {
    try {
      const now = Date.now()
      const files = fs.readdirSync(LOG_DIR)
      let cleaned = 0
      for (const file of files) {
        const match = file.match(/^agent-(\d{4}-\d{2}-\d{2})\.log$/)
        if (!match) continue
        const age = now - new Date(match[1]).getTime()
        if (age > LOG_RETENTION_DAYS * 86400000) {
          fs.unlinkSync(path.join(LOG_DIR, file))
          cleaned++
        }
      }
      if (cleaned > 0) {
        console.log(`[LogMonitor] Cleaned ${cleaned} old log file(s)`)
      }
    } catch (err) {
      // Non-critical — log directory may not exist yet
    }
  }

  // ── Event Tracking ─────────────────────────────────

  function summarizeEvent(type, event) {
    switch (type) {
      case 'stream:start':
        return `Stream start (model: ${event.model || '?'})`
      case 'stream:complete':
        return `Stream complete (${event.data?.usage?.totalTokens || '?'} tokens)`
      case 'stream:error':
        return `Stream error: ${event.data?.error || 'unknown'}`
      case 'stream:aborted':
        return `Stream aborted: ${event.reason || 'user'}`
      case 'tool:call':
        return `Tool call: ${event.toolCall?.toolName || '?'}`
      case 'tool:result':
        return `${event.toolCall?.isError ? 'ERROR' : 'OK'} Tool: ${event.toolCall?.toolName || '?'}`
      case 'tool_execution_start':
        return `Tool start: ${event.toolName}`
      case 'tool_execution_end':
        return `${event.isError ? 'ERROR' : 'OK'} Tool done: ${event.toolName}`
      case 'message:user-created':
        return 'User message'
      case 'message:assistant-created':
        return `Assistant (model: ${event.message?.model || '?'})`
      case 'skill:activated':
        return `Skill: ${event.skillName}`
      case 'permission:request':
        return `Permission: ${event.title || '?'}`
      case 'step:added':
        return `Step: ${event.step?.title || '?'}`
      case 'session:renamed':
        return `Session renamed: "${event.name}"`
      case 'messages:replaced':
        return `Messages replaced (${event.messages?.length || 0} total)`
      default:
        return `${type}: ${JSON.stringify(event).slice(0, 80)}`
    }
  }

  function push(eventType, envelope) {
    const entry = {
      eventType,
      timestamp: envelope.timestamp,
      sessionId: envelope.sessionId,
      sequence: envelope.sequence,
      summary: summarizeEvent(eventType, envelope.event),
    }

    // High-frequency events: rate-limited
    if (HIGH_FREQ.has(eventType)) {
      const prev = lastHighFreq.get(eventType)
      if (prev) {
        prev.duplicates = (prev.duplicates || 0) + 1
        prev.timestamp = entry.timestamp
        // Only write to disk every ~50 duplicates to reduce I/O
        if (prev.duplicates % 50 === 0) {
          pushToDisk(JSON.stringify({
            t: entry.timestamp, type: eventType,
            session: entry.sessionId.slice(0, 8),
            dup: prev.duplicates,
          }))
        }
        return
      }
      lastHighFreq.set(eventType, entry)
    }

    // Ring buffer (memory)
    logs.push(entry)
    if (logs.length > MAX_BUFFER) logs.shift()

    // Disk (non-blocking)
    const diskLine = JSON.stringify({
      t: entry.timestamp,
      type: entry.eventType,
      session: entry.sessionId.slice(0, 8),
      summary: entry.summary,
      seq: entry.sequence,
    })
    pushToDisk(diskLine)

    // Real-time notification for errors
    if (
      eventType === 'stream:error' ||
      (eventType === 'tool_execution_end' && envelope.event.isError)
    ) {
      api.ui.notify(`[LogMonitor] ${entry.summary}`, 'error')
    }
  }

  // ── Subscribe to all tracked events ────────────────

  const TRACKED_EVENTS = [
    'stream:start', 'stream:complete', 'stream:error', 'stream:aborted',
    'tool:call', 'tool:result',
    'tool_execution_start', 'tool_execution_end',
    'message:user-created', 'message:assistant-created',
    'permission:request', 'skill:activated',
    'step:added', 'session:renamed', 'messages:replaced',
  ]

  for (const type of TRACKED_EVENTS) {
    api.on(type, (env) => push(type, env))
  }

  // ── Tool: search_logs (LLM-callable) ───────────────

  api.registerTool({
    name: 'search_agent_logs',
    description:
      'Search recent agent event logs. Use to investigate what tools ran, ' +
      'check for errors, or find what happened in previous turns. ' +
      'Searches the in-memory buffer (last ~500 events).',
    parameters: z.object({
      eventType: z
        .string()
        .optional()
        .describe('Filter by event type (e.g. "tool:call", "stream:error"). Omit to see all.'),
      query: z
        .string()
        .optional()
        .describe('Free-text search in event summaries. Case-insensitive.'),
      limit: z
        .number()
        .optional()
        .describe('Max results (default 30, max 100).'),
    }),
    permissionGuard: 'safe',
    async execute(args, ctx) {
      ctx.metadata({
        title: `Searching logs${args.eventType ? ` for "${args.eventType}"` : ''}...`,
      })

      let filtered = logs
      if (args.eventType) {
        filtered = filtered.filter(
          (l) => l.eventType === args.eventType,
        )
      }
      if (args.query) {
        const q = args.query.toLowerCase()
        filtered = filtered.filter(
          (l) => l.summary && l.summary.toLowerCase().includes(q),
        )
      }

      const limit = Math.min(args.limit || 30, 100)
      const results = filtered.slice(-limit)

      if (results.length === 0) {
        return {
          title: `Logs: no matches`,
          output: `No matching logs found. Buffer has ${logs.length} total events.`,
          metadata: { totalHits: 0, shown: 0 },
        }
      }

      const time = (ts) => new Date(ts).toLocaleTimeString()
      const output =
        `Found ${filtered.length} matching logs (showing last ${results.length}):\n\n` +
        results
          .map(
            (l) =>
              `[${time(l.timestamp)}] ${l.summary}${l.duplicates ? ` (x${l.duplicates + 1})` : ''}`,
          )
          .join('\n')

      return {
        title: `Logs: ${results.length} results`,
        output,
        metadata: {
          totalHits: filtered.length,
          shown: results.length,
          bufferSize: logs.length,
        },
      }
    },
  })

  // ── Commands ───────────────────────────────────────

  api.registerCommand('/log-tail', {
    description: 'Show the last N log entries (default 15)',
    async handler(args, ctx) {
      const n = Math.min(parseInt(args.trim()) || 15, 100)
      const recent = logs.slice(-n)
      if (recent.length === 0) {
        ctx.notify('📭 No logs yet.', 'info')
        return
      }
      ctx.notify(`📋 Last ${recent.length} events:`)
      const time = (ts) => new Date(ts).toLocaleTimeString()
      for (const entry of recent) {
        ctx.notify(
          `${time(entry.timestamp)} ${entry.summary}${entry.duplicates ? ` (x${entry.duplicates + 1})` : ''}`,
        )
      }
    },
  })

  api.registerCommand('/log-errors', {
    description: 'Show recent error events',
    async handler(args, ctx) {
      const errors = logs
        .filter(
          (l) =>
            l.eventType === 'stream:error' ||
            (l.eventType === 'tool_execution_end' &&
              l.duplicates === undefined &&
              l.summary?.startsWith('ERROR')),
        )
        .slice(-15)
      if (errors.length === 0) {
        ctx.notify('✅ No errors found.', 'info')
        return
      }
      for (const e of errors) {
        ctx.notify(`❌ ${new Date(e.timestamp).toLocaleTimeString()} ${e.summary}`)
      }
    },
  })

  api.registerCommand('/log-stats', {
    description: 'Show event type statistics',
    async handler(args, ctx) {
      const counts = {}
      for (const l of logs) {
        counts[l.eventType] = (counts[l.eventType] || 0) + 1
      }
      const entries = Object.entries(counts).sort(
        (a, b) => b[1] - a[1],
      )
      const lines = entries.map(([type, cnt]) => `  ${type}: ${cnt}`)
      const status = isBackpressure
        ? `⚠️  disk backpressure, ${droppedCount} writes dropped`
        : `✅ disk OK (${LOG_DIR})`
      ctx.notify(
        `📊 ${logs.length} events in buffer | ${status}\n${lines.join('\n')}`,
      )
    },
  })

  api.registerCommand('/log-export', {
    description: 'Export current buffer to persistent store',
    async handler(args, ctx) {
      const snapshot = {
        time: Date.now(),
        count: logs.length,
        sample: logs.slice(-50).map((l) => ({
          t: l.timestamp,
          type: l.eventType,
          summary: l.summary,
        })),
      }
      api.store.set('last-export', snapshot)
      ctx.notify(
        `💾 Exported ${snapshot.count} events (last 50 entries) to persistent store.`,
      )
    },
  })

  api.registerCommand('/log-clear', {
    description: 'Clear the in-memory log buffer (disk logs are preserved)',
    async handler(args, ctx) {
      const count = logs.length
      logs.length = 0
      lastHighFreq.clear()
      ctx.notify(`🧹 Cleared ${count} events from in-memory buffer.`, 'info')
    },
  })

  // ── Initialization ─────────────────────────────────

  ensureDir()
  maybeRotate()

  // In-memory ring for fast queries
  // Real disk persistence can be queried via /log commands or external tools

  // Recover previous export summary
  const saved = api.store.get('last-export')
  const logCount = saved
    ? `${saved.count} events (${new Date(saved.time).toLocaleString()})`
    : 'none'

  console.log(
    `[LogMonitor] Initialized. Buffer: ${MAX_BUFFER}. Disk: ${LOG_DIR}. ` +
      `Previous export: ${logCount}. Tracked events: ${TRACKED_EVENTS.length}`,
  )
}
