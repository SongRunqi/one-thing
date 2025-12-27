/**
 * 消息格式转换函数
 *
 * 用于在旧的 ChatMessage 格式和新的 UIMessage 格式之间转换
 * 支持双向转换以保持向后兼容性
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  ChatMessage,
  ToolCall,
  Step,
  ContentPart,
  MessageAttachment,
  UIMessage,
  UIMessagePart,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  FileUIPart,
  StepsDataUIPart,
  ErrorDataUIPart,
  MessageMetadata,
} from './ipc.js'
import { legacyStatusToUIState, uiStateToLegacyStatus } from './tool-state-mapping.js'

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
  if (msg.role === 'error' || msg.errorDetails) {
    parts.push({
      type: 'data-error',
      text: msg.content || 'Unknown error',
      details: msg.errorDetails,
    } as ErrorDataUIPart)
  }

  // 构建 UIMessage
  const role = msg.role === 'error' ? 'assistant' : msg.role
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
      isError: msg.role === 'error',
      errorDetails: msg.errorDetails,
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
// UIMessage → ChatMessage 转换（向后兼容）
// ============================================================================

/**
 * 将新的 UIMessage 转换回旧的 ChatMessage
 * 用于保存消息和向后兼容
 */
export function uiMessageToChatMessage(uiMsg: UIMessage): ChatMessage {
  const contentParts: ContentPart[] = []
  const toolCalls: ToolCall[] = []
  const steps: Step[] = []
  const attachments: MessageAttachment[] = []

  let textContent = ''
  let reasoning = ''

  // 用于跟踪当前 turn 的工具调用
  let currentToolCalls: ToolCall[] = []
  let currentTurnIndex = 0

  for (const part of uiMsg.parts) {
    switch (part.type) {
      case 'text': {
        const textPart = part as TextUIPart
        textContent += textPart.text
        // 如果有未提交的工具调用，先提交
        if (currentToolCalls.length > 0) {
          contentParts.push({
            type: 'tool-call',
            toolCalls: [...currentToolCalls],
          })
          currentToolCalls = []
        }
        contentParts.push({
          type: 'text',
          content: textPart.text,
        })
        break
      }

      case 'reasoning': {
        const reasoningPart = part as ReasoningUIPart
        reasoning += reasoningPart.text
        break
      }

      case 'data-steps': {
        const stepPart = part as StepsDataUIPart
        steps.push(...stepPart.steps)
        // 添加 steps 占位符到 contentParts
        contentParts.push({
          type: 'data-steps',
          turnIndex: stepPart.turnIndex,
        })
        currentTurnIndex = stepPart.turnIndex + 1
        break
      }

      case 'file': {
        const filePart = part as FileUIPart
        attachments.push(filePartToAttachment(filePart))
        break
      }

      case 'data-error': {
        // error part 会设置消息的错误状态
        const errorPart = part as ErrorDataUIPart
        if (!textContent) {
          textContent = errorPart.text
        }
        break
      }

      default: {
        // 工具调用 Part（type 以 'tool-' 开头）
        if (part.type.startsWith('tool-')) {
          const toolPart = part as ToolUIPart
          const tc = uiPartToToolCall(toolPart)
          toolCalls.push(tc)
          currentToolCalls.push(tc)
        }
        break
      }
    }
  }

  // 提交剩余的工具调用
  if (currentToolCalls.length > 0) {
    contentParts.push({
      type: 'tool-call',
      toolCalls: [...currentToolCalls],
    })
  }

  // 确定消息角色
  const isError = uiMsg.metadata?.isError || false
  const role = isError ? 'error' : uiMsg.role === 'system' ? 'user' : uiMsg.role

  return {
    id: uiMsg.id,
    role: role as 'user' | 'assistant' | 'error',
    content: textContent,
    timestamp: uiMsg.metadata?.timestamp || Date.now(),
    reasoning: reasoning || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    contentParts: contentParts.length > 0 ? contentParts : undefined,
    steps: steps.length > 0 ? steps : undefined,
    model: uiMsg.metadata?.model,
    thinkingTime: uiMsg.metadata?.thinkingTime,
    thinkingStartTime: uiMsg.metadata?.thinkingStartTime,
    skillUsed: uiMsg.metadata?.skillUsed,
    attachments: attachments.length > 0 ? attachments : uiMsg.metadata?.attachments,
    errorDetails: uiMsg.metadata?.errorDetails,
  }
}

/**
 * 将 ToolUIPart 转换回 ToolCall
 */
export function uiPartToToolCall(part: ToolUIPart): ToolCall {
  return {
    id: part.toolCallId,
    toolId: part.toolName,
    toolName: part.toolName,
    arguments: part.input || {},
    status: uiStateToLegacyStatus(part.state),
    result: part.output,
    error: part.errorText,
    timestamp: part.startTime || Date.now(),
    startTime: part.startTime,
    endTime: part.endTime,
    requiresConfirmation: part.requiresConfirmation,
    commandType: part.commandType,
  }
}

/**
 * 将 FileUIPart 转换回 MessageAttachment
 */
export function filePartToAttachment(part: FileUIPart): MessageAttachment {
  // 解析 data URL
  let base64Data: string | undefined
  let url: string | undefined

  if (part.url.startsWith('data:')) {
    const matches = part.url.match(/^data:([^;]+);base64,(.+)$/)
    if (matches) {
      base64Data = matches[2]
    }
  } else {
    url = part.url
  }

  // 确定媒体类型
  let mediaType: 'image' | 'document' | 'audio' | 'video' | 'file' = 'file'
  if (part.mediaType.startsWith('image/')) {
    mediaType = 'image'
  } else if (part.mediaType.startsWith('audio/')) {
    mediaType = 'audio'
  } else if (part.mediaType.startsWith('video/')) {
    mediaType = 'video'
  } else if (
    part.mediaType === 'application/pdf' ||
    part.mediaType.includes('document')
  ) {
    mediaType = 'document'
  }

  return {
    id: uuidv4(),
    fileName: part.filename || 'unknown',
    mimeType: part.mediaType,
    size: 0, // 无法从 FileUIPart 恢复
    mediaType,
    base64Data,
    url,
  }
}

// ============================================================================
// 批量转换函数
// ============================================================================

/**
 * 批量将 ChatMessage[] 转换为 UIMessage[]
 */
export function chatMessagesToUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map(chatMessageToUIMessage)
}

/**
 * 批量将 UIMessage[] 转换为 ChatMessage[]
 */
export function uiMessagesToChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages.map(uiMessageToChatMessage)
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
