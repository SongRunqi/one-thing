import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentLoopToolResult,
  AgentMessage,
  AgentTool,
  AgentToolCall,
  AgentJsonObject,
  AgentJsonValue,
  AgentToolResult,
  AgentUsage,
  AgentFinishReason,
  AgentTurnRequest,
  AgentTurn,
  AgentTurnHookResult,
  AgentTurnHookReplacement,
  AgentToolPolicy,
  AgentStreamEvent,
  AgentTurnStreamEvent,
  AgentProviderData,
} from './types.js'
import {
  agentContentToText,
  createAgentAbortError,
  runWithAgentAbort,
  streamAgentProviderTurnEvents,
  throwIfAgentAborted,
} from './stream.js'
import { applyPromptInjectors, createSkillPromptInjector } from './prompts.js'
import { AgentLoopPauseForConfirmationError, isAgentLoopPauseForConfirmationError } from './errors.js'
import { agentToolResultToMessageContentForCapabilities } from './tool-results.js'
import {
  assertAgentProviderCanRunTurn,
  agentSupportsTools,
  assertAgentOutputModalitiesSupportedByCapabilities,
  assertAgentMessagesSupportedByCapabilities,
  resolveAgentModelCapabilities,
} from './capabilities.js'
import { toolCallSignature } from './tool-signature.js'
import { MAX_TURN_RETRIES, turnRetryDelayMs, isRetryableAgentError, sleepWithAbort } from './retry.js'
import { ToolExecutionScheduler } from './tool-execution-scheduler.js'

const DEFAULT_MAX_TURNS = 8
const DEFAULT_MAX_CONCURRENT_TOOLS = 8
/** Identical call failed this many times consecutively → block the next one. */
const DOOM_LOOP_FAILURE_THRESHOLD = 3

// Safety net for provider-side tool-call loss: when a turn claims tool_calls
// but yields zero valid calls, the model is nudged to re-send at most this
// many times per run before the turn is allowed to end normally.
const MAX_NO_VALID_TOOL_CALL_NUDGES = 2
const NO_VALID_TOOL_CALL_NUDGE =
  'Your response declared tool calls, but no valid tool call was received. ' +
  'Re-send the complete tool call (tool name and full arguments). ' +
  'If you no longer need a tool, answer directly instead.'

const FINAL_TURN_NOTICE =
  'This is the final turn of this run (the turn limit is reached after it). ' +
  'Wrap up now: summarize what has been done, the current state, and the ' +
  'concrete next steps so the work can be resumed.'

/**
 * FIFO semaphore: at most `limit` wrapped operations run at once. Scoped to
 * one runAgentLoop invocation, so the cap is per stream.
 *
 * A releasing task hands its slot directly to the oldest waiter (`active`
 * stays counted for the handoff), so a synchronously arriving newcomer can
 * never barge past the cap while a woken waiter is still resuming.
 */
function createConcurrencyGate(limit: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiters: (() => void)[] = []

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= limit) {
      await new Promise<void>(resolve => waiters.push(resolve))
    } else {
      active += 1
    }
    try {
      return await fn()
    } finally {
      const next = waiters.shift()
      if (next) next()
      else active -= 1
    }
  }
}

interface ExecuteProviderTurnOptions {
  request: AgentTurnRequest
  provider: AgentLoopOptions['provider']
  /**
   * Invoked when a tool call's arguments are complete, subject to execution
   * ordering: tools declared executionMode 'parallel' run concurrently within
   * their segment, while every other tool is a barrier — it waits for all
   * earlier calls to settle and blocks later ones. Executions are not awaited
   * inside the stream loop; rejections (abort / pause-for-confirmation) are
   * collected and rethrown after every execution has settled. Never invoked
   * for externally-executed tool calls.
   */
  onToolCallDone: (toolCall: AgentToolCall) => Promise<void>
  /**
   * Result of a tool the provider executed itself (`externallyExecuted`
   * calls). The loop records it for observability but never synthesizes a
   * tool message from it.
   */
  onExternalToolResult?: (toolCall: AgentToolCall, result: AgentToolResult) => void
}

interface ToolExecutionFailure {
  index: number
  error: Error
}

function throwPrioritizedTurnError(
  failures: ToolExecutionFailure[],
  streamError: unknown,
): void {
  const ordered = [...failures].sort((a, b) => a.index - b.index)
  const abortFailure = ordered.find(failure => isAbortError(failure.error))
  if (abortFailure) throw abortFailure.error
  if (streamError) throw streamError
  const pauseFailure = ordered.find(failure => isAgentLoopPauseForConfirmationError(failure.error))
  if (pauseFailure) throw pauseFailure.error
  if (ordered.length > 0) throw ordered[0].error
}

