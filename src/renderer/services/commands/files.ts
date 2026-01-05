import type { CommandDefinition, CommandContext, CommandResult } from '@/types/commands'
import { useChatStore } from '@/stores/chat'

/**
 * File change info extracted from tool calls
 */
export interface FileChangeData {
  filePath: string
  additions: number
  deletions: number
  isNew: boolean
  diff: string
  originalContent?: string  // For rollback support
}

/**
 * Structured message for files-changed display
 */
export interface FilesChangedMessage {
  type: 'files-changed'
  files: FileChangeData[]
  summary: {
    totalFiles: number
    totalAdditions: number
    totalDeletions: number
  }
}

/**
 * Collect all file changes from a session's messages
 * Checks both step.toolCall.changes and message.toolCalls[].changes
 */
function collectFileChanges(sessionId: string): FileChangeData[] {
  const chatStore = useChatStore()
  const messages = chatStore.sessionMessages.get(sessionId) || []
  const fileChangesMap = new Map<string, FileChangeData>()
  const processedToolCallIds = new Set<string>()

  for (const message of messages) {
    if (message.role !== 'assistant') continue

    // Check step.toolCall.changes (primary source during streaming)
    if (message.steps) {
      for (const step of message.steps) {
        const changes = step.toolCall?.changes
        if (changes?.filePath) {
          const existing = fileChangesMap.get(changes.filePath)
          if (existing) {
            // Merge: accumulate stats, keep latest diff
            existing.additions += changes.additions || 0
            existing.deletions += changes.deletions || 0
            existing.isNew = false
            if (changes.diff) existing.diff = changes.diff
            // Keep the FIRST originalContent (before any modifications)
            // Don't overwrite if already set
          } else {
            fileChangesMap.set(changes.filePath, {
              filePath: changes.filePath,
              additions: changes.additions || 0,
              deletions: changes.deletions || 0,
              isNew: (changes.additions || 0) > 0 && (changes.deletions || 0) === 0,
              diff: changes.diff || '',
              originalContent: changes.originalContent,  // For rollback
            })
          }
          if (step.toolCall?.id) {
            processedToolCallIds.add(step.toolCall.id)
          }
        }
      }
    }

    // Also check message.toolCalls[].changes
    if (message.toolCalls) {
      for (const toolCall of message.toolCalls) {
        if (processedToolCallIds.has(toolCall.id)) continue

        const changes = toolCall.changes
        if (changes?.filePath) {
          const existing = fileChangesMap.get(changes.filePath)
          if (existing) {
            existing.additions += changes.additions || 0
            existing.deletions += changes.deletions || 0
            existing.isNew = false
            if (changes.diff) existing.diff = changes.diff
            // Keep the FIRST originalContent
          } else {
            fileChangesMap.set(changes.filePath, {
              filePath: changes.filePath,
              additions: changes.additions || 0,
              deletions: changes.deletions || 0,
              isNew: (changes.additions || 0) > 0 && (changes.deletions || 0) === 0,
              diff: changes.diff || '',
              originalContent: changes.originalContent,  // For rollback
            })
          }
        }
      }
    }
  }

  // Sort by file path
  return Array.from(fileChangesMap.values()).sort((a, b) =>
    a.filePath.localeCompare(b.filePath)
  )
}

/**
 * /files command - Show files modified in current conversation
 */
export const filesCommand: CommandDefinition = {
  id: 'files',
  name: 'Changed Files',
  description: 'Show files modified in this conversation',
  usage: '/files',

  async execute(context: CommandContext): Promise<CommandResult> {
    const chatStore = useChatStore()
    const files = collectFileChanges(context.sessionId)

    // Calculate summary
    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

    // Create structured message
    const messageData: FilesChangedMessage = {
      type: 'files-changed',
      files,
      summary: {
        totalFiles: files.length,
        totalAdditions,
        totalDeletions,
      },
    }

    // 1. Remove existing files-changed message (backend + frontend)
    // This ensures only one files-changed message exists per session
    const removeResult = await window.electronAPI.removeFilesChangedMessage(context.sessionId)
    if (removeResult.removedId) {
      // Also remove from Vue state for immediate UI update
      chatStore.removeMessage(context.sessionId, removeResult.removedId)
    }

    // 2. Create new message with unique ID
    const messageId = `system-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const systemMessage = {
      id: messageId,
      role: 'system' as const,
      content: JSON.stringify(messageData),
      timestamp: Date.now(),
    }

    // 3. Persist to backend
    await window.electronAPI.addSystemMessage(context.sessionId, systemMessage)

    // 4. Add to Vue state for immediate display
    chatStore.addMessageToState(context.sessionId, systemMessage)

    return {
      success: true,
      message: `${files.length} file(s) changed`,
    }
  },
}
