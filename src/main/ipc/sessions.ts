import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { TokenUsage, SessionTokenUsage } from '../../shared/ipc.js'
import * as store from '../store.js'

/**
 * Update session usage (called from chat.ts when finish chunk is received)
 * Persists to disk for durability across app restarts
 */
export function updateSessionUsage(sessionId: string, usage: TokenUsage): void {
  store.updateSessionTokenUsage(sessionId, usage)
}

/**
 * Get session usage from persisted storage
 */
export function getSessionUsage(sessionId: string): SessionTokenUsage {
  const usage = store.getSessionTokenUsage(sessionId)
  return {
    totalInputTokens: usage?.totalInputTokens ?? 0,
    totalOutputTokens: usage?.totalOutputTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    maxTokens: 128000, // Not used anymore, context length comes from model
  }
}

/**
 * Clear session usage (called when session is deleted)
 * Note: Session deletion already removes the session file with its usage data
 */
export function clearSessionUsage(_sessionId: string): void {
  // No-op: session file deletion handles this
}

export function registerSessionHandlers() {
  // 获取所有会话
  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    return { success: true, sessions: store.getSessions() }
  })

  // 创建新会话
  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, { name, workspaceId, agentId }) => {
    const sessionId = uuidv4()
    const session = store.createSession(sessionId, name || 'New Chat', workspaceId, agentId)
    return { success: true, session }
  })

  // 切换会话
  ipcMain.handle(IPC_CHANNELS.SWITCH_SESSION, async (_event, { sessionId }) => {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    store.setCurrentSessionId(sessionId)
    return { success: true, session }
  })

  // 获取单个会话（不切换）
  ipcMain.handle(IPC_CHANNELS.GET_SESSION, async (_event, { sessionId }) => {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true, session }
  })

  // 删除会话 (包括级联删除子会话)
  ipcMain.handle(IPC_CHANNELS.DELETE_SESSION, async (_event, { sessionId }) => {
    const result = store.deleteSession(sessionId)
    return {
      success: true,
      parentSessionId: result.parentSessionId,
      deletedCount: result.deletedIds.length,
    }
  })

  // 重命名会话
  ipcMain.handle(IPC_CHANNELS.RENAME_SESSION, async (_event, { sessionId, newName }) => {
    store.renameSession(sessionId, newName)
    return { success: true }
  })

  // 置顶/取消置顶会话
  ipcMain.handle(IPC_CHANNELS.UPDATE_SESSION_PIN, async (_event, { sessionId, isPinned }) => {
    store.updateSessionPin(sessionId, isPinned)
    return { success: true }
  })

  // 归档/取消归档会话
  ipcMain.handle(IPC_CHANNELS.UPDATE_SESSION_ARCHIVED, async (_event, { sessionId, isArchived, archivedAt }) => {
    store.updateSessionArchived(sessionId, isArchived, archivedAt)
    return { success: true }
  })

  // 更新会话关联的Agent
  ipcMain.handle(IPC_CHANNELS.UPDATE_SESSION_AGENT, async (_event, { sessionId, agentId }) => {
    store.updateSessionAgent(sessionId, agentId)
    return { success: true }
  })

  // 更新会话工作目录 (sandbox boundary)
  ipcMain.handle(IPC_CHANNELS.UPDATE_SESSION_WORKING_DIRECTORY, async (_event, { sessionId, workingDirectory }) => {
    store.updateSessionWorkingDirectory(sessionId, workingDirectory)
    return { success: true }
  })

  // 更新会话模型
  ipcMain.handle(IPC_CHANNELS.UPDATE_SESSION_MODEL, async (_event, { sessionId, provider, model }) => {
    const success = store.updateSessionModel(sessionId, provider, model)
    if (!success) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true }
  })

  // 创建分支会话
  ipcMain.handle(
    IPC_CHANNELS.CREATE_BRANCH,
    async (_event, { parentSessionId, branchFromMessageId }) => {
      try {
        const parentSession = store.getSession(parentSessionId)
        if (!parentSession) {
          return { success: false, error: 'Parent session not found' }
        }

        // Find the message index to branch from
        const messageIndex = parentSession.messages.findIndex(
          (m) => m.id === branchFromMessageId
        )
        if (messageIndex === -1) {
          return { success: false, error: 'Message not found' }
        }

        // Copy messages up to and including the branch point
        const inheritedMessages = parentSession.messages
          .slice(0, messageIndex + 1)
          .map((m) => ({ ...m })) // Deep copy

        // Create branch session with inherited messages
        const branchId = uuidv4()
        const branchName = `${parentSession.name} (Branch)`
        const branchSession = store.createBranchSession(
          branchId,
          branchName,
          parentSessionId,
          branchFromMessageId,
          inheritedMessages
        )

        return { success: true, session: branchSession }
      } catch (error: any) {
        console.error('Error creating branch:', error)
        return { success: false, error: error.message || 'Failed to create branch' }
      }
    }
  )

  // 获取会话的 token 使用统计
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_TOKEN_USAGE, async (_event, sessionId: string) => {
    const usage = getSessionUsage(sessionId)
    return { success: true, usage }
  })
}
