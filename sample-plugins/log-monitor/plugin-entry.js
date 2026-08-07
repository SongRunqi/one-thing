import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'

export default function logMonitorPlugin(api) {
  const MAX_BUFFER = 500
  const FLUSH_INTERVAL_MS = 1000
  const LOG_RETENTION_DAYS = 7
  const LOG_DIR = path.join(process.env.HOME || '~', '.onething', 'log')

  const logs = []
  const writeBuffer = []
  let flushTimer = null
  let writeStream = null
  let currentLogFile = ''
  let isBackpressure = false
  let droppedCount = 0

  const HIGH_FREQ = new Set(['content:part', 'content:continuation', 'step:updated', 'tool:metadata', 'request:snapshot'])
  const lastHighFreq = new Map()

  function getTodayLogFile() {
    const d = new Date()
    return path.join(LOG_DIR, `agent-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.log`)
  }

  function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  }

  function maybeRotate() {
    const today = getTodayLogFile()
    if (today !== currentLogFile) {
      if (writeStream) writeStream.end()
      currentLogFile = today
      writeStream = fs.createWriteStream(today, { flags: 'a' })
      writeStream.on('drain', () => { isBackpressure = false })
      console.log(`[LogMonitor] Rotated to ${path.basename(today)}`)
    }
  }

  function pushToDisk(line) {
    if (isBackpressure) { droppedCount++; return }
    writeBuffer.push(line)
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
  }

  function flush() {
    if (writeBuffer.length === 0) { flushTimer = null; return }
    maybeRotate()
    const lines = writeBuffer.splice(0)
    if (writeStream && !writeStream.destroyed) {
      const ok = writeStream.write(lines.join('\n') + '\n')
      if (!ok) isBackpressure = true
    }
    if (writeBuffer.length > 0) {
      flushTimer = setTimeout(flush, 100)
    } else {
      flushTimer = null
      if (Math.random() < 0.05) cleanupOldLogs()
    }
  }

  function cleanupOldLogs() {
    try {
      const now = Date.now()
      for (const file of fs.readdirSync(LOG_DIR)) {
        const match = file.match(/^agent-(\d{4}-\d{2}-\d{2})\.log$/)
        if (!match) continue
        if (now - new Date(match[1]).getTime() > LOG_RETENTION_DAYS * 86400000) {
          fs.unlinkSync(path.join(LOG_DIR, file))
        }
      }
    } catch (_) {}
  }

  function summarizeEvent(type, event) {
    switch (type) {
      case 'stream:start': return `Stream start (model: ${event.model || '?'})`
      case 'stream:complete': return `Stream complete (${event.data?.usage?.totalTokens || '?'} tokens)`
      case 'stream:error': return `Stream error: ${event.data?.error || 'unknown'}`
      case 'stream:aborted': return `Stream aborted: ${event.reason || 'user'}`
      case 'tool:call': return `Tool call: ${event.toolCall?.toolName || '?'}`
      case 'tool:result': return `${event.toolCall?.isError ? 'ERROR' : 'OK'} Tool: ${event.toolCall?.toolName || '?'}`
      case 'tool_execution_start': return `Tool start: ${event.toolName}`
      case 'tool_execution_end': return `${event.isError ? 'ERROR' : 'OK'} Tool done: ${event.toolName}`
      case 'message:user-created': return 'User message'
      case 'message:assistant-created': return `Assistant (model: ${event.message?.model || '?'})`
      case 'skill:activated': return `Skill: ${event.skillName}`
      case 'permission:request': return `Permission: ${event.title || '?'}`
      case 'step:added': return `Step: ${event.step?.title || '?'}`
      case 'session:renamed': return `Session renamed: "${event.name}"`
      case 'messages:replaced': return `Messages replaced (${event.messages?.length || 0} total)`
      default: return `${type}: ${JSON.stringify(event).slice(0, 80)}`
    }
  }

  function push(eventType, envelope) {
    const entry = { eventType, timestamp: envelope.timestamp, sessionId: envelope.sessionId, sequence: envelope.sequence, summary: summarizeEvent(eventType, envelope.event) }
    if (HIGH_FREQ.has(eventType)) {
      const prev = lastHighFreq.get(eventType)
      if (prev) { prev.duplicates = (prev.duplicates || 0) + 1; prev.timestamp = entry.timestamp; return }
      lastHighFreq.set(eventType, entry)
    }
    logs.push(entry)
    if (logs.length > MAX_BUFFER) logs.shift()
    const diskLine = JSON.stringify({ t: entry.timestamp, type: entry.eventType, session: entry.sessionId.slice(0, 8), summary: entry.summary, seq: entry.sequence })
    pushToDisk(diskLine)
    if (eventType === 'stream:error' || (eventType === 'tool_execution_end' && envelope.event.isError)) {
      api.ui.notify(`[LogMonitor] ${entry.summary}`, 'error')
    }
  }

  const TRACKED_EVENTS = ['stream:start', 'stream:complete', 'stream:error', 'stream:aborted', 'tool:call', 'tool:result', 'tool_execution_start', 'tool_execution_end', 'message:user-created', 'message:assistant-created', 'permission:request', 'skill:activated', 'step:added', 'session:renamed', 'messages:replaced']
  for (const type of TRACKED_EVENTS) api.on(type, (env) => push(type, env))

  api.registerTool({
    name: 'search_agent_logs',
    description: 'Search recent agent event logs. Use to investigate what tools ran, check for errors, or find what happened in previous turns. Searches the in-memory buffer (last ~500 events).',
    parameters: z.object({
      eventType: z.string().optional().describe('Filter by event type (e.g. "tool:call", "stream:error").'),
      query: z.string().optional().describe('Free-text search in event summaries. Case-insensitive.'),
      limit: z.number().optional().describe('Max results (default 30, max 100).'),
    }),
    // 宿主会把插件注册的工具**强制**改成 permission-gated —— 插件不能给自己发
    // 免检通行证('safe' 落在自动执行集里)。这里写什么都不影响判定;
    // 要声明能力请用 manifest 的 contributes.permissions。
    permissionGuard: 'permission-gated',
    async execute(args, ctx) {
      ctx.metadata({ title: `Searching logs${args.eventType ? ` for "${args.eventType}"` : ''}...` })
      let filtered = logs
      if (args.eventType) filtered = filtered.filter(l => l.eventType === args.eventType)
      if (args.query) { const q = args.query.toLowerCase(); filtered = filtered.filter(l => l.summary?.toLowerCase().includes(q)) }
      const limit = Math.min(args.limit || 30, 100)
      const results = filtered.slice(-limit)
      if (results.length === 0) return { title: 'Logs: no matches', output: `No matching logs found. Buffer has ${logs.length} total events.`, metadata: { totalHits: 0, shown: 0 } }
      const time = ts => new Date(ts).toLocaleTimeString()
      const output = `Found ${filtered.length} matching logs (showing last ${results.length}):\n\n${results.map(l => `[${time(l.timestamp)}] ${l.summary}${l.duplicates ? ` (x${l.duplicates + 1})` : ''}`).join('\n')}`
      return { title: `Logs: ${results.length} results`, output, metadata: { totalHits: filtered.length, shown: results.length, bufferSize: logs.length } }
    },
  })

  api.registerCommand('/log-tail', {
    description: 'Show the last N log entries (default 15)',
    async handler(args, ctx) {
      const n = Math.min(parseInt(args.trim()) || 15, 100)
      const recent = logs.slice(-n)
      if (recent.length === 0) { ctx.notify('No logs yet.', 'info'); return }
      ctx.notify(`Last ${recent.length} events:`)
      const time = ts => new Date(ts).toLocaleTimeString()
      for (const e of recent) ctx.notify(`${time(e.timestamp)} ${e.summary}`)
    },
  })

  api.registerCommand('/log-errors', {
    description: 'Show recent error events',
    async handler(args, ctx) {
      const errors = logs.filter(l => l.eventType === 'stream:error' || (l.eventType === 'tool_execution_end' && l.summary?.startsWith('ERROR'))).slice(-15)
      if (errors.length === 0) { ctx.notify('No errors found.', 'info'); return }
      for (const e of errors) ctx.notify(`❌ ${new Date(e.timestamp).toLocaleTimeString()} ${e.summary}`)
    },
  })

  api.registerCommand('/log-stats', {
    description: 'Show event type statistics',
    async handler(args, ctx) {
      const counts = {}
      for (const l of logs) counts[l.eventType] = (counts[l.eventType] || 0) + 1
      const lines = Object.entries(counts).sort((a,b) => b[1] - a[1]).map(([t,c]) => `  ${t}: ${c}`)
      const status = isBackpressure ? `disk backpressure, ${droppedCount} writes dropped` : `disk OK`
      ctx.notify(`${logs.length} events in buffer | ${status}\n${lines.join('\n')}`)
    },
  })

  api.registerCommand('/log-clear', {
    description: 'Clear in-memory buffer',
    async handler(args, ctx) {
      const count = logs.length; logs.length = 0; lastHighFreq.clear()
      ctx.notify(`Cleared ${count} events from buffer.`, 'info')
    },
  })

  ensureDir()
  maybeRotate()
  const saved = api.store.get('last-export')
  console.log(`[LogMonitor] Initialized. Buffer: ${MAX_BUFFER}. Previous export: ${saved ? `${saved.count} events` : 'none'}`)
}
