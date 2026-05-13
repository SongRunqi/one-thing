/**
 * Tab system type definitions
 */

export type TabType = 'chat' | 'workbench' | 'file'

export interface ChatTab {
  id: string
  type: 'chat'
  sessionId: string
}

export interface FileTab {
  id: string
  type: 'file'
  filePath: string
  title: string
  dirty?: boolean
}

export interface WorkbenchTab {
  id: string
  type: 'workbench'
  workspaceRoot: string
  initialFilePath: string
  activeFilePath?: string
  title: string
  dirty?: boolean
}

export type Tab = ChatTab | WorkbenchTab | FileTab
