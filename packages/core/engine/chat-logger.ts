export type CoreChatLogValue = string | number | boolean | null | undefined | object
export type CoreChatLogRecord = { [key: string]: CoreChatLogValue }

export type CoreChatLogToolCall = {
  toolCallId?: string
  toolName?: string
  args?: CoreChatLogValue
}

export type CoreChatLogToolResult = {
  type?: string
  toolCallId?: string
  toolName?: string
  result?: CoreChatLogValue
}

export type CoreChatLogMessageShape = {
  role: string
  content: CoreChatLogValue
  toolCalls?: CoreChatLogToolCall[]
  reasoningContent?: string
}

export type CoreChatLogRow = {
  index: number
  role: string
  contentChars: number
  toolCalls?: number
  toolArgChars?: number
  toolResults?: number
  resultChars?: number
  reasoningChars?: number
}

export type CoreChatLogTotals = {
  contentChars: number
  toolCalls: number
  toolArgChars: number
  toolResults: number
  toolResultChars: number
  reasoningChars: number
}

export type CoreToolDefinitionForLog = {
  description?: string
  parameters?: CoreChatLogValue
}

export type CoreSkillDefinitionForLog = {
  name: string
  description: string
  source?: string
}

export const CHAT_LOG_DOUBLE_LINE = '═══════════════════════════════════════════════════════════════'
export const CHAT_LOG_SINGLE_LINE = '───────────────────────────────────────────────────────────────'

export function buildAssembledPromptDump(ctx: {
  sessionId: string
  providerId: string
  model: string
  systemPrompt: string
  nowIso: string
}): string {
  const header = [
    `# ${ctx.nowIso} | ${ctx.providerId} | ${ctx.model} | session ${ctx.sessionId}`,
    `# ${ctx.systemPrompt.length} chars`,
    '',
    '',
  ].join('\n')
  return header + ctx.systemPrompt
}

export function buildRequestStartLogLines(ctx: {
  provider: string
  model: string
  systemPromptLength: number
  messages: Array<{ role: string; content: CoreChatLogValue }>
  tools: Record<string, CoreChatLogValue>
  skills: CoreSkillDefinitionForLog[]
  hasTools: boolean
}): string[] {
  const { provider, model, systemPromptLength, messages, tools, skills, hasTools } = ctx
  const lines = [
    `[Chat] ${CHAT_LOG_DOUBLE_LINE}`,
    '[Chat] 📤 Request Start',
    `[Chat] ${CHAT_LOG_SINGLE_LINE}`,
    `[Chat] Provider: ${provider} | Model: ${model}`,
    `[Chat] System Prompt: ${systemPromptLength} chars`,
  ]

  const userMsgCount = messages.filter(m => m.role === 'user').length
  const assistantMsgCount = messages.filter(m => m.role === 'assistant').length
  lines.push(`[Chat] Messages: ${messages.length} (user: ${userMsgCount}, assistant: ${assistantMsgCount})`)

  lines.push(`[Chat] ${CHAT_LOG_SINGLE_LINE}`)
  if (hasTools) {
    const toolNames = Object.keys(tools)
    const toolsJson = JSON.stringify(tools)
    const estimatedTokens = Math.round(toolsJson.length / 4)
    lines.push(`[Chat] 🔧 Tools (${toolNames.length}): ${formatToolNames(toolNames)}`)
    lines.push(`[Chat]    Size: ${toolsJson.length} chars (~${estimatedTokens} tokens)`)
  } else {
    lines.push('[Chat] 🔧 Tools: disabled or not supported')
  }

  lines.push(`[Chat] ${CHAT_LOG_SINGLE_LINE}`)
  if (skills.length > 0) {
    const userSkills = skills.filter(s => s.source === 'user').length
    const projectSkills = skills.filter(s => s.source === 'project').length
    const pluginSkills = skills.filter(s => s.source === 'plugin').length
    const skillNames = skills.map(s => s.name)
    lines.push(`[Chat] ⚡ Skills (${skills.length}): ${formatSkillNames(skillNames)}`)
    lines.push(`[Chat]    Sources: ${userSkills} user, ${projectSkills} project, ${pluginSkills} plugin`)
  } else {
    lines.push('[Chat] ⚡ Skills: none')
  }

  lines.push(`[Chat] ${CHAT_LOG_DOUBLE_LINE}`)
  return lines
}

