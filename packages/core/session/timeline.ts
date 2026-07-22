export interface CoreTokenUsage {
  inputTokens: number
  outputTokens?: number
  totalTokens?: number
}

export interface CoreToolCallState {
  status?: string
  /** Set while a tool call is paused awaiting a permission response. */
  requiresConfirmation?: boolean
  error?: string
}

export interface CoreTimelineStep {
  status?: string
  error?: string
  title: string
  usage?: unknown
  turnIndex?: number
  timestamp?: number
  toolCall?: CoreToolCallState
  childSteps?: CoreTimelineStep[]
}

export interface CoreTimelineMessage {
  id: string
  role: string
  content?: string
  timestamp?: number
  isStreaming?: boolean
  usage?: CoreTokenUsage
  steps?: CoreTimelineStep[]
  toolCalls?: CoreToolCallState[]
}

export interface CoreTimelineSession<TMessage extends CoreTimelineMessage = CoreTimelineMessage> {
  id?: string
  messages: TMessage[]
  summary?: string
  summaryUpToMessageId?: string
  summaryCreatedAt?: number
  contextSize?: number
  lastInputTokens?: number
}

export interface TimelineMetadataRepairOptions {
  recomputeContextSize?: boolean
}

const STALE_CONTEXT_COMPACT_MS = 10 * 60 * 1000

export function isTokenUsage(value: unknown): value is CoreTokenUsage {
  if (!value || typeof value !== 'object') return false
  const usage = value as Partial<CoreTokenUsage>
  return Number.isFinite(usage.inputTokens) && usage.inputTokens! >= 0
}

export function getLatestStepUsage(message: CoreTimelineMessage): CoreTokenUsage | undefined {
  let latest:
    | {
        turnIndex: number
        timestamp: number
        usage: CoreTokenUsage
      }
    | undefined

  const visit = (steps: CoreTimelineStep[] | undefined): void => {
    if (!steps) return
    for (const step of steps) {
      if (isTokenUsage(step.usage)) {
        const candidate = {
          turnIndex: step.turnIndex ?? -1,
          timestamp: step.timestamp ?? 0,
          usage: step.usage,
        }
        if (
          !latest ||
          candidate.turnIndex > latest.turnIndex ||
          (candidate.turnIndex === latest.turnIndex && candidate.timestamp >= latest.timestamp)
        ) {
          latest = candidate
        }
      }

      if (Array.isArray(step.childSteps)) {
        visit(step.childSteps)
      }
    }
  }

  visit(message.steps)
  return latest?.usage
}

function hasToolActivity(message: CoreTimelineMessage): boolean {
  return Boolean(
    (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) ||
    (Array.isArray(message.steps) && message.steps.length > 0),
  )
}

function findLatestRetainedAssistant(
  session: Pick<CoreTimelineSession, 'messages' | 'summary' | 'summaryUpToMessageId'>,
): CoreTimelineMessage | undefined {
  const summaryIndex = session.summary && session.summaryUpToMessageId
    ? session.messages.findIndex(message => message.id === session.summaryUpToMessageId)
    : -1
  const startIndex = summaryIndex >= 0 ? summaryIndex + 1 : 0

  for (let index = session.messages.length - 1; index >= startIndex; index--) {
    const message = session.messages[index]
    if (message.role === 'assistant' && !message.isStreaming) return message
  }

  return undefined
}

function hasAccumulatedToolUsageContext(session: CoreTimelineSession): boolean {
  const latestAssistant = findLatestRetainedAssistant(session)
  if (!latestAssistant || !isTokenUsage(latestAssistant.usage)) return false
  if (!hasToolActivity(latestAssistant)) return false
  if (getLatestStepUsage(latestAssistant)) return false

  const inputTokens = Math.max(0, latestAssistant.usage.inputTokens)
  return (session.contextSize ?? 0) === inputTokens || (session.lastInputTokens ?? 0) === inputTokens
}

export function deriveRetainedContextSize(
  session: Pick<CoreTimelineSession, 'messages' | 'summary' | 'summaryUpToMessageId'>,
): number {
  const message = findLatestRetainedAssistant(session)
  if (!message) return 0

  const stepUsage = getLatestStepUsage(message)
  if (isTokenUsage(stepUsage)) {
    return Math.max(0, stepUsage.inputTokens)
  }

  if (isTokenUsage(message.usage)) {
    if (hasToolActivity(message)) return 0
    return Math.max(0, message.usage.inputTokens)
  }

  return 0
}

