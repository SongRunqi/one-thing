import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import fs from 'node:fs/promises'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { TokenUsage, SessionTokenUsage } from '../../shared/ipc.js'
import * as store from '../store.js'

/**
 * Update session usage (called from chat.ts when finish chunk is received)
 * Persists to disk for durability across app restarts
 * @param lastTurnUsage - Optional: the last turn's usage (for context size calculation in tool loops)
 */
export function updateSessionUsage(
  sessionId: string,
  usage: TokenUsage,
  lastTurnUsage?: { inputTokens: number; outputTokens: number }
): void {
  store.updateSessionTokenUsage(sessionId, usage, lastTurnUsage)
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
    lastInputTokens: usage?.lastInputTokens ?? 0,
    contextSize: usage?.contextSize ?? 0,
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

  // ============================================================================
  // Optimized Session Loading (Phase 4: Metadata Separation)
  // ============================================================================

  // 获取会话列表（仅元数据，不含消息）- 用于快速启动
  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS_LIST, async () => {
    try {
      const sessions = store.getSessionsList()
      return { success: true, sessions }
    } catch (error: any) {
      console.error('[Sessions] Failed to get sessions list:', error)
      return { success: false, error: error.message || 'Failed to get sessions list' }
    }
  })

  // 激活会话（返回详情，不含消息）- 用于会话切换时获取元数据
  ipcMain.handle(IPC_CHANNELS.ACTIVATE_SESSION, async (_event, { sessionId }) => {
    try {
      const session = store.getSessionDetails(sessionId)
      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      // If session has no workingDirectory but its workspace does, inherit it
      if (!session.workingDirectory && session.workspaceId) {
        const workspace = store.getWorkspace(session.workspaceId)
        if (workspace?.workingDirectory) {
          store.inheritSessionWorkingDirectory(sessionId, workspace.workingDirectory)
          session.workingDirectory = workspace.workingDirectory
        }
      }

      store.setCurrentSessionId(sessionId)
      return {
        success: true,
        session,
        messageCount: session.messageCount ?? 0,
      }
    } catch (error: any) {
      console.error('[Sessions] Failed to activate session:', error)
      return { success: false, error: error.message || 'Failed to activate session' }
    }
  })

  // 获取会话消息（按需加载）- 仅在需要显示消息时调用
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_MESSAGES, async (_event, { sessionId }) => {
    try {
      const messages = store.getSessionMessages(sessionId)
      if (!messages) {
        return { success: false, error: 'Session not found' }
      }
      return { success: true, messages }
    } catch (error: any) {
      console.error('[Sessions] Failed to get session messages:', error)
      return { success: false, error: error.message || 'Failed to get messages' }
    }
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

    // If session has no workingDirectory but its workspace does, inherit it
    // Note: Use inheritSessionWorkingDirectory to avoid updating updatedAt
    if (!session.workingDirectory && session.workspaceId) {
      const workspace = store.getWorkspace(session.workspaceId)
      if (workspace?.workingDirectory) {
        store.inheritSessionWorkingDirectory(sessionId, workspace.workingDirectory)
        session.workingDirectory = workspace.workingDirectory
      }
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
    // 如果是清除目录，直接执行
    if (workingDirectory === null || workingDirectory === '') {
      store.updateSessionWorkingDirectory(sessionId, workingDirectory)
      return { success: true }
    }

    // 验证目录是否存在
    try {
      const stat = await fs.stat(workingDirectory)
      if (!stat.isDirectory()) {
        return { success: false, error: `Not a directory: ${workingDirectory}` }
      }
    } catch {
      return { success: false, error: `Directory does not exist: ${workingDirectory}` }
    }

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

  // 设置会话的内置模式 (Plan mode / Build mode)
  ipcMain.handle(IPC_CHANNELS.SET_SESSION_BUILTIN_MODE, async (_event, { sessionId, mode }) => {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    store.updateSessionBuiltinMode(sessionId, mode)
    return { success: true, mode }
  })

  // 获取会话的内置模式
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_BUILTIN_MODE, async (_event, { sessionId }) => {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true, mode: session.builtinMode || 'build' }
  })

  // Add a system message to a session (for /files command persistence)
  ipcMain.handle('add-system-message', async (_event, { sessionId, message }) => {
    try {
      store.addMessage(sessionId, message)
      return { success: true }
    } catch (error: any) {
      console.error('[Sessions] Failed to add system message:', error)
      return { success: false, error: error.message || 'Failed to add message' }
    }
  })

  // Remove existing files-changed message from a session (to keep only one)
  ipcMain.handle('remove-files-changed-message', async (_event, { sessionId }) => {
    try {
      const session = store.getSession(sessionId)
      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      // Find existing files-changed message
      const existing = session.messages.find(
        (m) => m.role === 'system' && m.content.includes('"type":"files-changed"')
      )

      if (existing) {
        store.deleteMessage(sessionId, existing.id)
        return { success: true, removedId: existing.id }
      }

      return { success: true, removedId: null }
    } catch (error: any) {
      console.error('[Sessions] Failed to remove files-changed message:', error)
      return { success: false, error: error.message || 'Failed to remove message' }
    }
  })

  // Remove existing git-status message from a session (to keep only one)
  ipcMain.handle('remove-git-status-message', async (_event, { sessionId }) => {
    try {
      const session = store.getSession(sessionId)
      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      // Find existing git-status message
      const existing = session.messages.find(
        (m) => m.role === 'system' && m.content.includes('"type":"git-status"')
      )

      if (existing) {
        store.deleteMessage(sessionId, existing.id)
        return { success: true, removedId: existing.id }
      }

      return { success: true, removedId: null }
    } catch (error: any) {
      console.error('[Sessions] Failed to remove git-status message:', error)
      return { success: false, error: error.message || 'Failed to remove message' }
    }
  })

  // Generic remove message by ID (for close button functionality)
  ipcMain.handle('remove-message', async (_event, { sessionId, messageId }) => {
    try {
      store.deleteMessage(sessionId, messageId)
      return { success: true }
    } catch (error: any) {
      console.error('[Sessions] Failed to remove message:', error)
      return { success: false, error: error.message || 'Failed to remove message' }
    }
  })
}
