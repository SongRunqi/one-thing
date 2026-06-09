/**
 * Chat Logger Module
 * Provides structured, detailed logging for chat requests and responses
 */

import fs from 'node:fs'
import path from 'node:path'
import type { SkillDefinition } from '../../../shared/ipc.js'
import type { AIMessageContent } from '../../providers/index.js'
import { getStorePath } from '../../stores/paths.js'

/**
 * Dump the fully assembled system prompt to a debug file so the exact text sent
 * to the provider is always inspectable without per-source tracking. Overwrites
 * each request; the header records which session/provider produced it.
 */
export function dumpAssembledPrompt(ctx: {
  sessionId: string
  providerId: string
  model: string
  systemPrompt: string
}): void {
  try {
    const dir = path.join(getStorePath(), 'debug')
    fs.mkdirSync(dir, { recursive: true })
    const header = [
      `# ${new Date().toISOString()} | ${ctx.providerId} | ${ctx.model} | session ${ctx.sessionId}`,
      `# ${ctx.systemPrompt.length} chars`,
      '',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(dir, 'last-system-prompt.txt'), header + ctx.systemPrompt, 'utf-8')
  } catch (err) {
    console.warn('[Chat] dumpAssembledPrompt failed:', err)
  }
}

// Separator lines for visual clarity
const DOUBLE_LINE = '═══════════════════════════════════════════════════════════════'
const SINGLE_LINE = '───────────────────────────────────────────────────────────────'

/**
 * Log request start with structured format
 */
export function logRequestStart(ctx: {
  provider: string
  model: string
  systemPromptLength: number
  systemPrompt: string
  messages: Array<{ role: string; content: unknown }>
  tools: Record<string, unknown>
  skills: SkillDefinition[]
  hasTools: boolean
}): void {
  const { provider, model, systemPromptLength, messages, tools, skills, hasTools } = ctx

  console.log(`[Chat] ${DOUBLE_LINE}`)
  console.log(`[Chat] 📤 Request Start`)
  console.log(`[Chat] ${SINGLE_LINE}`)
  console.log(`[Chat] Provider: ${provider} | Model: ${model}`)
  console.log(`[Chat] System Prompt: ${systemPromptLength} chars`)

  // Message stats
  const userMsgCount = messages.filter(m => m.role === 'user').length
  const assistantMsgCount = messages.filter(m => m.role === 'assistant').length
  console.log(`[Chat] Messages: ${messages.length} (user: ${userMsgCount}, assistant: ${assistantMsgCount})`)

  // Tools section
  console.log(`[Chat] ${SINGLE_LINE}`)
  if (hasTools) {
    const toolNames = Object.keys(tools)
    const toolsJson = JSON.stringify(tools)
    const estimatedTokens = Math.round(toolsJson.length / 4) // Rough estimate: ~4 chars per token
    console.log(`[Chat] 🔧 Tools (${toolNames.length}): ${formatToolNames(toolNames)}`)
    console.log(`[Chat]    Size: ${toolsJson.length} chars (~${estimatedTokens} tokens)`)
  } else {
    console.log(`[Chat] 🔧 Tools: disabled or not supported`)
  }

  // Skills section
  console.log(`[Chat] ${SINGLE_LINE}`)
  if (skills.length > 0) {
    const userSkills = skills.filter(s => s.source === 'user').length
    const projectSkills = skills.filter(s => s.source === 'project').length
    const pluginSkills = skills.filter(s => s.source === 'plugin').length
    const skillNames = skills.map(s => s.name)
    console.log(`[Chat] ⚡ Skills (${skills.length}): ${formatSkillNames(skillNames)}`)
    console.log(`[Chat]    Sources: ${userSkills} user, ${projectSkills} project, ${pluginSkills} plugin`)
  } else {
    console.log(`[Chat] ⚡ Skills: none`)
  }

  console.log(`[Chat] ${DOUBLE_LINE}`)
}

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value ?? '').length
  } catch {
    return String(value ?? '').length
  }
}

