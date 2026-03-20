/**
 * Memory Export/Import Module
 *
 * Handles exporting memory to JSON format and importing from external files.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { app, dialog } from 'electron'
import { getTextMemoryStorage, parseMemoryFile, generateMemoryFile } from './text-memory-storage.js'
import { getMemoryIndexManager } from './memory-index.js'
import { listMemoryFiles, type MemoryFileInfo } from './memory-manager.js'
import type { MemoryFileMetadata } from './types.js'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Export options
 */
export interface ExportOptions {
  /** Include metadata in export */
  includeMetadata: boolean
  /** Optional filter */
  filter?: {
    tags?: string[]
    dateRange?: [string, string]  // ISO 8601 date strings
  }
}

/**
 * Import result
 */
export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

/**
 * JSON export format structure
 */
interface JsonExportFormat {
  version: 1
  exportedAt: string
  source: string
  files: Array<{
    path: string
    metadata: MemoryFileMetadata
    content: string
  }>
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export memory files to JSON format
 * Returns the path to the exported file
 */
export async function exportMemory(options: ExportOptions): Promise<string> {
  // Get list of files to export
  let files = await listMemoryFiles()

  // Apply filters
  if (options.filter) {
    files = filterFiles(files, options.filter)
  }

  if (files.length === 0) {
    throw new Error('No files match the export criteria')
  }

  // Generate export filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const downloads = app.getPath('downloads')

  return await exportToJson(files, options, downloads, timestamp)
}

/**
 * Filter files based on criteria
 */
function filterFiles(
  files: MemoryFileInfo[],
  filter: NonNullable<ExportOptions['filter']>
): MemoryFileInfo[] {
  return files.filter(file => {
    // Tag filter
    if (filter.tags && filter.tags.length > 0) {
      const fileTags = file.metadata.tags || []
      const hasMatchingTag = filter.tags.some(tag => fileTags.includes(tag))
      if (!hasMatchingTag) return false
    }

    // Date range filter
    if (filter.dateRange) {
      const [start, end] = filter.dateRange
      const fileDate = file.metadata.updated || file.metadata.created
      if (fileDate < start || fileDate > end) return false
    }

    return true
  })
}

/**
 * Export to JSON format
 */
async function exportToJson(
  files: MemoryFileInfo[],
  options: ExportOptions,
  outputDir: string,
  timestamp: string
): Promise<string> {
  const storage = getTextMemoryStorage()
  const exportData: JsonExportFormat = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: '0nething',
    files: [],
  }

  for (const file of files) {
    const fullPath = path.join(storage.getBaseDir(), file.path)
    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      const parsed = parseMemoryFile(content)

      exportData.files.push({
        path: file.path,
        metadata: options.includeMetadata ? parsed.metadata : {
          created: parsed.metadata.created,
          updated: parsed.metadata.updated,
        },
        content: parsed.content,
      })
    } catch (error) {
      console.warn(`[MemoryExport] Failed to read ${file.path}:`, error)
    }
  }

  const outputPath = path.join(outputDir, `memory-export-${timestamp}.json`)
  await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf-8')

  console.log(`[MemoryExport] Exported ${exportData.files.length} files to ${outputPath}`)
  return outputPath
}


/**
 * Show export dialog and export
 */
export async function exportWithDialog(options: ExportOptions): Promise<string | null> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Memory',
    defaultPath: path.join(app.getPath('downloads'), `memory-export-${Date.now()}.json`),
    filters: [
      { name: 'JSON', extensions: ['json'] },
    ],
  })

  if (canceled || !filePath) {
    return null
  }

  return await exportMemory(options)
}

// ============================================================================
// Import Functions
// ============================================================================

/**
 * Import memory from a JSON file
 */
export async function importMemory(filePath: string): Promise<ImportResult> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.json') {
    return await importFromJson(filePath)
  } else {
    throw new Error(`Unsupported import format: ${ext}. Only JSON is supported.`)
  }
}

/**
 * Import from JSON format
 */
async function importFromJson(filePath: string): Promise<ImportResult> {
  const storage = getTextMemoryStorage()
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }

  const content = await fs.readFile(filePath, 'utf-8')
  const data = JSON.parse(content) as JsonExportFormat

  if (data.version !== 1) {
    throw new Error(`Unsupported export format version: ${data.version}`)
  }

  for (const file of data.files) {
    try {
      const targetPath = path.join(storage.getBaseDir(), file.path)

      // Check if file already exists
      try {
        await fs.access(targetPath)
        // File exists, skip
        result.skipped++
        continue
      } catch {
        // File doesn't exist, proceed
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true })

      // Merge metadata with import info
      const metadata: MemoryFileMetadata = {
        ...file.metadata,
        source: 'import',
        updated: new Date().toISOString(),
      }

      const fileContent = generateMemoryFile(metadata, file.content)
      await fs.writeFile(targetPath, fileContent, 'utf-8')
      result.imported++
    } catch (error) {
      result.errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Rebuild index
  const indexManager = getMemoryIndexManager(storage.getBaseDir())
  await indexManager.buildFullIndex()

  console.log(`[MemoryImport] Imported ${result.imported}, skipped ${result.skipped}, errors ${result.errors.length}`)
  return result
}


/**
 * Show import dialog and import
 */
export async function importWithDialog(): Promise<ImportResult | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Memory',
    filters: [
      { name: 'JSON', extensions: ['json'] },
    ],
    properties: ['openFile'],
  })

  if (canceled || filePaths.length === 0) {
    return null
  }

  return await importMemory(filePaths[0])
}
