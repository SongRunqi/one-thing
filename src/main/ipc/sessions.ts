import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import * as store from '../store.js'

export function registerSessionHandlers() {
  // 获取所有会话
  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    return { success: true, sessions: store.getSessions() }
  })

  // 创建新会话
  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, { name }) => {
    const sessionId = uuidv4()
    const session = store.createSession(sessionId, name || 'New Chat')
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
}