function contentTextLength(content: unknown): number {
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) {
    return content.reduce((total, part) => {
      if (!part || typeof part !== 'object') return total
      const item = part as Record<string, unknown>
      if (typeof item.text === 'string') return total + item.text.length
      if (typeof item.content === 'string') return total + item.content.length
      if (typeof item.data === 'string') return total + item.data.length
      if (typeof item.image === 'string') return total + item.image.length
      return total + jsonLength(item)
    }, 0)
  }
  return jsonLength(content)
}

export function logMessageBodyShape(
  label: string,
  messages: Array<Record<string, any>>,
  extra: Record<string, unknown> = {},
): void {
  const roleCounts = messages.reduce<Record<string, number>>((counts, message) => {
    const role = typeof message.role === 'string' ? message.role : 'unknown'
    counts[role] = (counts[role] ?? 0) + 1
    return counts
  }, {})

  const rows = messages.map((message, index) => {
    const base = {
      index,
      role: message.role,
      contentChars: contentTextLength(message.content),
    }

    if (message.role === 'assistant') {
      const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : []
      return {
        ...base,
        toolCalls: toolCalls.length,
        toolArgChars: toolCalls.reduce((sum: number, call: any) => sum + jsonLength(call?.args ?? {}), 0),
        reasoningChars: typeof message.reasoningContent === 'string' ? message.reasoningContent.length : 0,
      }
    }

    if (message.role === 'tool') {
      const toolResults = Array.isArray(message.content) ? message.content : []
      return {
        ...base,
        toolResults: toolResults.length,
        resultChars: toolResults.reduce((sum: number, result: any) => sum + jsonLength(result?.result), 0),
      }
    }

    return base
  })

  const totals = rows.reduce((acc, row: any) => {
    acc.contentChars += row.contentChars ?? 0
    acc.toolCalls += row.toolCalls ?? 0
    acc.toolArgChars += row.toolArgChars ?? 0
    acc.toolResults += row.toolResults ?? 0
    acc.toolResultChars += row.resultChars ?? 0
    acc.reasoningChars += row.reasoningChars ?? 0
    return acc
  }, {
    contentChars: 0,
    toolCalls: 0,
    toolArgChars: 0,
    toolResults: 0,
    toolResultChars: 0,
    reasoningChars: 0,
  })

  console.log(`[Chat] ${label}`, {
    ...extra,
    messageCount: messages.length,
    roleCounts,
    totals,
    rows,
  })
}

// Track turn start times for speed calculation
const turnStartTimes = new Map<number, number>()

/**
 * Log turn start within a stream
 */
export function logTurnStart(turnNumber: number): void {
  turnStartTimes.set(turnNumber, Date.now())
  console.log(`[Chat] 🔄 Turn ${turnNumber} starting...`)
}

/**
 * Log turn end with usage and speed
 */
export function logTurnEnd(turnNumber: number, usage: {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}, toolCallCount: number): void {
  const startTime = turnStartTimes.get(turnNumber)
  let speedInfo = ''

  if (startTime) {
    const durationSec = (Date.now() - startTime) / 1000
    if (durationSec > 0) {
      const outputSpeed = (usage.outputTokens / durationSec).toFixed(1)
      speedInfo = ` | ${outputSpeed} tok/s`
    }
    turnStartTimes.delete(turnNumber)
  }

  console.log(`[Chat] ✓ Turn ${turnNumber} complete: ${usage.inputTokens} in, ${usage.outputTokens} out, ${toolCallCount} tools${speedInfo}`)
}

/**
 * Log request end with total stats and speed
 * @param lastTurnUsage - Optional: last turn's usage for context window size display
 */
