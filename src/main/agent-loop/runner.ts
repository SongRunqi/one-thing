import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentLoopToolResult,
  AgentMessage,
  AgentTool,
  AgentToolCall,
  AgentToolResult,
  AgentUsage,
  AgentFinishReason,
} from './types.js'

const DEFAULT_MAX_TURNS = 8

function parseToolArguments(call: AgentToolCall): Record<string, unknown> {
  const raw = call.arguments.trim()
  if (!raw) return {}
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Tool arguments for ${call.name} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function stringifyToolResult(result: AgentToolResult): string {
  if (result.error) {
    return JSON.stringify({ success: false, error: result.error })
  }
  return result.content
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

function selectedTools(tools: AgentTool[] = [], selectedToolNames?: string[]): AgentTool[] {
  if (!selectedToolNames?.length) return tools
  const selected = new Set(selectedToolNames)
  return tools.filter(tool => selected.has(tool.name))
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS
  const messages: AgentMessage[] = options.messages.map(message => ({ ...message }))
  const tools = selectedTools(options.tools, options.selectedToolNames)
  const toolMap = new Map(tools.map(tool => [tool.name, tool]))
  const allToolResults: AgentLoopToolResult[] = []
  let finalText = ''
  let finalReasoning = ''
  let finishReason: AgentFinishReason = 'unknown'
  let usage: AgentUsage | undefined

  for (let turn = 1; turn <= maxTurns; turn++) {
    options.onEvent?.({ type: 'turn-start', turn })

    const agentTurn = await options.provider.runTurn({
      model: options.model,
      messages,
      tools,
      toolChoice: tools.length > 0 ? options.toolChoice ?? 'auto' : 'none',
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      thinking: options.thinking,
      reasoningEffort: options.reasoningEffort,
      abortSignal: options.abortSignal,
      onEvent: options.onEvent,
      turn,
    })

    messages.push(agentTurn.message)
    finalText = agentTurn.message.content ?? ''
    finalReasoning = agentTurn.message.reasoningContent ?? ''
    finishReason = agentTurn.finishReason
    usage = addUsage(usage, agentTurn.usage)
    options.onEvent?.({ type: 'turn-end', turn, finishReason, usage: agentTurn.usage })

    const toolCalls = agentTurn.message.toolCalls ?? []
    if (toolCalls.length === 0) {
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

    for (const toolCall of toolCalls) {
      const tool = toolMap.get(toolCall.name)
      let result: AgentToolResult

      if (!tool) {
        result = { content: '', error: `Tool not available: ${toolCall.name}` }
      } else {
        try {
          const args = parseToolArguments(toolCall)
          result = await tool.execute(args, {
            sessionId: options.sessionId,
            messageId: options.messageId,
            toolCallId: toolCall.id,
            workingDirectory: options.workingDirectory,
            abortSignal: options.abortSignal,
          })
        } catch (error) {
          result = {
            content: '',
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }

      allToolResults.push({ toolCall, result })
      options.onEvent?.({ type: 'tool-result', turn, toolCall, result })
      messages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: stringifyToolResult(result),
      })
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
