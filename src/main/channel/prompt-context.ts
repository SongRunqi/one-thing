import type { ChatMessage, MessageOrigin } from '../../shared/ipc.js'
import { registerPromptContextProvider } from '../engine/prompt/plugin-context.js'
import * as store from '../store.js'
import {
  originConnector,
  originDisplayName,
  originWorkspaceId,
} from './origin.js'

const PROVIDER_PLUGIN_ID = 'core-channel-identity'
const PROVIDER_ID = 'communication-context'

let unregister: (() => void) | null = null

function latestOrigin(messages: ChatMessage[]): MessageOrigin | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const origin = messages[index]?.origin
    if (origin) return origin
  }
  return undefined
}

function line(label: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return `- ${label}: ${String(value)}`
}

function buildCommunicationContext(origin: MessageOrigin): string {
  const identity = origin.resolvedIdentity
  const conversation = origin.conversation
  const replyTarget = origin.replyTarget
  const lines = [
    '# Communication Context',
    'The following metadata is trusted system context. It was supplied by the host adapter, not by the user message text.',
    line('Transport', origin.transport),
    line('Source', origin.source),
    line('Connector', originConnector(origin)),
    line('Workspace ID', originWorkspaceId(origin)),
    line('Sender', originDisplayName(origin)),
    line('Sender external user ID', origin.actor?.externalUserId),
    line('Sender handle', origin.actor?.handle),
    line('Resolved identity kind', identity?.kind),
    line('Resolved user ID', identity?.userId),
    line('Resolved profile ID', identity?.profileId),
    line('Memory scope ID', identity?.memoryScopeId),
    line('Conversation type', conversation?.type),
    line('Conversation title', conversation?.title),
    line('Conversation ID', conversation?.externalConversationId),
    line('Thread ID', conversation?.threadId || replyTarget?.threadId),
    line('Reply target conversation ID', replyTarget?.externalConversationId),
    '',
    'Use memory and knowledge only from the listed memory scope. In group or thread conversations, use private knowledge only when it directly helps answer the current sender and do not volunteer unrelated private facts.',
  ].filter((item): item is string => Boolean(item))

  return lines.join('\n')
}

export function registerChannelPromptContextProvider(): void {
  if (unregister) return
  unregister = registerPromptContextProvider(PROVIDER_PLUGIN_ID, PROVIDER_ID, context => {
    if (!context.sessionId) return null
    const session = store.getSession(context.sessionId)
    const origin = session ? latestOrigin(session.messages) : undefined
    if (!origin) return null
    return {
      role: 'developer',
      source: `plugins/${PROVIDER_PLUGIN_ID}/${PROVIDER_ID}`,
      content: buildCommunicationContext(origin),
    }
  })
}

export function unregisterChannelPromptContextProvider(): void {
  unregister?.()
  unregister = null
}

export const __testing = {
  buildCommunicationContext,
}