function isAbortError(error: Error): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function normalizeTurnHookResult(
  result: Awaited<AgentTurnHookResult>,
): AgentTurnHookReplacement | undefined {
  if (!result) return undefined
  return Array.isArray(result) ? { messages: result } : result
}

function parseToolArguments(call: AgentToolCall): AgentJsonObject {
  const raw = call.arguments.trim()
  if (!raw) return {}
  const parsed = JSON.parse(raw) as AgentJsonValue
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Tool arguments for ${call.name} must be a JSON object`)
  }
  return parsed
}

function safeParseToolArguments(call: AgentToolCall): AgentJsonObject {
  try {
    return parseToolArguments(call)
  } catch {
    // Unparseable args still deserve a stable signature: identical broken
    // retries should trip the doom-loop guard too.
    return { __rawArguments: call.arguments }
  }
}

function addOptionalTokens(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined
  return (a ?? 0) + (b ?? 0)
}

function addUsage(a: AgentUsage | undefined, b: AgentUsage | undefined): AgentUsage | undefined {
  if (!a) return b
  if (!b) return a
  const cacheReadTokens = addOptionalTokens(a.cacheReadTokens, b.cacheReadTokens)
  const cacheWriteTokens = addOptionalTokens(a.cacheWriteTokens, b.cacheWriteTokens)
  const reasoningTokens = addOptionalTokens(a.reasoningTokens, b.reasoningTokens)
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
  }
}

function selectedTools(
  tools: AgentTool[] = [],
  selectedToolNames?: string[],
  policy: AgentToolPolicy = {},
): AgentTool[] {
  if (policy.enabled === false) return []

  const allowed = new Set(policy.allowedToolNames ?? selectedToolNames ?? [])
  const blocked = new Set(policy.blockedToolNames ?? [])

  return tools.filter(tool => {
    if (blocked.has(tool.name)) return false
    if (allowed.size > 0 && !allowed.has(tool.name)) return false
    return true
  })
}

function resolveToolChoice(
  tools: AgentTool[],
  requested: AgentLoopOptions['toolChoice'],
): AgentLoopOptions['toolChoice'] {
  if (tools.length === 0) return 'none'
  if (!requested) return 'auto'
  if (requested === 'auto' || requested === 'none') return requested

  const requestedName = requested.function.name
  return tools.some(tool => tool.name === requestedName)
    ? requested
    : 'none'
}

async function executeAgentToolCall(input: {
  options: AgentLoopOptions
  toolMap: Map<string, AgentTool>
  turn: number
  toolCall: AgentToolCall
}): Promise<AgentToolResult> {
  const { options, toolMap, turn, toolCall } = input
  throwIfAgentAborted(options.abortSignal)
  const tool = toolMap.get(toolCall.name)

  if (!tool) {
    return { content: '', error: `Tool not available: ${toolCall.name}` }
  }

  try {
    const args = parseToolArguments(toolCall)
    return await runWithAgentAbort(options.abortSignal, () =>
      tool.execute(args, {
        sessionId: options.sessionId,
        messageId: options.messageId,
        toolCallId: toolCall.id,
        workingDirectory: options.workingDirectory,
        abortSignal: options.abortSignal,
        onMetadata(update) {
          options.onEvent?.({ type: 'tool-metadata', turn, toolCall, update })
        },
        onPartialResult(update) {
          options.onEvent?.({ type: 'tool-partial-result', turn, toolCall, update })
        },
      }))
  } catch (error) {
    const caught = error instanceof Error ? error : new Error(String(error))
    if (options.abortSignal?.aborted || isAbortError(caught)) {
      throw isAbortError(caught) ? caught : createAgentAbortError()
    }
    return {
      content: '',
      error: caught.message,
    }
  }
}

async function executeProviderTurn(options: ExecuteProviderTurnOptions): Promise<AgentTurn> {
  const { request, provider, onToolCallDone, onExternalToolResult } = options
  if (provider.streamTurn || provider.runTurn) {
    let content = ''
    let reasoningContent = ''
    let finishReason: AgentTurn['finishReason'] = 'unknown'
    let usage: AgentTurn['usage']
    let pendingFinishEvent: Extract<AgentStreamEvent, { type: 'finish' }> | null = null
    const toolCalls: AgentToolCall[] = []
    const providerData: AgentProviderData[] = []
    const toolExecutions: Promise<void>[] = []
    const toolFailures: ToolExecutionFailure[] = []
    // Execution-order guard for this turn: only tools declared
    // executionMode 'parallel' may overlap; everything else (including
    // undeclared) is a barrier. Prevents e.g. a read racing an edit of the
    // same file and observing pre-edit bytes.
    const scheduler = new ToolExecutionScheduler()
    const toolsByName = new Map((request.tools ?? []).map(tool => [tool.name, tool]))

    const collectEvent = (event: AgentTurnStreamEvent): void => {
      // Tool observation events are only valid from the provider when it
      // executed the tool itself; drop the rest so a misbehaving provider
      // cannot spoof results for locally executed tools.
      if (
        (event.type === 'tool-result'
          || event.type === 'tool-metadata'
          || event.type === 'tool-partial-result')
        && !event.toolCall.externallyExecuted
      ) {
        return
      }

      request.onEvent?.(event)

      switch (event.type) {
        case 'text-delta':
          content += event.delta
          break
        case 'reasoning-delta':
          reasoningContent += event.delta
          break
        case 'tool-call-done': {
          // Defensive: a provider re-emitting the same tool call id would
          // otherwise double-execute and overwrite the first result.
          if (toolCalls.some(call => call.id === event.toolCall.id)) break
          toolCalls.push(event.toolCall)
          // Externally-executed calls already ran inside the provider; the
          // loop only records them and awaits the provider's tool-result.
          if (event.toolCall.externallyExecuted) break
          const index = toolExecutions.length
          const barrier = toolsByName.get(event.toolCall.name)?.executionMode !== 'parallel'
          toolExecutions.push(
            scheduler
              .enqueue(() => onToolCallDone(event.toolCall), { barrier })
              .catch((error: unknown) => {
                toolFailures.push({
                  index,
                  error: error instanceof Error ? error : new Error(String(error)),
                })
              }),
          )
          break
        }
        case 'tool-result':
          onExternalToolResult?.(event.toolCall, event.result)
          break
        case 'provider-data':
          providerData.push(event.providerData)
          break
        default:
          break
      }
    }

    let streamError: unknown
    try {
      for await (const event of streamAgentProviderTurnEvents(provider, { ...request, onEvent: undefined })) {
        if (event.type === 'finish') {
          finishReason = event.finishReason
          usage = event.usage
          pendingFinishEvent = event
          continue
        }

        collectEvent(event)
      }
    } catch (error) {
      streamError = error
    }

    // Converge before deciding the turn's fate: every execution settles first,
    // so an abort or pause never strands still-running siblings.
    await Promise.all(toolExecutions)
    throwPrioritizedTurnError(toolFailures, streamError)

    if (pendingFinishEvent) {
      request.onEvent?.(pendingFinishEvent)
    }

    return {
      message: {
        role: 'assistant',
        content,
        ...(reasoningContent ? { reasoningContent } : {}),
        ...(providerData.length ? { providerData } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
      },
      finishReason,
      usage,
    }
  }
  throw new Error(`Agent provider ${provider.id} does not implement streamTurn or runTurn`)
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  throwIfAgentAborted(options.abortSignal)
  assertAgentProviderCanRunTurn(options.provider)
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS
  const capabilities = await resolveAgentModelCapabilities(options.provider, options.model)
  assertAgentOutputModalitiesSupportedByCapabilities(options.requestedOutputModalities, capabilities)
  const tools = agentSupportsTools(capabilities)
    ? selectedTools(options.tools, options.selectedToolNames, options.toolPolicy)
    : []
  const baseMessages: AgentMessage[] = options.messages.map(message => ({ ...message }))
  const skills = options.skills ?? []
  const injectSkillPrompts = options.injectSkillPrompts ?? true
  const promptInjectors = [
    ...(injectSkillPrompts && skills.length > 0 ? [createSkillPromptInjector()] : []),
    ...(options.promptInjectors ?? []),
  ]
  let messages = await runWithAgentAbort(options.abortSignal, () =>
    applyPromptInjectors(
      baseMessages,
      promptInjectors,
      {
        provider: options.provider,
        model: options.model,
        messages: baseMessages,
        tools,
        skills,
        workingDirectory: options.workingDirectory,
        abortSignal: options.abortSignal,
      },
    ))
  assertAgentMessagesSupportedByCapabilities(messages, capabilities)
  const toolMap = new Map(tools.map(tool => [tool.name, tool]))
  const allToolResults: AgentLoopToolResult[] = []
  const runGated = createConcurrencyGate(
    Math.max(1, options.maxConcurrentTools ?? DEFAULT_MAX_CONCURRENT_TOOLS),
  )
  // Doom-loop guard: only *consecutively failing* identical (name + args)
  // calls count toward the block — a model stuck retrying the same failing
  // call gets an error instead of burning turns, while legitimate repeated
  // polling (e.g. BashOutput with the same job id succeeding each time)
  // never accumulates. A success resets its signature.
  const toolFailureSignatureCounts = new Map<string, number>()
  let noValidToolCallNudges = 0
  let finalText = ''
  let finalReasoning = ''
  let finishReason: AgentFinishReason = 'unknown'
  let usage: AgentUsage | undefined

  for (let turn = 1; turn <= maxTurns; turn++) {
    throwIfAgentAborted(options.abortSignal)
    const beforeTurnResult = await runWithAgentAbort(options.abortSignal, () => options.beforeTurn?.({
      provider: options.provider,
      model: options.model,
      messages,
      tools,
      skills,
      turn,
      workingDirectory: options.workingDirectory,
      abortSignal: options.abortSignal,
    }))
    throwIfAgentAborted(options.abortSignal)
    const beforeTurnReplacement = normalizeTurnHookResult(beforeTurnResult)
    if (beforeTurnReplacement) {
      messages = beforeTurnReplacement.messages.map(message => ({ ...message }))
      assertAgentMessagesSupportedByCapabilities(messages, capabilities)
      // Steering interrupt: an injected user message ends the current
      // response — the boundary must reach the host before this turn's
      // turn-start so the answer lands in a fresh assistant message.
      if (beforeTurnReplacement.startNewResponse) {
        options.onEvent?.({ type: 'response-boundary', turn })
      }
    }

    // Give the model a chance to wrap up instead of being cut off silently
    // when the run hits the turn limit.
    if (turn === maxTurns && maxTurns > 1) {
      messages.push({ role: 'user', content: FINAL_TURN_NOTICE })
    }

    options.onEvent?.({ type: 'turn-start', turn })

    const resultsByToolCallId = new Map<string, AgentToolResult>()
    const runProviderTurn = () => runWithAgentAbort(options.abortSignal, () =>
      executeProviderTurn({
        request: {
          model: options.model,
          messages,
          tools,
          toolChoice: resolveToolChoice(tools, options.toolChoice),
          requestedOutputModalities: options.requestedOutputModalities,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          thinking: options.thinking,
          reasoningEffort: options.reasoningEffort,
          abortSignal: options.abortSignal,
          onEvent: options.onEvent,
          turn,
        },
        provider: options.provider,
        onExternalToolResult: (toolCall, result) => {
          allToolResults.push({ toolCall, result })
        },
        onToolCallDone: async (toolCall) => {
          const signature = toolCallSignature(toolCall.name, safeParseToolArguments(toolCall))
          const priorFailures = toolFailureSignatureCounts.get(signature) ?? 0
          let result: AgentToolResult
          if (priorFailures >= DOOM_LOOP_FAILURE_THRESHOLD) {
            result = {
              content: '',
              error: `Repeated identical tool call detected (${toolCall.name} failed ${priorFailures} times with the same arguments). Stop and reassess instead of retrying the same arguments.`,
            }
          } else {
            result = await runGated(() => executeAgentToolCall({
              options,
              toolMap,
              turn,
              toolCall,
            }))
            if (result.error && !result.aborted) {
              toolFailureSignatureCounts.set(signature, priorFailures + 1)
            } else if (!result.error) {
              toolFailureSignatureCounts.delete(signature)
            }
          }

          resultsByToolCallId.set(toolCall.id, result)
          options.onEvent?.({ type: 'tool-result', turn, toolCall, result })
          if (options.abortSignal?.aborted || result.aborted) {
            throw createAgentAbortError()
          }
          if (result.requiresConfirmation) {
            throw new AgentLoopPauseForConfirmationError(toolCall, result)
          }
        },
      }))

    // Turn-level auto-retry for transient provider failures (network cuts,
    // overload, 5xx). Only retries while no tool has executed in the failed
    // attempt: re-running the request after a mutation could double-execute.
    const retryDelays = options.turnRetryDelaysMs
      ?? Array.from({ length: MAX_TURN_RETRIES }, (_, i) => turnRetryDelayMs(i + 1))
    let agentTurn: Awaited<ReturnType<typeof runProviderTurn>>
    for (let attempt = 0; ; attempt++) {
      try {
        agentTurn = await runProviderTurn()
        break
      } catch (error) {
        if (
          attempt >= retryDelays.length
          || resultsByToolCallId.size > 0
          || !isRetryableAgentError(error)
        ) {
          throw error
        }
        const delayMs = retryDelays[attempt]
        options.onEvent?.({
          type: 'auto-retry',
          turn,
          attempt: attempt + 1,
          maxAttempts: retryDelays.length,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        })
        await sleepWithAbort(delayMs, options.abortSignal)
        throwIfAgentAborted(options.abortSignal)
      }
    }
    throwIfAgentAborted(options.abortSignal)

    // Tool messages must mirror the assistant's declaration order, not the
    // concurrent completion order. Externally-executed calls never get a
    // tool message: their results live inside the provider's own transcript.
    const pendingToolMessages: AgentMessage[] = []
    for (const toolCall of agentTurn.message.toolCalls ?? []) {
      if (toolCall.externallyExecuted) continue
      const result = resultsByToolCallId.get(toolCall.id)
      if (!result) continue
      allToolResults.push({ toolCall, result })
      pendingToolMessages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: agentToolResultToMessageContentForCapabilities(result, capabilities),
      })
    }

    // Per-round trace observation: `messages` still holds exactly what this
    // round's request carried (outputs are appended below). Errors in the
    // observer must never break the loop.
    if (options.onTurnTrace) {
      try {
        options.onTurnTrace({
          turn,
          sessionId: options.sessionId,
          messageId: options.messageId,
          request: {
            model: options.model,
            messages,
            tools,
            toolChoice: resolveToolChoice(tools, options.toolChoice),
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            thinking: options.thinking,
            reasoningEffort: options.reasoningEffort,
          },
          response: agentTurn,
          toolResultMessages: pendingToolMessages,
        })
      } catch {
        // Observation must not affect the loop
      }
    }

    messages.push(agentTurn.message)
    messages.push(...pendingToolMessages)
    assertAgentMessagesSupportedByCapabilities(messages, capabilities)
    finalText = agentContentToText(agentTurn.message.content)
    finalReasoning = agentTurn.message.reasoningContent ?? ''
    finishReason = agentTurn.finishReason
    usage = addUsage(usage, agentTurn.usage)
    options.onEvent?.({ type: 'turn-end', turn, finishReason, usage: agentTurn.usage })

    // Externally-executed calls must not trigger another round: the provider
    // already ran its full tool loop internally and the turn is complete.
    const continuationToolCalls = (agentTurn.message.toolCalls ?? [])
      .filter(call => !call.externallyExecuted)
    if (continuationToolCalls.length === 0) {
      // Provider claimed tool_calls but produced no valid call (stream
      // interruption, malformed call, accumulator loss): nudge the model to
      // re-send instead of silently ending the run.
      if (
        finishReason === 'tool_calls'
        && (agentTurn.message.toolCalls ?? []).length === 0
        && noValidToolCallNudges < MAX_NO_VALID_TOOL_CALL_NUDGES
      ) {
        noValidToolCallNudges += 1
        messages.push({ role: 'user', content: NO_VALID_TOOL_CALL_NUDGE })
        continue
      }

      const afterTurnResult = await runWithAgentAbort(options.abortSignal, () => options.afterTurn?.({
        provider: options.provider,
        model: options.model,
        messages,
        tools,
        skills,
        turn,
        turnResult: agentTurn,
        workingDirectory: options.workingDirectory,
        abortSignal: options.abortSignal,
      }))
      throwIfAgentAborted(options.abortSignal)
      const afterTurnReplacement = normalizeTurnHookResult(afterTurnResult)
      if (afterTurnReplacement) {
        messages = afterTurnReplacement.messages.map(message => ({ ...message }))
        assertAgentMessagesSupportedByCapabilities(messages, capabilities)
        if (afterTurnReplacement.startNewResponse) {
          options.onEvent?.({ type: 'response-boundary', turn })
        }
        continue
      }

      return {
        messages,
        text: finalText,
        reasoning: finalReasoning,
        finishReason,
        turns: turn,
        toolResults: allToolResults,
        usage,
      }
    }
  }

  return {
    messages,
    text: finalText,
    reasoning: finalReasoning,
    finishReason: 'max_turns',
    turns: maxTurns,
    toolResults: allToolResults,
    usage,
  }
}
