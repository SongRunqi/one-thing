/**
 * UIMessage 格式迁移
 *
 * 将旧的 ChatMessage 格式迁移到新的 UIMessage 格式
 * 支持懒加载迁移和批量迁移
 */

import fs from 'fs'
import path from 'path'
import { getSessionsDir, getSessionPath, readJsonFile, writeJsonFile } from '../stores/paths.js'
import type { ChatSession, ChatMessage } from '../../shared/ipc.js'
import type { UIMessage } from '../../shared/ipc.js'
import {
  chatMessageToUIMessage,
  uiMessageToChatMessage,
} from '../../shared/message-converters.js'

// 迁移版本号
const MIGRATION_VERSION = 1

// 迁移标记接口
interface MigrationMeta {
  uiMessageVersion?: number
  migratedAt?: number
}

// 扩展的会话类型（包含 UIMessages）
export interface ChatSessionWithUIMessages extends ChatSession {
  uiMessages?: UIMessage[]
  _migration?: MigrationMeta
}

// ============================================================================
// 迁移状态检查
// ============================================================================

/**
 * 检查会话是否需要迁移
 */
export function needsMigration(session: ChatSessionWithUIMessages): boolean {
  // 如果没有迁移标记，需要迁移
  if (!session._migration?.uiMessageVersion) {
    return true
  }

  // 如果版本号低于当前版本，需要迁移
  if (session._migration.uiMessageVersion < MIGRATION_VERSION) {
    return true
  }

  // 如果有消息但没有 uiMessages，需要迁移
  if (session.messages.length > 0 && (!session.uiMessages || session.uiMessages.length === 0)) {
    return true
  }

  return false
}

/**
 * 检查会话是否已迁移
 */
export function isMigrated(session: ChatSessionWithUIMessages): boolean {
  return !needsMigration(session)
}

// ============================================================================
// 单会话迁移
// ============================================================================

/**
 * 迁移单个会话（原地修改）
 * 同时保留 messages 和 uiMessages 以保持向后兼容
 */
export function migrateSession(session: ChatSessionWithUIMessages): ChatSessionWithUIMessages {
  if (!needsMigration(session)) {
    return session
  }

  console.log(`[Migration] Migrating session: ${session.id} (${session.name})`)

  // 转换消息
  const uiMessages = session.messages.map(chatMessageToUIMessage)

  // 添加迁移标记
  const migratedSession: ChatSessionWithUIMessages = {
    ...session,
    uiMessages,
    _migration: {
      uiMessageVersion: MIGRATION_VERSION,
      migratedAt: Date.now(),
    },
  }

  return migratedSession
}

/**
 * 迁移会话并保存到文件
 */
export function migrateAndSaveSession(sessionId: string): boolean {
  try {
    const sessionPath = getSessionPath(sessionId)
    const session = readJsonFile<ChatSessionWithUIMessages | null>(sessionPath, null)

    if (!session) {
      console.error(`[Migration] Session not found: ${sessionId}`)
      return false
    }

    if (!needsMigration(session)) {
      console.log(`[Migration] Session already migrated: ${sessionId}`)
      return true
    }

    const migratedSession = migrateSession(session)
    writeJsonFile(sessionPath, migratedSession)

    console.log(`[Migration] Successfully migrated session: ${sessionId}`)
    return true
  } catch (error) {
    console.error(`[Migration] Failed to migrate session ${sessionId}:`, error)
    return false
  }
}

// ============================================================================
// 批量迁移
// ============================================================================

/**
 * 获取所有需要迁移的会话 ID
 */
export function getSessionsNeedingMigration(): string[] {
  const sessionsDir = getSessionsDir()
  if (!fs.existsSync(sessionsDir)) {
    return []
  }

  const needMigration: string[] = []
  const files = fs.readdirSync(sessionsDir)

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'index.json') {
      continue
    }

    const sessionId = file.replace('.json', '')
    const sessionPath = path.join(sessionsDir, file)

    try {
      const session = readJsonFile<ChatSessionWithUIMessages | null>(sessionPath, null)
      if (session && needsMigration(session)) {
        needMigration.push(sessionId)
      }
    } catch (error) {
      console.error(`[Migration] Error reading session ${sessionId}:`, error)
    }
  }

  return needMigration
}

/**
 * 批量迁移所有会话
 */
