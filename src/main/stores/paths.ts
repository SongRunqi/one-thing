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

// Screenshots directory (for automation screenshot captures)
export function getScreenshotsDir(): string {
  return path.join(getStorePath(), 'screenshots')
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

// Tool outputs directory (for large outputs that exceed inline limits)
export function getToolOutputsDir(): string {
  return path.join(getStorePath(), 'tool-outputs')
}

export function getToolOutputPath(filename: string): string {
  return path.join(getToolOutputsDir(), filename)
}

// Generate a unique filename for tool output
export function generateToolOutputFilename(toolName: string, sessionId?: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const prefix = sessionId ? `${sessionId.slice(0, 8)}_` : ''
  return `${prefix}${toolName}_${timestamp}_${random}.txt`
}

// MCP Tools catalog file (contains full tool descriptions for AI reference)
export function getMCPToolsCatalogPath(): string {
  return path.join(getStorePath(), 'mcp-tools-catalog.md')
}

// Get the bundled docs directory path (for reference documentation)
export function getDocsDir(): string {
  // In production, docs are bundled in resources/docs
  // In development, they're in resources/docs relative to project root
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'docs')
  }
  // Development: use process.cwd() which is the project root when using electron-vite
  return path.join(process.cwd(), 'resources', 'docs')
}

export function getMacOSAutomationDocsPath(): string {
  return path.join(getDocsDir(), 'macos-automation.md')
}

export function getToolUsageDocsPath(): string {
  return path.join(getDocsDir(), 'tool-usage-guide.md')
}

// Session history directory (for full conversation backup before context compacting)
export function getSessionHistoryDir(): string {
  return path.join(getStorePath(), 'session-history')
}

export function getSessionHistoryPath(sessionId: string): string {
  return path.join(getSessionHistoryDir(), `${sessionId}.md`)
}

// Permissions directory (for workspace-level permissions)
export function getPermissionsDir(): string {
  return path.join(getStorePath(), 'permissions')
}

// Helper to ensure a directory exists
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Ensure all necessary directories exist
export function ensureStoreDirs(): void {
  const dirs = [
    getStorePath(),
    getSessionsDir(),
    getScreenshotsDir(),
    getMediaDir(),
    getMediaImagesDir(),
    getToolOutputsDir(),
    getSessionHistoryDir(),
    getPermissionsDir(),
  ]

  for (const dir of dirs) {
    ensureDir(dir)
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
