/**
 * Tab system type definitions
 */

export type TabType = 'chat' | 'file'

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
}

export type Tab = ChatTab | FileTab