export function chatLogJsonLength(value: CoreChatLogValue): number {
  try {
    return JSON.stringify(value ?? '').length
  } catch {
    return String(value ?? '').length
  }
}

export function chatLogContentTextLength(content: CoreChatLogValue): number {
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) {
    return content.reduce((total, part) => {
      if (!part || typeof part !== 'object') return total
      const item = part as CoreChatLogRecord
      if (typeof item.text === 'string') return total + item.text.length
      if (typeof item.content === 'string') return total + item.content.length
      if (typeof item.data === 'string') return total + item.data.length
      if (typeof item.image === 'string') return total + item.image.length
      return total + chatLogJsonLength(item)
    }, 0)
  }
  return chatLogJsonLength(content)
}

export function buildMessageBodyShapePayload(
  messages: CoreChatLogMessageShape[],
  extra: Record<string, CoreChatLogValue> = {},
): {
  messageCount: number
  roleCounts: Record<string, number>
  totals: CoreChatLogTotals
  rows: CoreChatLogRow[]
} & Record<string, CoreChatLogValue> {
  const roleCounts = messages.reduce<Record<string, number>>((counts, message) => {
    const role = typeof message.role === 'string' ? message.role : 'unknown'
    counts[role] = (counts[role] ?? 0) + 1
    return counts
  }, {})

  const rows: CoreChatLogRow[] = messages.map((message, index) => {
    const base = {
      index,
      role: message.role,
      contentChars: chatLogContentTextLength(message.content),
    }

    if (message.role === 'assistant') {
      const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : []
      return {
        ...base,
        toolCalls: toolCalls.length,
        toolArgChars: toolCalls.reduce((sum, call) => sum + chatLogJsonLength(call.args ?? {}), 0),
        reasoningChars: typeof message.reasoningContent === 'string' ? message.reasoningContent.length : 0,
      }
    }

    if (message.role === 'tool') {
      const toolResults = Array.isArray(message.content) ? message.content : []
      return {
        ...base,
        toolResults: toolResults.length,
        resultChars: toolResults.reduce((sum, result) => {
          const record = result && typeof result === 'object' ? result as CoreChatLogToolResult : undefined
          return sum + chatLogJsonLength(record?.result ?? null)
        }, 0),
      }
    }

    return base
  })

  const totals = rows.reduce<CoreChatLogTotals>((acc, row) => {
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

  return {
    ...extra,
    messageCount: messages.length,
    roleCounts,
    totals,
    rows,
  }
}

export function buildTurnEndLogLine(
  turnNumber: number,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  toolCallCount: number,
  durationMs?: number,
): string {
  let speedInfo = ''

  if (typeof durationMs === 'number') {
    const durationSec = durationMs / 1000
    if (durationSec > 0) {
      const outputSpeed = (usage.outputTokens / durationSec).toFixed(1)
      speedInfo = ` | ${outputSpeed} tok/s`
    }
  }

  return `[Chat] ✓ Turn ${turnNumber} complete: ${usage.inputTokens} in, ${usage.outputTokens} out, ${toolCallCount} tools${speedInfo}`
}

export class CoreChatTurnTimer {
  private readonly turnStartTimes = new Map<number, number>()

  constructor(private readonly now: () => number = () => Date.now()) {}

  startTurn(turnNumber: number): string {
    this.turnStartTimes.set(turnNumber, this.now())
    return `[Chat] 🔄 Turn ${turnNumber} starting...`
  }

  endTurn(
    turnNumber: number,
    usage: { inputTokens: number; outputTokens: number; totalTokens: number },
    toolCallCount: number,
  ): string {
    const startTime = this.turnStartTimes.get(turnNumber)
    const durationMs = startTime ? this.now() - startTime : undefined
    if (startTime) {
      this.turnStartTimes.delete(turnNumber)
    }
    return buildTurnEndLogLine(turnNumber, usage, toolCallCount, durationMs)
  }

  clear(): void {
    this.turnStartTimes.clear()
  }
}

export function buildRequestEndLogLines(
  duration: number,
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number },
  lastTurnUsage?: { inputTokens: number; outputTokens: number },
): string[] {
  const lines = [
    `[Chat] ${CHAT_LOG_DOUBLE_LINE}`,
    '[Chat] 📥 Request End',
    `[Chat] Duration: ${duration.toFixed(2)}s`,
  ]
  if (usage) {
    const outputSpeed = duration > 0 ? (usage.outputTokens / duration).toFixed(1) : '0'
    lines.push(`[Chat] Total Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out (${outputSpeed} tok/s)`)
    if (lastTurnUsage) {
      const contextSize = lastTurnUsage.inputTokens + lastTurnUsage.outputTokens
      lines.push(`[Chat] Context Window: ${lastTurnUsage.inputTokens} in + ${lastTurnUsage.outputTokens} out = ${contextSize}`)
    }
  }
  lines.push(`[Chat] ${CHAT_LOG_DOUBLE_LINE}`)
  return lines
}

export function buildContinuationMessageLogLines(
  turnNumber: number,
  assistantContent: string,
  toolCalls: Array<{
    toolCallId: string
    toolName: string
    args: object
  }>,
  toolResults: Array<{
    toolCallId: string
    toolName: string
    result: CoreChatLogValue
  }>,
): string[] {
  const lines = [
    `[Chat] ${CHAT_LOG_SINGLE_LINE}`,
    `[Chat] 📝 Continuation for Turn ${turnNumber + 1}`,
  ]

  if (assistantContent) {
    const truncated = assistantContent.length > 100
      ? assistantContent.substring(0, 100) + '...'
      : assistantContent
    lines.push(`[Chat]    Assistant text: "${truncated}"`)
  }

  lines.push(`[Chat]    Tool calls (${toolCalls.length}):`)
  for (const tc of toolCalls) {
    const argsStr = JSON.stringify(tc.args)
    const truncatedArgs = argsStr.length > 200 ? argsStr.substring(0, 200) + '...' : argsStr
    lines.push(`[Chat]      - ${tc.toolName} [${tc.toolCallId.substring(0, 8)}...]`)
    lines.push(`[Chat]        args: ${truncatedArgs}`)
  }

  lines.push(`[Chat]    Tool results (${toolResults.length}):`)
  for (const tr of toolResults) {
    const resultStr = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result)
    const truncatedResult = resultStr.length > 300 ? resultStr.substring(0, 300) + '...' : resultStr
    lines.push(`[Chat]      - ${tr.toolName} [${tr.toolCallId.substring(0, 8)}...]`)
    lines.push(`[Chat]        result: ${truncatedResult}`)
  }

  lines.push(`[Chat] ${CHAT_LOG_SINGLE_LINE}`)
  return lines
}

