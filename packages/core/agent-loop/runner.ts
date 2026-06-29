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
import { AgentLoopPauseForConfirmationError } from './errors.js'
import { agentToolResultToMessageContentForCapabilities } from './tool-results.js'
import {
  assertAgentProviderCanRunTurn,
  agentSupportsTools,
  assertAgentOutputModalitiesSupportedByCapabilities,
  assertAgentMessagesSupportedByCapabilities,
  resolveAgentModelCapabilities,
} from './capabilities.js'

const DEFAULT_MAX_TURNS = 8

type AgentToolInputStreamEvent =
  | Extract<AgentTurnStreamEvent, { type: 'tool-call-start' }>
  | Extract<AgentTurnStreamEvent, { type: 'tool-call-delta' }>
  | Extract<AgentTurnStreamEvent, { type: 'tool-call-done' }>

interface ExecuteProviderTurnOptions {
  request: AgentTurnRequest
  provider: AgentLoopOptions['provider']
  onToolCallDone: (toolCall: AgentToolCall) => Promise<void>
}

function isAbortError(error: Error): boolean {
  return error instanceof Error && error.name === 'AbortError'
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

function addUsage(a: AgentUsage | undefined, b: AgentUsage | undefined): AgentUsage | undefined {
  if (!a) return b
  if (!b) return a
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
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

function isToolInputStreamEvent(event: AgentTurnStreamEvent): event is AgentToolInputStreamEvent {
  return event.type === 'tool-call-start'
    || event.type === 'tool-call-delta'
    || event.type === 'tool-call-done'
}

function toolInputEventId(event: AgentToolInputStreamEvent): string {
  return event.type === 'tool-call-done'
    ? event.toolCall.id
    : event.toolCallId
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
  const { request, provider, onToolCallDone } = options
  if (provider.streamTurn || provider.runTurn) {
    let content = ''
    let reasoningContent = ''
    let finishReason: AgentTurn['finishReason'] = 'unknown'
    let usage: AgentTurn['usage']
    let pendingFinishEvent: Extract<AgentStreamEvent, { type: 'finish' }> | null = null
    const toolCalls: AgentToolCall[] = []
    const providerData: AgentProviderData[] = []
    const bufferedToolEvents = new Map<string, AgentToolInputStreamEvent[]>()
    const bufferedToolOrder: string[] = []
    let activeToolCallId: string | null = null

    const rememberBufferedToolEvent = (event: AgentToolInputStreamEvent): void => {
      const id = toolInputEventId(event)
      const existing = bufferedToolEvents.get(id)
      if (existing) {
        existing.push(event)
        return
      }
      bufferedToolEvents.set(id, [event])
      bufferedToolOrder.push(id)
    }

    const collectAndEmit = async (event: AgentTurnStreamEvent): Promise<void> => {
      request.onEvent?.(event)

      switch (event.type) {
        case 'text-delta':
          content += event.delta
          break
        case 'reasoning-delta':
          reasoningContent += event.delta
          break
        case 'tool-call-done':
          toolCalls.push(event.toolCall)
          await onToolCallDone(event.toolCall)
          break
        case 'provider-data':
          providerData.push(event.providerData)
          break
        default:
          break
      }
    }

    const flushBufferedToolEvents = async (): Promise<void> => {
      while (!activeToolCallId && bufferedToolOrder.length > 0) {
        const nextId = bufferedToolOrder.shift()!
        const events = bufferedToolEvents.get(nextId) ?? []
        bufferedToolEvents.delete(nextId)
        activeToolCallId = nextId

        for (const event of events) {
          await collectAndEmit(event)
          if (event.type === 'tool-call-done') {
            activeToolCallId = null
            break
          }
        }
      }
    }

    const handleToolInputEvent = async (event: AgentToolInputStreamEvent): Promise<void> => {
      const id = toolInputEventId(event)
      if (!activeToolCallId) {
        activeToolCallId = id
      }

      if (activeToolCallId !== id) {
        rememberBufferedToolEvent(event)
        return
      }

      await collectAndEmit(event)
      if (event.type === 'tool-call-done') {
        activeToolCallId = null
        await flushBufferedToolEvents()
      }
    }

    for await (const event of streamAgentProviderTurnEvents(provider, { ...request, onEvent: undefined })) {
      if (event.type === 'finish') {
        finishReason = event.finishReason
        usage = event.usage
        pendingFinishEvent = event
        continue
      }

      if (isToolInputStreamEvent(event)) {
        await handleToolInputEvent(event)
        continue
      }

      await collectAndEmit(event)
    }

    await flushBufferedToolEvents()
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
  let finalText = ''
  let finalReasoning = ''
  let finishReason: AgentFinishReason = 'unknown'
  let usage: AgentUsage | undefined

  for (let turn = 1; ; turn++) {
    throwIfAgentAborted(options.abortSignal)
    const replacementMessages = await runWithAgentAbort(options.abortSignal, () => options.beforeTurn?.({
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
    if (replacementMessages) {
      messages = replacementMessages.map(message => ({ ...message }))
      assertAgentMessagesSupportedByCapabilities(messages, capabilities)
    }

    options.onEvent?.({ type: 'turn-start', turn })

    const pendingToolMessages: AgentMessage[] = []
    const agentTurn = await runWithAgentAbort(options.abortSignal, () =>
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
        onToolCallDone: async (toolCall) => {
          const result = await executeAgentToolCall({
            options,
            toolMap,
            turn,
            toolCall,
          })

          allToolResults.push({ toolCall, result })
          options.onEvent?.({ type: 'tool-result', turn, toolCall, result })
          if (options.abortSignal?.aborted || result.aborted) {
            throw createAgentAbortError()
          }
          if (result.requiresConfirmation) {
            throw new AgentLoopPauseForConfirmationError(toolCall, result)
          }
          pendingToolMessages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: agentToolResultToMessageContentForCapabilities(result, capabilities),
          })
        },
      }))
    throwIfAgentAborted(options.abortSignal)

    messages.push(agentTurn.message)
    messages.push(...pendingToolMessages)
    assertAgentMessagesSupportedByCapabilities(messages, capabilities)
    finalText = agentContentToText(agentTurn.message.content)
    finalReasoning = agentTurn.message.reasoningContent ?? ''
    finishReason = agentTurn.finishReason
    usage = addUsage(usage, agentTurn.usage)
    options.onEvent?.({ type: 'turn-end', turn, finishReason, usage: agentTurn.usage })

    const toolCalls = agentTurn.message.toolCalls ?? []
    if (toolCalls.length === 0) {
      const replacementMessages = await runWithAgentAbort(options.abortSignal, () => options.afterTurn?.({
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
      if (replacementMessages) {
        messages = replacementMessages.map(message => ({ ...message }))
        assertAgentMessagesSupportedByCapabilities(messages, capabilities)
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