export function logRequestEnd(
  duration: number,
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number },
  lastTurnUsage?: { inputTokens: number; outputTokens: number }
): void {
  console.log(`[Chat] ${DOUBLE_LINE}`)
  console.log(`[Chat] 📥 Request End`)
  console.log(`[Chat] Duration: ${duration.toFixed(2)}s`)
  if (usage) {
    const outputSpeed = duration > 0 ? (usage.outputTokens / duration).toFixed(1) : '0'
    console.log(`[Chat] Total Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out (${outputSpeed} tok/s)`)
    // Show context window size (last turn's input + output)
    if (lastTurnUsage) {
      const contextSize = lastTurnUsage.inputTokens + lastTurnUsage.outputTokens
      console.log(`[Chat] Context Window: ${lastTurnUsage.inputTokens} in + ${lastTurnUsage.outputTokens} out = ${contextSize}`)
    }
  }
  console.log(`[Chat] ${DOUBLE_LINE}`)
}

/**
 * Log continuation messages being sent for next turn
 * Shows what tool calls were made and their results
 */
export function logContinuationMessages(
  turnNumber: number,
  assistantContent: string,
  toolCalls: Array<{
    toolCallId: string
    toolName: string
    args: Record<string, any>
  }>,
  toolResults: Array<{
    toolCallId: string
    toolName: string
    result: any
  }>
): void {
  console.log(`[Chat] ${SINGLE_LINE}`)
  console.log(`[Chat] 📝 Continuation for Turn ${turnNumber + 1}`)

  // Assistant message summary
  if (assistantContent) {
    const truncated = assistantContent.length > 100
      ? assistantContent.substring(0, 100) + '...'
      : assistantContent
    console.log(`[Chat]    Assistant text: "${truncated}"`)
  }

  // Tool calls made
  console.log(`[Chat]    Tool calls (${toolCalls.length}):`)
  for (const tc of toolCalls) {
    const argsStr = JSON.stringify(tc.args)
    const truncatedArgs = argsStr.length > 200 ? argsStr.substring(0, 200) + '...' : argsStr
    console.log(`[Chat]      - ${tc.toolName} [${tc.toolCallId.substring(0, 8)}...]`)
    console.log(`[Chat]        args: ${truncatedArgs}`)
  }

  // Tool results
  console.log(`[Chat]    Tool results (${toolResults.length}):`)
  for (const tr of toolResults) {
    const resultStr = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result)
    const truncatedResult = resultStr.length > 300 ? resultStr.substring(0, 300) + '...' : resultStr
    console.log(`[Chat]      - ${tr.toolName} [${tr.toolCallId.substring(0, 8)}...]`)
    console.log(`[Chat]        result: ${truncatedResult}`)
  }

  console.log(`[Chat] ${SINGLE_LINE}`)
}

/**
 * Log detailed tool definitions (for debugging)
 */
export function logToolsDetail(tools: Record<string, any>): void {
  console.log(`[Chat] Tool Definitions:`)
  for (const [name, tool] of Object.entries(tools)) {
    const params = tool.parameters || []
    const paramNames = Array.isArray(params)
      ? params.map((p: any) => p.name).join(', ')
      : Object.keys(params.properties || {}).join(', ')
    console.log(`[Chat]   - ${name}: ${tool.description?.substring(0, 80)}...`)
    console.log(`[Chat]     params: ${paramNames || 'none'}`)
  }
}

/**
 * Log detailed skills list (for debugging)
 */
export function logSkillsDetail(skills: SkillDefinition[]): void {
  console.log(`[Chat] Skills Detail:`)
  for (const skill of skills) {
    console.log(`[Chat]   - ${skill.name} (${skill.source}): ${skill.description.substring(0, 60)}...`)
  }
}

/**
 * Format tool names for compact display
 */
function formatToolNames(names: string[], maxDisplay = 8): string {
  if (names.length <= maxDisplay) {
    return names.join(', ')
  }
  const displayed = names.slice(0, maxDisplay)
  return `${displayed.join(', ')}, ... (+${names.length - maxDisplay} more)`
}

/**
 * Format skill names for compact display
 */
function formatSkillNames(names: string[], maxDisplay = 6): string {
  if (names.length <= maxDisplay) {
    return names.join(', ')
  }
  const displayed = names.slice(0, maxDisplay)
  return `${displayed.join(', ')}, ... (+${names.length - maxDisplay} more)`
}
