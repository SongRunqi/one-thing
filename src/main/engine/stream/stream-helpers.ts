/**
 * UIMessage Streaming Helpers
 * Handles sending stream chunks to the renderer process
 */

import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type {
  UIMessagePart,
  UIMessageStreamData,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  ToolUIState,
} from '../../../shared/ipc.js'

/**
 * Send a UIMessage part chunk to the renderer
 */
export function sendUIMessagePart(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  part: UIMessagePart,
  partIndex?: number
) {
  const data: UIMessageStreamData = {
    sessionId,
    messageId,
    chunk: {
      type: 'part',
      messageId,
      part,
      partIndex,
    },
  }
  sender.send(IPC_CHANNELS.UI_MESSAGE_STREAM, data)
}

/**
 * Send a UIMessage finish chunk to the renderer
 */
export function sendUIMessageFinish(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other' = 'stop',
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
) {
  const data: UIMessageStreamData = {
    sessionId,
    messageId,
    chunk: {
      type: 'finish',
      messageId,
      finishReason,
      usage,
    },
  }
  sender.send(IPC_CHANNELS.UI_MESSAGE_STREAM, data)
}

/**
 * Send a text delta as UIMessage part
 */
export function sendUITextDelta(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  text: string,
  partIndex?: number,
  state: 'streaming' | 'done' = 'streaming'
) {
  const part: TextUIPart = {
    type: 'text',
    text,
    state,
  }
  sendUIMessagePart(sender, sessionId, messageId, part, partIndex)
}

/**
 * Send a reasoning delta as UIMessage part
 */
export function sendUIReasoningDelta(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  text: string,
  partIndex?: number,
  state: 'streaming' | 'done' = 'streaming'
) {
  const part: ReasoningUIPart = {
    type: 'reasoning',
    text,
    state,
  }
  sendUIMessagePart(sender, sessionId, messageId, part, partIndex)
}

/**
 * Send a tool call as UIMessage part
 */
export function sendUIToolCall(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  toolCallId: string,
  toolName: string,
  state: ToolUIState,
  input?: Record<string, unknown>,
  output?: unknown,
  errorText?: string,
  partIndex?: number
) {
  const part: ToolUIPart = {
    type: `tool-${toolName}`,
    toolCallId,
    toolName,
    state,
    input,
    output,
    errorText,
  }
  sendUIMessagePart(sender, sessionId, messageId, part, partIndex)
}
