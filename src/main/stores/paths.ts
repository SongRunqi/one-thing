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

export function getSessionsDir(): string {
  return path.join(getStorePath(), 'sessions')
}

export function getSessionPath(sessionId: string): string {
  return path.join(getSessionsDir(), `${sessionId}.json`)
}

// Ensure all necessary directories exist
export function ensureStoreDirs(): void {
  const storePath = getStorePath()
  const sessionsDir = getSessionsDir()

  if (!fs.existsSync(storePath)) {
    fs.mkdirSync(storePath, { recursive: true })
  }

  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true })
  }
}

// Helper to read JSON file safely
export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as T
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
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
