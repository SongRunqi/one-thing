/**
 * OS-specific Prompt Loader
 *
 * Loads system prompts based on the current operating system.
 * Supports Windows, macOS, and Linux with corresponding .txt files.
 */

import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/**
 * Get the OS prompts directory path
 * Handles both development and production environments
 */
function getOsPromptsPath(): string {
  const isDev = !app.isPackaged

  if (isDev) {
    // Development: app.getAppPath() returns dist/main, go up 2 levels to project root
    const projectRoot = path.resolve(app.getAppPath(), '..', '..')
    return path.join(projectRoot, 'resources', 'prompts')
  } else {
    // Production: resources are copied to process.resourcesPath
    return path.join(process.resourcesPath, 'prompts')
  }
}

/**
 * Get the prompt filename for the current OS
 */
function getOsPromptFileName(): string {
  switch (process.platform) {
    case 'win32':
      return 'windows.txt'
    case 'darwin':
      return 'macos.txt'
    case 'linux':
      return 'linux.txt'
    default:
      return ''
  }
}

/**
 * Load the OS-specific prompt content
 * Returns null if file doesn't exist or on error (silent skip)
 */
export function loadOsPrompt(): string | null {
  const fileName = getOsPromptFileName()
  if (!fileName) {
    console.log(`[OS Prompt] Unknown platform: ${process.platform}`)
    return null
  }

  const promptsPath = getOsPromptsPath()
  const filePath = path.join(promptsPath, fileName)

  console.log(`[OS Prompt] Looking for: ${filePath}`)

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8').trim()
      // Only return non-empty content
      if (content) {
        console.log(`[OS Prompt] Loaded ${fileName} (${content.length} chars)`)
        return content
      }
      console.log(`[OS Prompt] File ${fileName} is empty`)
    } else {
      console.log(`[OS Prompt] File not found: ${filePath}`)
    }
  } catch (error) {
    console.warn(`[OS Prompt] Failed to load ${fileName}:`, error)
  }

  return null
}