export function repairSessionTimelineMetadata(
  session: CoreTimelineSession,
  options: TimelineMetadataRepairOptions = {},
): boolean {
  let modified = false
  let clearedSummary = false
  const messageIds = new Set(session.messages.map(message => message.id))
  const hasSummary = typeof session.summary === 'string' && session.summary.length > 0
  const hasSummaryAnchor = typeof session.summaryUpToMessageId === 'string' && session.summaryUpToMessageId.length > 0
  const hasAnySummaryMetadata = hasSummary || hasSummaryAnchor || session.summaryCreatedAt !== undefined
  const summaryAnchorExists = hasSummaryAnchor ? messageIds.has(session.summaryUpToMessageId!) : false

  if (hasAnySummaryMetadata && (!hasSummary || !hasSummaryAnchor || !summaryAnchorExists)) {
    console.warn('[Sessions] Cleared invalid summary metadata after timeline repair:', {
      sessionId: session.id,
      summaryUpToMessageId: session.summaryUpToMessageId,
    })
    delete session.summary
    delete session.summaryUpToMessageId
    delete session.summaryCreatedAt
    clearedSummary = true
    modified = true
  }

  const repairAccumulatedToolUsageContext = hasAccumulatedToolUsageContext(session)
  if (options.recomputeContextSize || clearedSummary || repairAccumulatedToolUsageContext) {
    const contextSize = deriveRetainedContextSize(session)
    const beforeContextSize = session.contextSize ?? 0
    const beforeLastInputTokens = session.lastInputTokens ?? 0
    if (beforeContextSize !== contextSize || beforeLastInputTokens !== contextSize) {
      session.contextSize = contextSize
      session.lastInputTokens = contextSize
      console.log('[SessionUsage] repairSessionTimelineMetadata contextSize', {
        sessionId: session.id,
        source: options.recomputeContextSize
          ? 'timeline-recompute'
          : repairAccumulatedToolUsageContext
            ? 'accumulated-tool-usage-repair'
            : 'summary-metadata-repair',
        summaryUpToMessageId: session.summaryUpToMessageId,
        beforeContextSize,
        beforeLastInputTokens,
        afterContextSize: contextSize,
        afterLastInputTokens: contextSize,
      })
      modified = true
    }
  }

  return modified
}

export function sanitizeInterruptedStepRecursive(step: CoreTimelineStep): boolean {
  let modified = false

  if (step.status === 'running' || step.status === 'pending') {
    step.status = 'failed'
    step.error = step.error || 'Interrupted: app was closed'
    if (step.title.startsWith('Running:') || step.title.startsWith('调用工具:')) {
      step.title = step.title.replace(/^(Running:|调用工具:)\s*/, 'Interrupted: ')
    }
    modified = true
  }
  if (step.status === 'awaiting-confirmation') {
    step.status = 'failed'
    step.error = 'Interrupted: permission request was not answered'
    modified = true
  }
  if (step.toolCall) {
    if (
      step.toolCall.status === 'executing'
      || step.toolCall.status === 'pending'
      || step.toolCall.status === 'received'
      || step.toolCall.status === 'queued'
      || step.toolCall.status === 'input-streaming'
    ) {
      step.toolCall.status = 'cancelled'
      modified = true
    }
    // The permission ask lives only in the dead process's memory — a stale
    // flag here would render an approval card no click can ever satisfy.
    if (step.toolCall.requiresConfirmation) {
      step.toolCall.requiresConfirmation = false
      step.toolCall.error = step.toolCall.error || 'Interrupted: permission request was not answered'
      modified = true
    }
  }

  if (step.childSteps?.length) {
    for (const childStep of step.childSteps) {
      if (sanitizeInterruptedStepRecursive(childStep)) {
        modified = true
      }
    }
  }

  return modified
}

export function sanitizeLoadedSession(session: CoreTimelineSession): boolean {
  let modified = false

  for (const message of session.messages) {
    if (message.isStreaming) {
      message.isStreaming = false
      modified = true
    }
  }

  if (repairSessionTimelineMetadata(session)) {
    modified = true
  }

  return modified
}

export function sanitizeSessionOnStartup(session: CoreTimelineSession): boolean {
  let modified = false
  const now = Date.now()

  for (const message of session.messages) {
    if (message.isStreaming) {
      message.isStreaming = false
      modified = true
    }

    if (message.steps) {
      for (const step of message.steps) {
        if (sanitizeInterruptedStepRecursive(step)) {
          modified = true
        }
      }
    }

    if (message.toolCalls) {
      for (const toolCall of message.toolCalls) {
        if (
          toolCall.status === 'executing'
          || toolCall.status === 'pending'
          || toolCall.status === 'received'
          || toolCall.status === 'queued'
          || toolCall.status === 'input-streaming'
        ) {
          toolCall.status = 'cancelled'
          modified = true
        }
        // Permission asks never survive a restart; a persisted flag is stale
        // by definition and would gate a dead approval card in the UI.
        if (toolCall.requiresConfirmation) {
          toolCall.requiresConfirmation = false
          toolCall.error = toolCall.error || 'Interrupted: permission request was not answered'
          modified = true
        }
      }
    }

    if (sanitizeStaleContextCompactMessage(message, now)) {
      modified = true
    }
  }

  if (repairSessionTimelineMetadata(session)) {
    modified = true
  }

  return modified
}

function sanitizeStaleContextCompactMessage(message: CoreTimelineMessage, now: number): boolean {
  if (message.role !== 'system' || typeof message.content !== 'string') return false
  if (!message.content.includes('"context-compact"') || !message.content.includes('"compacting"')) return false
  const timestamp = typeof message.timestamp === 'number' ? message.timestamp : 0
  if (timestamp > 0 && now - timestamp < STALE_CONTEXT_COMPACT_MS) return false

  try {
    const parsed = JSON.parse(message.content) as {
      type?: string
      status?: string
      summary?: string
      compactedMessageCount?: number
      error?: string
    }
    if (parsed.type !== 'context-compact' || parsed.status !== 'compacting') return false
    message.content = JSON.stringify({
      type: 'context-compact',
      status: 'failed',
      summary: parsed.summary ?? '',
      error: 'Context compact was interrupted before completion.',
      compactedMessageCount: parsed.compactedMessageCount ?? 0,
    })
    return true
  } catch {
    return false
  }
}
