// Re-export all store modules
export { ensureStoreDirs, getStorePath } from './paths.js'
export { getSettings, saveSettings } from './settings.js'
export { getCurrentSessionId, setCurrentSessionId } from './app-state.js'
export { getCachedModels, setCachedModels, clearModelsCache } from './models-cache.js'
export {
  getSessions,
  getSession,
  createSession,
  createBranchSession,
  deleteSession,
  renameSession,
  addMessage,
  updateMessageAndTruncate,
  updateMessageContent,
  updateMessageReasoning,
  updateMessageStreaming,
  updateMessageToolCalls,
  updateMessageContentParts,
  updateMessageThinkingTime,
  updateSessionPin,
} from './sessions.js'

// Migration function
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import Store from 'electron-store'
import type { ChatSession, AppSettings, CachedModels } from '../../shared/ipc.js'
import { ensureStoreDirs, getStorePath } from './paths.js'
import { saveSettings, defaultSettings } from './settings.js'
import { setCurrentSessionId } from './app-state.js'
import { writeJsonFile } from './paths.js'

interface OldStoreSchema {
  sessions: ChatSession[]
  currentSessionId: string
  settings: AppSettings
  modelsCache: Record<string, CachedModels>
}

// Check if migration is needed and perform it
export function initializeStores(): void {
  ensureStoreDirs()

  // Check if old store exists and new store doesn't
  const oldStore = new Store<OldStoreSchema>()
  const newStorePath = getStorePath()
  const migrationMarker = path.join(newStorePath, '.migrated')

  // Skip if already migrated
  if (fs.existsSync(migrationMarker)) {
    return
  }

  // Check if old store has data
  const oldSessions = oldStore.get('sessions', [])
  const oldSettings = oldStore.get('settings')
  const oldCurrentSessionId = oldStore.get('currentSessionId', '')
  const oldModelsCache = oldStore.get('modelsCache', {})

  if (oldSessions.length > 0 || oldSettings) {
    console.log('Migrating data from old store format...')

    // Migrate settings
    if (oldSettings) {
      saveSettings(oldSettings)
      console.log('  - Settings migrated')
    } else {
      saveSettings(defaultSettings)
    }

    // Migrate current session ID
    if (oldCurrentSessionId) {
      setCurrentSessionId(oldCurrentSessionId)
      console.log('  - App state migrated')
    }

    // Migrate models cache
    if (Object.keys(oldModelsCache).length > 0) {
      const modelsCachePath = path.join(newStorePath, 'models-cache.json')
      writeJsonFile(modelsCachePath, oldModelsCache)
      console.log('  - Models cache migrated')
    }

    // Migrate sessions
    if (oldSessions.length > 0) {
      const sessionsDir = path.join(newStorePath, 'sessions')

      // Create sessions index
      const index = oldSessions.map((s) => ({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        parentSessionId: s.parentSessionId,
        branchFromMessageId: s.branchFromMessageId,
      }))
      writeJsonFile(path.join(sessionsDir, 'index.json'), index)

      // Create individual session files
      for (const session of oldSessions) {
        writeJsonFile(path.join(sessionsDir, `${session.id}.json`), session)
      }
      console.log(`  - ${oldSessions.length} sessions migrated`)
    }

    console.log('Migration complete!')
  }

  // Create migration marker
  fs.writeFileSync(migrationMarker, new Date().toISOString())
}
