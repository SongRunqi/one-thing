import type { CommandDefinition, CommandContext, CommandResult } from '@/types/commands'
import { useChatStore } from '@/stores/chat'
import { useRightSidebarStore } from '@/stores/right-sidebar'

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
export function collectFileChanges(sessionId: string): FileChangeData[] {
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
    collectFileChanges(context.sessionId)
    const rightSidebarStore = useRightSidebarStore()

    // Open right sidebar and switch to files tab
    rightSidebarStore.open()
    rightSidebarStore.setActiveTab('files')

    return { success: true }
  },
}
