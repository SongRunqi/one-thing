/**
 * UIMessage utilities
 *
 * - ChatMessage → UIMessage 转换（用于旧数据迁移）
 * - UIMessage 构建辅助函数
 * - UIMessage Part 操作函数
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  ChatMessage,
  ToolCall,
  Step,
  MessageAttachment,
  UIMessage,
  UIMessagePart,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  FileUIPart,
  StepsDataUIPart,
  ErrorDataUIPart,
} from './ipc.js'
import { legacyStatusToUIState } from './tool-state-mapping.js'

// ============================================================================
// ChatMessage → UIMessage 转换
// ============================================================================

/**
 * 将旧的 ChatMessage 转换为新的 UIMessage
 * 用于加载历史消息时
 */
export function chatMessageToUIMessage(msg: ChatMessage): UIMessage {
  const parts: UIMessagePart[] = []

  // 处理 contentParts（如果存在）
  if (msg.contentParts && msg.contentParts.length > 0) {
    for (const part of msg.contentParts) {
      switch (part.type) {
        case 'text':
          if (part.content) {
            parts.push({
              type: 'text',
              text: part.content,
              state: 'done',
            } as TextUIPart)
          }
          break
        case 'tool-call':
          // 将 tool-call 组转换为多个 ToolUIPart
          if (part.toolCalls) {
            for (const tc of part.toolCalls) {
              parts.push(toolCallToUIPart(tc))
            }
          }
          break
        case 'data-steps':
          // 转换为 StepsDataUIPart
          parts.push({
            type: 'data-steps',
            turnIndex: part.turnIndex,
            steps: msg.steps?.filter(s => s.turnIndex === part.turnIndex) || [],
          } as StepsDataUIPart)
          break
        case 'waiting':
          // waiting 状态不需要转换为 UIMessage part
          break
      }
    }
  } else {
    // 没有 contentParts 时，从原始字段构建

    // 1. 添加推理内容（如果有）
    if (msg.reasoning) {
      parts.push({
        type: 'reasoning',
        text: msg.reasoning,
        state: 'done',
      } as ReasoningUIPart)
    }

    // 2. 添加文本内容
    if (msg.content) {
      parts.push({
        type: 'text',
        text: msg.content,
        state: msg.isStreaming ? 'streaming' : 'done',
      } as TextUIPart)
    }

    // 3. 添加工具调用
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        parts.push(toolCallToUIPart(tc))
      }
    }

    // 4. 添加步骤
    if (msg.steps && msg.steps.length > 0) {
      // 按 turnIndex 分组
      const stepsByTurn = new Map<number, Step[]>()
      for (const step of msg.steps) {
        const turn = step.turnIndex ?? 0
        if (!stepsByTurn.has(turn)) {
          stepsByTurn.set(turn, [])
        }
        stepsByTurn.get(turn)!.push(step)
      }

      for (const [turnIndex, steps] of stepsByTurn) {
        parts.push({
          type: 'data-steps',
          turnIndex,
          steps,
        } as StepsDataUIPart)
      }
    }
  }

  // 处理附件
  if (msg.attachments && msg.attachments.length > 0) {
    for (const attachment of msg.attachments) {
      parts.push(attachmentToFilePart(attachment))
    }
  }

  // 处理错误消息
  // Note: old data on disk may still have role='error' (pre-REQ-005 Phase 4)
  const isLegacyError = (msg.role as string) === 'error'
  if (isLegacyError || msg.errorDetails) {
    parts.push({
      type: 'data-error',
      text: msg.content || 'Unknown error',
      details: msg.errorDetails,
    } as ErrorDataUIPart)
  }

  // 构建 UIMessage
  const role = isLegacyError ? 'assistant' : msg.role
  return {
    id: msg.id,
    role: role as 'user' | 'assistant' | 'system',
    parts,
    metadata: {
      timestamp: msg.timestamp,
      model: msg.model,
      thinkingTime: msg.thinkingTime,
      thinkingStartTime: msg.thinkingStartTime,
      skillUsed: msg.skillUsed,
      attachments: msg.attachments,
      isError: isLegacyError,
      errorDetails: msg.errorDetails,
      errorCategory: msg.errorCategory,
      retryable: msg.retryable,
      usage: msg.usage ? {
        inputTokens: msg.usage.inputTokens,
        outputTokens: msg.usage.outputTokens,
        totalTokens: msg.usage.totalTokens,
      } : undefined,
    },
  }
}

/**
 * 将 ToolCall 转换为 ToolUIPart
 */
