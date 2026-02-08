/**
 * File Tree IPC Handlers
 * Provides file tree listing for the right sidebar file browser
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { FileTreeNode, FileTreeListRequest, FileTreeListResponse } from '../../shared/ipc/file-tree.js'
import { classifyError } from '../../shared/errors.js'

/**
 * Common directories and files to ignore
 */
const DEFAULT_IGNORE_PATTERNS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.DS_Store',
  'Thumbs.db',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.idea',
  '.vscode',
  '.cache',
])

/**
 * Read and parse .gitignore file
 * Returns a set of patterns to ignore (simplified version)
 */
async function readGitignore(directory: string): Promise<Set<string>> {
  const patterns = new Set<string>()
  const gitignorePath = path.join(directory, '.gitignore')

  try {
    const content = await fs.readFile(gitignorePath, 'utf-8')
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue

      // Simple pattern - just add the directory/file name
      // Remove leading / and trailing /
      const pattern = trimmed.replace(/^\//, '').replace(/\/$/, '')
      if (pattern) {
        patterns.add(pattern)
      }
    }
  } catch {
    // .gitignore doesn't exist or can't be read - that's fine
  }

  return patterns
}

/**
 * Check if a file/directory should be ignored
 */
function shouldIgnore(name: string, gitignorePatterns: Set<string>, includeHidden: boolean): boolean {
  // Check hidden files
  if (!includeHidden && name.startsWith('.')) {
    return true
  }

  // Check default ignore patterns
  if (DEFAULT_IGNORE_PATTERNS.has(name)) {
    return true
  }

  // Check gitignore patterns
  if (gitignorePatterns.has(name)) {
    return true
  }

  return false
}

/**
 * List directory contents and return as FileTreeNode array
 */
async function listDirectory(
  directory: string,
  options: {
    depth: number
    currentDepth: number
    includeHidden: boolean
    respectGitignore: boolean
    gitignorePatterns: Set<string>
  }
): Promise<FileTreeNode[]> {
  const { depth, currentDepth, includeHidden, respectGitignore, gitignorePatterns } = options
  const nodes: FileTreeNode[] = []

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })

    for (const entry of entries) {
      const name = entry.name

      // Check if should be ignored
      if (respectGitignore && shouldIgnore(name, gitignorePatterns, includeHidden)) {
        continue
      }

      const fullPath = path.join(directory, name)

      if (entry.isDirectory()) {
        const node: FileTreeNode = {
          path: fullPath,
          name,
          type: 'directory',
        }

        // Recursively load children if within depth limit
        if (currentDepth < depth) {
          node.children = await listDirectory(fullPath, {
            ...options,
            currentDepth: currentDepth + 1,
          })
        }

        nodes.push(node)
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath)
          nodes.push({
            path: fullPath,
            name,
            type: 'file',
            size: stats.size,
            modifiedAt: stats.mtimeMs,
          })
        } catch {
          // File might have been deleted/moved, skip it
          nodes.push({
            path: fullPath,
            name,
            type: 'file',
          })
        }
      }
    }

    // Sort: directories first, then files, both alphabetically
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

    return nodes
  } catch (error) {
    console.error(`[FileTree IPC] Failed to list directory ${directory}:`, error)
    return []
  }
}

/**
 * Register file tree IPC handlers
 */
export function registerFileTreeHandlers() {
  ipcMain.handle(
    IPC_CHANNELS.FILE_TREE_LIST,
    async (_event, request: FileTreeListRequest): Promise<FileTreeListResponse> => {
      const {
        directory,
        depth = 1,
        includeHidden = false,
        respectGitignore = true,
      } = request

      if (!directory) {
        return { success: false, error: 'Directory is required' }
      }

      // Expand ~ to home directory
      let expandedPath = directory
      if (expandedPath.startsWith('~')) {
        expandedPath = expandedPath.replace('~', os.homedir())
      }

      try {
        // Check if directory exists
        const stats = await fs.stat(expandedPath)
        if (!stats.isDirectory()) {
          return { success: false, error: 'Path is not a directory' }
        }

        // Read gitignore patterns if needed
        let gitignorePatterns = new Set<string>()
        if (respectGitignore) {
          gitignorePatterns = await readGitignore(expandedPath)
        }

        // List directory contents
        const nodes = await listDirectory(expandedPath, {
          depth,
          currentDepth: 1,
          includeHidden,
          respectGitignore,
          gitignorePatterns,
        })

        return { success: true, nodes }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[FileTree][${appError.category}] Failed to list directory:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )
}
