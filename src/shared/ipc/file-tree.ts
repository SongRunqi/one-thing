/**
 * File Tree IPC Types
 * Types for file tree listing and management
 */

export interface FileTreeNode {
  path: string            // Absolute path
  name: string            // File/folder name
  type: 'file' | 'directory'
  size?: number           // For files only (bytes)
  modifiedAt?: number     // Unix timestamp
  children?: FileTreeNode[] // For directories (lazy loaded)
}

export interface FileTreeListRequest {
  directory: string
  depth?: number           // Default: 1 (immediate children only)
  includeHidden?: boolean  // Default: false
  respectGitignore?: boolean // Default: true
}

export interface FileTreeListResponse {
  success: boolean
  nodes?: FileTreeNode[]
  error?: string
}

export interface ExtractedDocument {
  id: string
  type: 'mermaid' | 'chart' | 'plantuml' | 'latex'
  code: string
  messageId: string
  timestamp: number
  title?: string  // Optional title extracted from the code block
}

// File Preview types (for file preview panel)
export interface FilePreview {
  path: string
  name: string
  content: string
  language: string
  lineCount: number
}

export interface FileReadRequest {
  path: string
  maxSize?: number  // Limit large files (default: 1MB)
}

export interface FileReadResponse {
  success: boolean
  content?: string
  encoding?: string
  size?: number
  error?: string
}