export function buildToolsDetailLogLines(tools: Record<string, CoreToolDefinitionForLog>): string[] {
  const lines = ['[Chat] Tool Definitions:']
  for (const [name, tool] of Object.entries(tools)) {
    const params = tool.parameters || []
    const paramNames = Array.isArray(params)
      ? params
          .map((param) => {
            const record = param && typeof param === 'object' ? param as CoreChatLogRecord : undefined
            return typeof record?.name === 'string' ? record.name : ''
          })
          .filter(Boolean)
          .join(', ')
      : params && typeof params === 'object'
        ? Object.keys((params as { properties?: object }).properties || {}).join(', ')
        : ''
    lines.push(`[Chat]   - ${name}: ${tool.description?.substring(0, 80)}...`)
    lines.push(`[Chat]     params: ${paramNames || 'none'}`)
  }
  return lines
}

export function buildSkillsDetailLogLines(skills: CoreSkillDefinitionForLog[]): string[] {
  const lines = ['[Chat] Skills Detail:']
  for (const skill of skills) {
    lines.push(`[Chat]   - ${skill.name} (${skill.source}): ${skill.description.substring(0, 60)}...`)
  }
  return lines
}

export function formatToolNames(names: string[], maxDisplay = 8): string {
  if (names.length <= maxDisplay) {
    return names.join(', ')
  }
  const displayed = names.slice(0, maxDisplay)
  return `${displayed.join(', ')}, ... (+${names.length - maxDisplay} more)`
}

export function formatSkillNames(names: string[], maxDisplay = 6): string {
  if (names.length <= maxDisplay) {
    return names.join(', ')
  }
  const displayed = names.slice(0, maxDisplay)
  return `${displayed.join(', ')}, ... (+${names.length - maxDisplay} more)`
}
