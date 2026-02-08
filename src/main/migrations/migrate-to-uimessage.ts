/**
 * UIMessage 格式迁移
 *
 * REQ-005 Phase 1: 将旧的 ChatMessage 格式迁移到新的 UIMessage 格式
 *
 * 核心迁移逻辑已移至 src/main/stores/sessions.ts（getSession 时自动迁移）。
 * 本模块保留批量迁移和备份/恢复工具函数供手动迁移或回滚使用。
 */

import fs from 'fs'
import path from 'path'
import { getSessionsDir, getSessionPath, readJsonFile, writeJsonFile } from '../stores/paths.js'
import type { ChatSession } from '../../shared/ipc.js'
import {
  chatMessageToUIMessage,
} from '../../shared/message-converters.js'

// 迁移版本号（与 sessions.ts 中的 UI_MESSAGE_VERSION 保持一致）
const MIGRATION_VERSION = 1

/**
 * @deprecated Use ChatSession directly — uiMessages is now a field on ChatSession
 * Kept for backward compatibility with any code referencing this type
 */
export type ChatSessionWithUIMessages = ChatSession

// ============================================================================
// 迁移状态检查
// ============================================================================

/**
 * 检查会话是否需要迁移
 */
export function needsMigration(session: ChatSession): boolean {
  // Already migrated if uiMessages exists with correct version
  if (session.uiMessages && session._uiMessageVersion === MIGRATION_VERSION) {
    return false
  }
  // No messages to migrate
  if (session.messages.length === 0 && (!session.uiMessages || session.uiMessages.length === 0)) {
    return false
  }
  return true
}

/**
 * 检查会话是否已迁移
 */
export function isMigrated(session: ChatSession): boolean {
  return !needsMigration(session)
}

// ============================================================================
// 单会话迁移
// ============================================================================

/**
 * 迁移单个会话（原地修改）
 * 将 messages (ChatMessage[]) 转换为 uiMessages (UIMessage[])
 */
export function migrateSession(session: ChatSession): ChatSession {
  if (!needsMigration(session)) {
    return session
  }

  console.log(`[Migration] Migrating session: ${session.id} (${session.name})`)

  // 转换消息
  session.uiMessages = session.messages.map(chatMessageToUIMessage)
  session._uiMessageVersion = MIGRATION_VERSION

  return session
}

/**
 * 迁移会话并保存到文件
 */
export function migrateAndSaveSession(sessionId: string): boolean {
  try {
    const sessionPath = getSessionPath(sessionId)
    const session = readJsonFile<ChatSession | null>(sessionPath, null)

    if (!session) {
      console.error(`[Migration] Session not found: ${sessionId}`)
      return false
    }

    if (!needsMigration(session)) {
      console.log(`[Migration] Session already migrated: ${sessionId}`)
      return true
    }

    migrateSession(session)
    writeJsonFile(sessionPath, session)

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

  const needMigrationList: string[] = []
  const files = fs.readdirSync(sessionsDir)

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'index.json') {
      continue
    }

    const sessionId = file.replace('.json', '')
    const sessionPath = path.join(sessionsDir, file)

    try {
      const session = readJsonFile<ChatSession | null>(sessionPath, null)
      if (session && needsMigration(session)) {
        needMigrationList.push(sessionId)
      }
    } catch (error) {
      console.error(`[Migration] Error reading session ${sessionId}:`, error)
    }
  }

  return needMigrationList
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
      const session = readJsonFile<ChatSession | null>(sessionPath, null)

      if (!session) {
        result.failed++
        result.errors.push({ sessionId, error: 'Session file not readable' })
        continue
      }

      if (!needsMigration(session)) {
        result.skipped++
        continue
      }

      migrateSession(session)
      writeJsonFile(sessionPath, session)
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
// 回滚支持
// ============================================================================

/**
 * 创建会话备份（迁移前）
 */
export function backupSession(sessionId: string): boolean {
  try {
    const sessionPath = getSessionPath(sessionId)
    const backupPath = `${sessionPath}.bak`

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
    const backupPath = `${sessionPath}.bak`

    if (!fs.existsSync(backupPath)) {
      console.error(`[Migration] No backup found for session ${sessionId}`)
      return false
    }

    fs.copyFileSync(backupPath, sessionPath)
    console.log(`[Migration] Restored session ${sessionId} from backup`)
    return true
  } catch (error) {
    console.error(`[Migration] Failed to restore session ${sessionId}:`, error)
    return false
  }
}
