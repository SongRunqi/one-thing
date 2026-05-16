import type { Component } from 'vue'
import type { EditorSelection } from '@/editor/types'
import type { TodoPlanDocument } from '@/types'
import type { MarkdownCommand } from '@/editor/markdown-document'
import type { TodoPlanSurface } from './todo-plan-utils'

export type TodoNotesActionGroup =
  | 'Note Actions'
  | 'Markdown Formatting'
  | 'Insert'
  | 'Navigation'
  | 'Window/Card'

export interface TodoNotesSurfaceActionContext {
  surface: TodoPlanSurface
  activeDocument?: TodoPlanDocument
  selection: EditorSelection
  canEditNote: boolean
  canDeleteNote: boolean
  pinned: boolean
  docked: boolean
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
  'Window/Card',
]