export function migrateAllSessions(): MigrationResult {
  const sessionsDir = getSessionsDir()
  if (!fs.existsSync(sessionsDir)) {
    return {
      success: true,
      total: 0,
      migrated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    }
  }

  const result: MigrationResult = {
    success: true,
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const files = fs.readdirSync(sessionsDir)

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'index.json') {
      continue
    }

    const sessionId = file.replace('.json', '')
    result.total++

    try {
      const sessionPath = path.join(sessionsDir, file)
      const session = readJsonFile<ChatSessionWithUIMessages | null>(sessionPath, null)

      if (!session) {
        result.failed++
        result.errors.push({ sessionId, error: 'Session file not readable' })
        continue
      }

      if (!needsMigration(session)) {
        result.skipped++
        continue
      }

      const migratedSession = migrateSession(session)
      writeJsonFile(sessionPath, migratedSession)
      result.migrated++
    } catch (error) {
      result.failed++
      result.errors.push({
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  result.success = result.failed === 0

  console.log(`[Migration] Complete:`, {
    total: result.total,
    migrated: result.migrated,
    skipped: result.skipped,
    failed: result.failed,
  })

  return result
}

export interface MigrationResult {
  success: boolean
  total: number
  migrated: number
  skipped: number
  failed: number
  errors: Array<{ sessionId: string; error: string }>
}

// ============================================================================
// 懒加载迁移（推荐）
// ============================================================================

/**
 * 加载会话时自动迁移
 * 这是推荐的方式，在会话加载时自动检查并迁移
 */
export function loadSessionWithMigration(sessionId: string): ChatSessionWithUIMessages | undefined {
  const sessionPath = getSessionPath(sessionId)
  const session = readJsonFile<ChatSessionWithUIMessages | null>(sessionPath, null)

  if (!session) {
    return undefined
  }

  // 检查是否需要迁移
  if (needsMigration(session)) {
    const migratedSession = migrateSession(session)

    // 异步保存迁移结果（不阻塞返回）
    setImmediate(() => {
      try {
        writeJsonFile(sessionPath, migratedSession)
        console.log(`[Migration] Lazy migration saved for session: ${sessionId}`)
      } catch (error) {
        console.error(`[Migration] Failed to save lazy migration for ${sessionId}:`, error)
      }
    })

    return migratedSession
  }

  return session
}

// ============================================================================
// UIMessage 同步（双向）
// ============================================================================

/**
 * 从 UIMessages 同步回 ChatMessages
 * 用于在修改 UIMessages 后保持向后兼容
 */
export function syncUIMessagesToChat(session: ChatSessionWithUIMessages): ChatSessionWithUIMessages {
  if (!session.uiMessages || session.uiMessages.length === 0) {
    return session
  }

  // 将 UIMessages 转换回 ChatMessages
  const chatMessages = session.uiMessages.map(uiMessageToChatMessage)

  return {
    ...session,
    messages: chatMessages,
  }
}

/**
 * 从 ChatMessages 同步到 UIMessages
 * 用于在使用旧代码修改 messages 后同步
 */
export function syncChatToUIMessages(session: ChatSessionWithUIMessages): ChatSessionWithUIMessages {
  const uiMessages = session.messages.map(chatMessageToUIMessage)

  return {
    ...session,
    uiMessages,
    _migration: {
      uiMessageVersion: MIGRATION_VERSION,
      migratedAt: Date.now(),
    },
  }
}

// ============================================================================
// 回滚支持
// ============================================================================

/**
 * 创建会话备份（迁移前）
 */
export function backupSession(sessionId: string): boolean {
  try {
    const sessionPath = getSessionPath(sessionId)
    const backupPath = `${sessionPath}.backup-${Date.now()}`

    if (fs.existsSync(sessionPath)) {
      fs.copyFileSync(sessionPath, backupPath)
      console.log(`[Migration] Backup created: ${backupPath}`)
      return true
    }
    return false
  } catch (error) {
    console.error(`[Migration] Failed to backup session ${sessionId}:`, error)
    return false
  }
}

/**
 * 批量备份所有会话
 */
export function backupAllSessions(): number {
  const sessionsDir = getSessionsDir()
  if (!fs.existsSync(sessionsDir)) {
    return 0
  }

  let count = 0
  const files = fs.readdirSync(sessionsDir)

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'index.json') {
      continue
    }

    const sessionId = file.replace('.json', '')
    if (backupSession(sessionId)) {
      count++
    }
  }

  console.log(`[Migration] Backed up ${count} sessions`)
  return count
}

/**
 * 从备份恢复会话
 */
export function restoreFromBackup(sessionId: string): boolean {
  try {
    const sessionPath = getSessionPath(sessionId)
    const sessionsDir = getSessionsDir()
    const files = fs.readdirSync(sessionsDir)

    // 找到最新的备份
    const backups = files
      .filter(f => f.startsWith(`${sessionId}.json.backup-`))
      .sort()
      .reverse()

    if (backups.length === 0) {
      console.error(`[Migration] No backup found for session ${sessionId}`)
      return false
    }

    const latestBackup = path.join(sessionsDir, backups[0])
    fs.copyFileSync(latestBackup, sessionPath)
    console.log(`[Migration] Restored session ${sessionId} from ${backups[0]}`)
    return true
  } catch (error) {
    console.error(`[Migration] Failed to restore session ${sessionId}:`, error)
    return false
  }
}
