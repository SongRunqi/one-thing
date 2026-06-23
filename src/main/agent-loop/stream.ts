import type {
  AgentMessageContent,
  AgentProviderData,
  AgentStreamEvent,
  AgentTurn,
  AgentTurnStreamEvent,
} from './types.js'

export function agentContentToText(content: AgentMessageContent | undefined): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  return content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
}

export async function collectAgentTurnFromStream(
  events: AsyncIterable<AgentTurnStreamEvent>,
  onEvent?: (event: AgentStreamEvent) => void,
): Promise<AgentTurn> {
  let content = ''
  let reasoningContent = ''
  let finishReason: AgentTurn['finishReason'] = 'unknown'
  let usage: AgentTurn['usage']
  const toolCalls: AgentTurn['message']['toolCalls'] = []
  const providerData: AgentProviderData[] = []

  for await (const event of events) {
    onEvent?.(event)

    switch (event.type) {
      case 'text-delta':
        content += event.delta
        break
      case 'reasoning-delta':
        reasoningContent += event.delta
        break
      case 'tool-call-done':
        toolCalls.push(event.toolCall)
        break
      case 'provider-data':
        providerData.push(event.providerData)
        break
      case 'finish':
        finishReason = event.finishReason
        usage = event.usage
        break
      default:
        break
    }
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