export function toolCallToUIPart(tc: ToolCall): ToolUIPart {
  return {
    type: `tool-${tc.toolName}`,
    toolCallId: tc.id,
    toolName: tc.toolName,
    state: legacyStatusToUIState(tc.status),
    input: tc.arguments,
    output: tc.result,
    errorText: tc.error,
    requiresConfirmation: tc.requiresConfirmation,
    commandType: tc.commandType,
    startTime: tc.startTime,
    endTime: tc.endTime,
  }
}

/**
 * 将 MessageAttachment 转换为 FileUIPart
 */
export function attachmentToFilePart(attachment: MessageAttachment): FileUIPart {
  return {
    type: 'file',
    mediaType: attachment.mimeType,
    filename: attachment.fileName,
    url: attachment.base64Data
      ? `data:${attachment.mimeType};base64,${attachment.base64Data}`
      : attachment.url || '',
  }
}


// ============================================================================
// UIMessage 构建辅助函数
// ============================================================================

/**
 * 创建用户消息
 */
export function createUserUIMessage(
  content: string,
  options?: {
    id?: string
    attachments?: MessageAttachment[]
  }
): UIMessage {
  const parts: UIMessagePart[] = []

  // 添加文本内容
  if (content) {
    parts.push({
      type: 'text',
      text: content,
      state: 'done',
    } as TextUIPart)
  }

  // 添加附件
  if (options?.attachments) {
    for (const attachment of options.attachments) {
      parts.push(attachmentToFilePart(attachment))
    }
  }

  return {
    id: options?.id || uuidv4(),
    role: 'user',
    parts,
    metadata: {
      timestamp: Date.now(),
      attachments: options?.attachments,
    },
  }
}

/**
 * 创建助手消息（初始空白）
 */
export function createAssistantUIMessage(
  options?: {
    id?: string
    model?: string
  }
): UIMessage {
  return {
    id: options?.id || uuidv4(),
    role: 'assistant',
    parts: [],
    metadata: {
      timestamp: Date.now(),
      model: options?.model,
    },
  }
}

/**
 * 创建系统消息
 */
export function createSystemUIMessage(content: string): UIMessage {
  return {
    id: uuidv4(),
    role: 'system',
    parts: [{
      type: 'text',
      text: content,
      state: 'done',
    } as TextUIPart],
    metadata: {
      timestamp: Date.now(),
    },
  }
}

// ============================================================================
// UIMessage Part 操作函数
// ============================================================================

/**
 * 在 UIMessage 中添加或更新 part
 */
export function upsertPart(
  message: UIMessage,
  part: UIMessagePart,
  index?: number
): UIMessage {
  const parts = [...message.parts]

  if (index !== undefined && index >= 0 && index < parts.length) {
    // 更新现有 part
    parts[index] = part
  } else {
    // 添加新 part
    parts.push(part)
  }

  return {
    ...message,
    parts,
  }
}

/**
 * 获取消息中特定类型的最后一个 part
 */
export function getLastPartOfType<T extends UIMessagePart>(
  message: UIMessage,
  type: string
): T | undefined {
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i]
    if (part.type === type || (type === 'tool' && part.type.startsWith('tool-'))) {
      return part as T
    }
  }
  return undefined
}

/**
 * 获取消息中所有工具调用 parts
 */
export function getToolParts(message: UIMessage): ToolUIPart[] {
  return message.parts.filter(
    p => p.type.startsWith('tool-')
  ) as ToolUIPart[]
}

/**
 * 根据 toolCallId 查找 ToolUIPart
 */
export function findToolPartById(
  message: UIMessage,
  toolCallId: string
): { part: ToolUIPart; index: number } | undefined {
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i]
    if (part.type.startsWith('tool-')) {
      const toolPart = part as ToolUIPart
      if (toolPart.toolCallId === toolCallId) {
        return { part: toolPart, index: i }
      }
    }
  }
  return undefined
}

/**
 * 更新消息中的 ToolUIPart
 */
export function updateToolPart(
  message: UIMessage,
  toolCallId: string,
  updates: Partial<ToolUIPart>
): UIMessage {
  const found = findToolPartById(message, toolCallId)
  if (!found) return message

  const updatedPart: ToolUIPart = {
    ...found.part,
    ...updates,
  }

  return upsertPart(message, updatedPart, found.index)
}

/**
 * 获取消息的纯文本内容
 */
export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter(p => p.type === 'text')
    .map(p => (p as TextUIPart).text)
    .join('')
}

/**
 * 获取消息的推理内容
 */
export function getMessageReasoning(message: UIMessage): string {
  return message.parts
    .filter(p => p.type === 'reasoning')
    .map(p => (p as ReasoningUIPart).text)
    .join('')
}
