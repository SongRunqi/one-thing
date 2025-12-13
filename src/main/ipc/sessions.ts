import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '@shared/ipc'
import * as store from '../store'

export function registerSessionHandlers() {
  // 获取所有会话
  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    return { success: true, sessions: store.getSessions() }
  })

  // 创建新会话
  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, { name }) => {
    const sessionId = uuidv4()
    const session = store.createSession(sessionId, name || `Chat ${new Date().toLocaleString()}`)
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

  // 删除会话
  ipcMain.handle(IPC_CHANNELS.DELETE_SESSION, async (_event, { sessionId }) => {
    store.deleteSession(sessionId)
    return { success: true }
  })

  // 重命名会话
  ipcMain.handle(IPC_CHANNELS.RENAME_SESSION, async (_event, { sessionId, newName }) => {
    store.renameSession(sessionId, newName)
    return { success: true }
  })
}
