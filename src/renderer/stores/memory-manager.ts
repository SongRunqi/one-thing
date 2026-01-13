/**
 * Memory Manager Store
 *
 * Pinia store for managing memory files in the settings UI.
 * Provides CRUD operations, tag management, and import/export.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  MemoryFileInfo,
  TagInfo,
  MemoryStats,
  ExportOptions,
  ImportResult,
  BatchDeleteResult,
} from '../../shared/ipc/memory.js'
import type { ParsedMemoryFile, MemoryFileMetadata } from '../../main/services/memory-text/types.js'

export const useMemoryManagerStore = defineStore('memoryManager', () => {
  // State
  const files = ref<MemoryFileInfo[]>([])
  const tags = ref<TagInfo[]>([])
  const stats = ref<MemoryStats | null>(null)
  const selectedFile = ref<ParsedMemoryFile | null>(null)
  const selectedFilePath = ref<string | null>(null)
  const isLoading = ref(false)
  const isExporting = ref(false)
  const isImporting = ref(false)
  const error = ref<string | null>(null)

  // Search/filter state
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])

  // Computed
  const filteredFiles = computed(() => {
    let result = files.value

    // Filter by search query
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(file =>
        file.title.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query) ||
        file.sections.some(s => s.toLowerCase().includes(query))
      )
    }

    // Filter by tags
    if (selectedTags.value.length > 0) {
      result = result.filter(file =>
        selectedTags.value.some(tag => file.metadata.tags?.includes(tag))
      )
    }

    return result
  })

  const totalFiles = computed(() => files.value.length)

  const tagCloud = computed(() => {
    return tags.value
      .map(t => ({ tag: t.tag, count: t.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  })

  // Actions

  /**
   * Load all memory files
   */
  async function loadFiles(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.memoryListFiles()
      if (response.success) {
        files.value = response.files || []
      } else {
        error.value = response.error || 'Failed to load files'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to load files:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Load all tags
   */
  async function loadTags(): Promise<void> {
    try {
      const response = await window.electronAPI.memoryGetTags()
      if (response.success) {
        tags.value = response.tags || []
      }
    } catch (err) {
      console.error('[MemoryManager] Failed to load tags:', err)
    }
  }

  /**
   * Load memory statistics
   */
  async function loadStats(): Promise<void> {
    try {
      const response = await window.electronAPI.memoryGetStats()
      if (response.success) {
        stats.value = response.stats || null
      }
    } catch (err) {
      console.error('[MemoryManager] Failed to load stats:', err)
    }
  }

  /**
   * Load all data (files, tags, stats)
   */
  async function loadAll(): Promise<void> {
    await Promise.all([loadFiles(), loadTags(), loadStats()])
  }

  /**
   * Select a file for viewing/editing
   */
  async function selectFile(path: string): Promise<void> {
    try {
      const response = await window.electronAPI.memoryGetFile(path)
      if (response.success && response.file) {
        selectedFile.value = response.file
        selectedFilePath.value = path
      } else {
        error.value = response.error || 'Failed to load file'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to load file:', err)
    }
  }

  /**
   * Clear selected file
   */
  function clearSelection(): void {
    selectedFile.value = null
    selectedFilePath.value = null
  }

  /**
   * Update a memory file
   */
  async function updateFile(
    path: string,
    content: string,
    metadata?: Partial<MemoryFileMetadata>
  ): Promise<boolean> {
    try {
      const response = await window.electronAPI.memoryUpdateFile(path, content, metadata)
      if (response.success) {
        // Reload files to get updated data
        await loadFiles()
        // Reload selected file if it was updated
        if (selectedFilePath.value === path) {
          await selectFile(path)
        }
        return true
      } else {
        error.value = response.error || 'Failed to update file'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to update file:', err)
      return false
    }
  }

  /**
   * Delete a single file
   */
  async function deleteFile(path: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.memoryDeleteFile(path)
      if (response.success) {
        // Clear selection if deleted file was selected
        if (selectedFilePath.value === path) {
          clearSelection()
        }
        // Reload files
        await loadFiles()
        await loadTags()
        await loadStats()
        return true
      } else {
        error.value = response.error || 'Failed to delete file'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to delete file:', err)
      return false
    }
  }

  /**
   * Delete multiple files
   */
  async function deleteFiles(paths: string[]): Promise<BatchDeleteResult | null> {
    try {
      const response = await window.electronAPI.memoryDeleteFiles(paths)
      if (response.success && response.result) {
        // Clear selection if deleted file was selected
        if (selectedFilePath.value && paths.includes(selectedFilePath.value)) {
          clearSelection()
        }
        // Reload data
        await loadAll()
        return response.result
      } else {
        error.value = response.error || 'Failed to delete files'
        return null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to delete files:', err)
      return null
    }
  }

  /**
   * Export memory files
   */
  async function exportMemory(options: ExportOptions): Promise<string | null> {
    isExporting.value = true
    error.value = null
    try {
      const response = await window.electronAPI.memoryExport(options)
      if (response.success && response.filePath) {
        return response.filePath
      } else {
        error.value = response.error || 'Failed to export'
        return null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to export:', err)
      return null
    } finally {
      isExporting.value = false
    }
  }

  /**
   * Export with file dialog
   */
  async function exportWithDialog(options: ExportOptions): Promise<string | null> {
    isExporting.value = true
    error.value = null
    try {
      const response = await window.electronAPI.memoryExportWithDialog(options)
      if (response.success && response.filePath) {
        return response.filePath
      } else if (response.filePath === null) {
        // User cancelled
        return null
      } else {
        error.value = response.error || 'Failed to export'
        return null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to export:', err)
      return null
    } finally {
      isExporting.value = false
    }
  }

  /**
   * Import memory files
   */
  async function importMemory(filePath: string): Promise<ImportResult | null> {
    isImporting.value = true
    error.value = null
    try {
      const response = await window.electronAPI.memoryImport(filePath)
      if (response.success && response.result) {
        // Reload data after import
        await loadAll()
        return response.result
      } else {
        error.value = response.error || 'Failed to import'
        return null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to import:', err)
      return null
    } finally {
      isImporting.value = false
    }
  }

  /**
   * Import with file dialog
   */
  async function importWithDialog(): Promise<ImportResult | null> {
    isImporting.value = true
    error.value = null
    try {
      const response = await window.electronAPI.memoryImportWithDialog()
      if (response.success && response.result) {
        // Reload data after import
        await loadAll()
        return response.result
      } else if (response.result === null) {
        // User cancelled
        return null
      } else {
        error.value = response.error || 'Failed to import'
        return null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to import:', err)
      return null
    } finally {
      isImporting.value = false
    }
  }

  /**
   * Rename a tag across all files
   */
  async function renameTag(oldTag: string, newTag: string): Promise<number> {
    try {
      const response = await window.electronAPI.memoryRenameTag(oldTag, newTag)
      if (response.success) {
        // Reload tags and files
        await loadTags()
        await loadFiles()
        return response.affected || 0
      } else {
        error.value = response.error || 'Failed to rename tag'
        return 0
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to rename tag:', err)
      return 0
    }
  }

  /**
   * Delete a tag from all files
   */
  async function deleteTag(tag: string): Promise<number> {
    try {
      const response = await window.electronAPI.memoryDeleteTag(tag)
      if (response.success) {
        // Reload tags and files
        await loadTags()
        await loadFiles()
        return response.affected || 0
      } else {
        error.value = response.error || 'Failed to delete tag'
        return 0
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to delete tag:', err)
      return 0
    }
  }

  /**
   * Rebuild the memory index
   */
  async function rebuildIndex(): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.memoryRebuildIndex()
      if (response.success) {
        // Reload all data
        await loadAll()
        return true
      } else {
        error.value = response.error || 'Failed to rebuild index'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[MemoryManager] Failed to rebuild index:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Clear error
   */
  function clearError(): void {
    error.value = null
  }

  /**
   * Set search query
   */
  function setSearchQuery(query: string): void {
    searchQuery.value = query
  }

  /**
   * Toggle tag filter
   */
  function toggleTagFilter(tag: string): void {
    const index = selectedTags.value.indexOf(tag)
    if (index === -1) {
      selectedTags.value.push(tag)
    } else {
      selectedTags.value.splice(index, 1)
    }
  }

  /**
   * Clear all filters
   */
  function clearFilters(): void {
    searchQuery.value = ''
    selectedTags.value = []
  }

  return {
    // State
    files,
    tags,
    stats,
    selectedFile,
    selectedFilePath,
    isLoading,
    isExporting,
    isImporting,
    error,
    searchQuery,
    selectedTags,

    // Computed
    filteredFiles,
    totalFiles,
    tagCloud,

    // Actions
    loadFiles,
    loadTags,
    loadStats,
    loadAll,
    selectFile,
    clearSelection,
    updateFile,
    deleteFile,
    deleteFiles,
    exportMemory,
    exportWithDialog,
    importMemory,
    importWithDialog,
    renameTag,
    deleteTag,
    rebuildIndex,
    clearError,
    setSearchQuery,
    toggleTagFilter,
    clearFilters,
  }
})
