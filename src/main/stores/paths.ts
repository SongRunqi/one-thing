import { app } from 'electron'
import path from 'path'
import fs from 'fs'

// Get the user data directory for storing app data
export function getStorePath(): string {
  return path.join(app.getPath('userData'), 'data')
}

export function getSettingsPath(): string {
  return path.join(getStorePath(), 'settings.json')
}

export function getAppStatePath(): string {
  return path.join(getStorePath(), 'app-state.json')
}

export function getModelsCachePath(): string {
  return path.join(getStorePath(), 'models-cache.json')
}

export function getWindowStatePath(): string {
  return path.join(getStorePath(), 'window-state.json')
}

export function getSessionsDir(): string {
  return path.join(getStorePath(), 'sessions')
}

export function getSessionPath(sessionId: string): string {
  return path.join(getSessionsDir(), `${sessionId}.json`)
}

export function getWorkspacesDir(): string {
  return path.join(getStorePath(), 'workspaces')
}

export function getWorkspacePath(workspaceId: string): string {
  return path.join(getWorkspacesDir(), `${workspaceId}.json`)
}

export function getWorkspaceAvatarsDir(): string {
  return path.join(getWorkspacesDir(), 'avatars')
}

export function getWorkspaceAvatarPath(workspaceId: string, extension: string): string {
  return path.join(getWorkspaceAvatarsDir(), `${workspaceId}.${extension}`)
}

export function getAgentsDir(): string {
  return path.join(getStorePath(), 'agents')
}

export function getAgentPath(agentId: string): string {
  return path.join(getAgentsDir(), `${agentId}.json`)
}

export function getAgentAvatarsDir(): string {
  return path.join(getAgentsDir(), 'avatars')
}

export function getAgentAvatarPath(agentId: string, extension: string): string {
  return path.join(getAgentAvatarsDir(), `${agentId}.${extension}`)
}

// User Profile paths
export function getUserProfileDir(): string {
  return path.join(getStorePath(), 'user-profile')
}

export function getUserProfilePath(): string {
  return path.join(getUserProfileDir(), 'profile.json')
}

// Agent Memory paths (for Phase 3)
export function getAgentMemoryDir(): string {
  return path.join(getStorePath(), 'agent-memory')
}

export function getAgentMemoryPath(agentId: string): string {
  return path.join(getAgentMemoryDir(), `${agentId}.json`)
}

// Media paths for generated images
export function getMediaDir(): string {
  return path.join(getStorePath(), 'media')
}

export function getMediaImagesDir(): string {
  return path.join(getMediaDir(), 'images')
}

export function getMediaIndexPath(): string {
  return path.join(getMediaDir(), 'index.json')
}

// SQLite database path for vector storage
export function getDatabasePath(): string {
  return path.join(getStorePath(), 'memory.db')
}

// Ensure all necessary directories exist
export function ensureStoreDirs(): void {
  const dirs = [
    getStorePath(),
    getSessionsDir(),
    getWorkspacesDir(),
    getWorkspaceAvatarsDir(),
    getAgentsDir(),
    getAgentAvatarsDir(),
    getUserProfileDir(),
    getAgentMemoryDir(),
    getMediaDir(),
    getMediaImagesDir(),
  ]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}

// Helper to read JSON file safely
export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8').trim()
      // Return default for empty files
      if (!content) {
        return defaultValue
      }
      return JSON.parse(content) as T
    }
  } catch (error) {
    console.warn(`Failed to parse ${path.basename(filePath)}, using defaults`)
  }
  return defaultValue
}

// Helper to write JSON file safely
export function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error)
    throw error
  }
}

// Helper to delete file safely
export function deleteJsonFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
  } catch (error) {
    console.error(`Error deleting ${filePath}:`, error)
  }
  return false
}
