import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { FileTreeNode, ExtractedDocument, FilePreview } from '@shared/ipc'
import { useSessionsStore } from './sessions'

// Language mapping for syntax highlighting
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.vue': 'vue',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.xml': 'xml',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.r': 'r',
  '.lua': 'lua',
  '.dockerfile': 'dockerfile',
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'bash',
}

function getLanguageFromPath(filePath: string): string {
  // Extract extension using browser-compatible string operations
  const lastDotIndex = filePath.lastIndexOf('.')
  const ext = lastDotIndex !== -1 ? filePath.slice(lastDotIndex).toLowerCase() : ''
  return LANGUAGE_MAP[ext] || 'plaintext'
}

export type RightSidebarTab = 'files' | 'git' | 'documents'

export const useRightSidebarStore = defineStore('rightSidebar', () => {
  // ==================== Visibility & Layout ====================

  // Load persisted state from localStorage (except isOpen which always starts false)
  const savedPanelWidth = localStorage.getItem('rightPanelWidth')
  const savedSidebarWidth = localStorage.getItem('rightSidebarWidth')
  const savedActiveTab = localStorage.getItem('rightSidebarActiveTab') as RightSidebarTab | null

  // Always start closed - user requested this behavior
  const isOpen = ref(false)
  // Panel width = total width of the entire right panel (sidebar + preview)
  const panelWidth = ref(savedPanelWidth ? parseInt(savedPanelWidth, 10) : 700)
  // Sidebar width = width of the sidebar section within the panel
  const sidebarWidth = ref(savedSidebarWidth ? parseInt(savedSidebarWidth, 10) : 280)
  const activeTab = ref<RightSidebarTab>(savedActiveTab || 'files')
  const isResizing = ref(false)

  // ==================== Files Tab State ====================

  // Cache file trees per working directory
  const fileTreeCache = ref<Map<string, FileTreeNode[]>>(new Map())
  // Track expanded paths per working directory
  const expandedPaths = ref<Map<string, Set<string>>>(new Map())
  // Loading state per working directory
  const fileTreeLoading = ref<Map<string, boolean>>(new Map())
  // Error state
  const fileTreeError = ref<string | null>(null)

  // ==================== Documents Tab State ====================

  // Extracted documents (Mermaid, charts, etc.) per session
  const extractedDocuments = ref<Map<string, ExtractedDocument[]>>(new Map())

  // ==================== File Preview State ====================

  const previewFile = ref<FilePreview | null>(null)
  const isPreviewOpen = ref(false)
  const isPreviewLoading = ref(false)
  const previewError = ref<string | null>(null)

  // ==================== Computed Properties ====================

  const sessionsStore = useSessionsStore()

  const currentWorkingDirectory = computed(() => {
    return sessionsStore.currentSession?.workingDirectory || ''
  })

  const currentFileTree = computed(() => {
    if (!currentWorkingDirectory.value) return []
    return fileTreeCache.value.get(currentWorkingDirectory.value) || []
  })

  const currentExpandedPaths = computed(() => {
    if (!currentWorkingDirectory.value) return new Set<string>()
    return expandedPaths.value.get(currentWorkingDirectory.value) || new Set<string>()
  })

  const isCurrentTreeLoading = computed(() => {
    if (!currentWorkingDirectory.value) return false
    return fileTreeLoading.value.get(currentWorkingDirectory.value) || false
  })

  const currentDocuments = computed(() => {
    const sessionId = sessionsStore.currentSessionId
    if (!sessionId) return []
    return extractedDocuments.value.get(sessionId) || []
  })

  // ==================== Actions ====================

  function toggle() {
    isOpen.value = !isOpen.value
    localStorage.setItem('rightSidebarOpen', String(isOpen.value))
  }

  function open() {
    isOpen.value = true
    localStorage.setItem('rightSidebarOpen', 'true')
  }

  function close() {
    isOpen.value = false
    localStorage.setItem('rightSidebarOpen', 'false')
  }

  function setPanelWidth(newWidth: number) {
    panelWidth.value = newWidth
    localStorage.setItem('rightPanelWidth', String(newWidth))
  }

  function setSidebarWidth(newWidth: number) {
    sidebarWidth.value = newWidth
    localStorage.setItem('rightSidebarWidth', String(newWidth))
  }

  function setActiveTab(tab: RightSidebarTab) {
    activeTab.value = tab
    localStorage.setItem('rightSidebarActiveTab', tab)
  }

  function setResizing(value: boolean) {
    isResizing.value = value
  }

  // ==================== File Tree Actions ====================

  async function loadFileTree(directory: string, forceRefresh = false) {
    if (!directory) return

    // Check cache first (unless force refresh)
    if (!forceRefresh && fileTreeCache.value.has(directory)) {
      return
    }

    fileTreeLoading.value.set(directory, true)
    fileTreeError.value = null

    try {
      const response = await window.electronAPI.fileTreeList({
        directory,
        depth: 1,
        includeHidden: false,
        respectGitignore: true,
      })

      if (response.success && response.nodes) {
        fileTreeCache.value.set(directory, response.nodes)
      } else {
        fileTreeError.value = response.error || 'Failed to load file tree'
      }
    } catch (error) {
      fileTreeError.value = error instanceof Error ? error.message : 'Unknown error'
    } finally {
      fileTreeLoading.value.set(directory, false)
    }
  }

  async function loadDirectoryChildren(directoryPath: string) {
    if (!directoryPath) return

    try {
      const response = await window.electronAPI.fileTreeList({
        directory: directoryPath,
        depth: 1,
        includeHidden: false,
        respectGitignore: true,
      })

      if (response.success && response.nodes) {
        // Find the directory node in the cache and update its children
        const workingDir = currentWorkingDirectory.value
        if (!workingDir) return

        const tree = fileTreeCache.value.get(workingDir)
        if (!tree) return

        // Recursively find and update the directory node
        const updateNode = (nodes: FileTreeNode[]): boolean => {
          for (const node of nodes) {
            if (node.path === directoryPath) {
              node.children = response.nodes
              return true
            }
            if (node.children && updateNode(node.children)) {
              return true
            }
          }
          return false
        }

        updateNode(tree)
        // Trigger reactivity
        fileTreeCache.value = new Map(fileTreeCache.value)
      }
    } catch (error) {
      console.error('Failed to load directory children:', error)
    }
  }

  function toggleExpanded(path: string) {
    const workingDir = currentWorkingDirectory.value
    if (!workingDir) return

    let paths = expandedPaths.value.get(workingDir)
    if (!paths) {
      paths = new Set<string>()
      expandedPaths.value.set(workingDir, paths)
    }

    if (paths.has(path)) {
      paths.delete(path)
    } else {
      paths.add(path)
      // Load children when expanding
      loadDirectoryChildren(path)
    }

    // Trigger reactivity
    expandedPaths.value = new Map(expandedPaths.value)
  }

  function isPathExpanded(path: string): boolean {
    const workingDir = currentWorkingDirectory.value
    if (!workingDir) return false

    const paths = expandedPaths.value.get(workingDir)
    return paths?.has(path) || false
  }

  function clearFileTreeCache(directory?: string) {
    if (directory) {
      fileTreeCache.value.delete(directory)
      expandedPaths.value.delete(directory)
    } else {
      fileTreeCache.value.clear()
      expandedPaths.value.clear()
    }
  }

  // ==================== Documents Actions ====================

  function setExtractedDocuments(sessionId: string, documents: ExtractedDocument[]) {
    extractedDocuments.value.set(sessionId, documents)
  }

  function clearExtractedDocuments(sessionId?: string) {
    if (sessionId) {
      extractedDocuments.value.delete(sessionId)
    } else {
      extractedDocuments.value.clear()
    }
  }

  // ==================== File Preview Actions ====================

  async function openPreview(file: FileTreeNode) {
    if (file.type !== 'file') return

    isPreviewLoading.value = true
    previewError.value = null

    try {
      const response = await window.electronAPI.readFileContent(file.path)

      if (response.success && response.content !== undefined) {
        const lines = response.content.split('\n')
        previewFile.value = {
          path: file.path,
          name: file.name,
          content: response.content,
          language: getLanguageFromPath(file.path),
          lineCount: lines.length,
        }
        isPreviewOpen.value = true
      } else {
        previewError.value = response.error || 'Failed to read file'
      }
    } catch (error) {
      previewError.value = error instanceof Error ? error.message : 'Unknown error'
    } finally {
      isPreviewLoading.value = false
    }
  }

  function closePreview() {
    isPreviewOpen.value = false
    previewFile.value = null
    previewError.value = null
  }

  // ==================== Watchers ====================

  // Auto-load file tree when working directory changes
  watch(currentWorkingDirectory, (newDir, oldDir) => {
    if (newDir && newDir !== oldDir && isOpen.value) {
      loadFileTree(newDir)
    }
  })

  // Load file tree when sidebar opens
  watch(isOpen, (open) => {
    if (open && currentWorkingDirectory.value) {
      loadFileTree(currentWorkingDirectory.value)
    }
  })

  return {
    // State
    isOpen,
    panelWidth,
    sidebarWidth,
    activeTab,
    isResizing,
    fileTreeCache,
    expandedPaths,
    fileTreeLoading,
    fileTreeError,
    extractedDocuments,
    // File Preview State
    previewFile,
    isPreviewOpen,
    isPreviewLoading,
    previewError,

    // Computed
    currentWorkingDirectory,
    currentFileTree,
    currentExpandedPaths,
    isCurrentTreeLoading,
    currentDocuments,

    // Actions
    toggle,
    open,
    close,
    setPanelWidth,
    setSidebarWidth,
    setActiveTab,
    setResizing,
    loadFileTree,
    loadDirectoryChildren,
    toggleExpanded,
    isPathExpanded,
    clearFileTreeCache,
    setExtractedDocuments,
    clearExtractedDocuments,
    // File Preview Actions
    openPreview,
    closePreview,
  }
})
