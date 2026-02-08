/**
 * Settings Import/Export Module
 * Provides safe import/export of application settings
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { classifyError } from '../../shared/errors.js'
import { getSettings, saveSettings } from '../stores/settings.js'
import type { AppSettings } from '../../shared/ipc.js'
import * as fs from 'fs/promises'
import * as path from 'path'

// Fields to exclude from export (security-sensitive)
const SENSITIVE_FIELD_PATTERNS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
]

interface ExportedSettings {
  version: string
  exportedAt: string
  settings: Partial<AppSettings>
}

/**
 * Check if a field name contains sensitive information
 */
function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))
}

/**
 * Recursively filter out sensitive fields from an object
 */
function filterSensitiveFields(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  
  if (Array.isArray(obj)) {
    return obj.map(item => filterSensitiveFields(item))
  }
  
  const filtered: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      // Skip sensitive fields
      continue
    }
    
    if (typeof value === 'object' && value !== null) {
      filtered[key] = filterSensitiveFields(value)
    } else {
      filtered[key] = value
    }
  }
  
  return filtered
}

/**
 * Export current settings to JSON (without sensitive data)
 */
export async function exportSettings(): Promise<ExportedSettings> {
  const currentSettings = getSettings()
  const filteredSettings = filterSensitiveFields(currentSettings)
  
  const packageJson = await fs.readFile(
    path.join(__dirname, '../../../package.json'),
    'utf-8'
  ).catch(() => '{"version":"0.1.0"}')
  const version = JSON.parse(packageJson).version || '0.1.0'
  
  return {
    version,
    exportedAt: new Date().toISOString(),
    settings: filteredSettings,
  }
}

/**
 * Validate and import settings from JSON data
 */
export async function importSettings(data: string): Promise<{ success: boolean; error?: string }> {
  try {
    const imported = JSON.parse(data) as ExportedSettings
    
    // Validate structure
    if (!imported.settings) {
      return { success: false, error: '无效的设置文件：缺少 settings 字段' }
    }
    
    // Get current settings to preserve sensitive fields
    const currentSettings = getSettings()
    
    // Merge imported settings with current settings (preserving API keys)
    const mergedSettings: AppSettings = {
      ...currentSettings,
      ...imported.settings,
      ai: {
        ...currentSettings.ai,
        ...imported.settings.ai,
        providers: {
          ...currentSettings.ai.providers,
          ...(imported.settings.ai?.providers || {}),
        },
      },
    }
    
    // Preserve all API keys from current settings
    if (currentSettings.ai.providers && mergedSettings.ai.providers) {
      for (const providerKey of Object.keys(currentSettings.ai.providers)) {
        if (mergedSettings.ai.providers[providerKey]) {
          mergedSettings.ai.providers[providerKey].apiKey = 
            currentSettings.ai.providers[providerKey].apiKey
          if (currentSettings.ai.providers[providerKey].baseUrl) {
            mergedSettings.ai.providers[providerKey].baseUrl = 
              currentSettings.ai.providers[providerKey].baseUrl
          }
        }
      }
    }
    
    // Save merged settings
    saveSettings(mergedSettings)
    
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `导入失败：${errorMessage}` }
  }
}

/**
 * Register IPC handlers for settings import/export
 */
export function registerSettingsIOHandlers() {
  // Export settings (returns JSON data)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_EXPORT, async () => {
    try {
      const exportedData = await exportSettings()
      return { success: true, data: exportedData }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[SettingsIO][${appError.category}] Failed to export settings:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })
  
  // Export settings with dialog (saves to file)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_EXPORT_WITH_DIALOG, async () => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      const exportedData = await exportSettings()
      
      const today = new Date().toISOString().split('T')[0]
      const defaultPath = `onething-settings-${today}.json`
      
      const result = await dialog.showSaveDialog(focusedWindow || new BrowserWindow(), {
        title: '导出设置',
        defaultPath,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      })
      
      if (result.canceled || !result.filePath) {
        return { success: false, error: '用户取消' }
      }
      
      await fs.writeFile(
        result.filePath,
        JSON.stringify(exportedData, null, 2),
        'utf-8'
      )
      
      return { success: true, path: result.filePath }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[SettingsIO][${appError.category}] Failed to export settings with dialog:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })
  
  // Import settings (from JSON data)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_IMPORT, async (_event, data: string) => {
    return await importSettings(data)
  })
  
  // Import settings with dialog (opens file picker)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_IMPORT_WITH_DIALOG, async () => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      
      const result = await dialog.showOpenDialog(focusedWindow || new BrowserWindow(), {
        title: '导入设置',
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile'],
      })
      
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '用户取消' }
      }
      
      const fileContent = await fs.readFile(result.filePaths[0], 'utf-8')
      const importResult = await importSettings(fileContent)
      
      if (!importResult.success) {
        return importResult
      }
      
      // Broadcast settings change to all windows
      const newSettings = getSettings()
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, newSettings)
      })
      
      return { success: true }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[SettingsIO][${appError.category}] Failed to import settings with dialog:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })
}
