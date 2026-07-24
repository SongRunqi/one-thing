import type { Component } from 'vue'
import type { EditorSelection } from '@/editor/types'
import type { TodoPlanDocument } from '@/types'
import type { MarkdownCommand } from '@/editor/markdown-document'

export type TodoNotesActionGroup =
  | 'Note Actions'
  | 'Markdown Formatting'
  | 'Insert'
  | 'Navigation'

export interface TodoNotesActionContext {
  activeDocument?: TodoPlanDocument
  selection: EditorSelection
  canEditNote: boolean
  canDeleteNote: boolean
}

export interface TodoNotesAction {
  id: string
  title: string
  subtitle?: string
  group: TodoNotesActionGroup
  keywords?: string[]
  shortcut?: string
  icon?: Component
  enabled?: boolean
  visible?: boolean
  markdownCommand?: MarkdownCommand
  run: () => void | Promise<void>
}

export const TODO_NOTES_ACTION_GROUPS: TodoNotesActionGroup[] = [
  'Note Actions',
  'Markdown Formatting',
  'Insert',
  'Navigation',
]
