import type { EditorSettings as SharedEditorSettings } from '@shared/ipc'

export type EditorProfile =
  | 'composer'
  | 'inline-message'
  | 'markdown-document'
  | 'code-file'

export type EditorLanguage =
  | 'plain'
  | 'markdown'
  | 'typescript'
  | 'javascript'
  | 'json'
  | 'html'
  | 'css'
  | 'python'
  | 'go'
  | 'rust'
  | 'shell'
  | 'yaml'
  | 'toml'
  | 'sql'

export interface EditorSelection {
  from: number
  to: number
}

export interface EditorCursorLineInfo {
  lineNumber: number
  totalLines: number
  from: number
  to: number
  text: string
}

export interface EditorSetValueOptions {
  preserveSelection?: boolean
}

export interface EditorTransaction {
  value: string
  selection: EditorSelection
  docChanged: boolean
  selectionChanged: boolean
}

export interface EditorHandle {
  focus: () => void
  blur: () => void
  getValue: () => string
  getSelectedText: () => string
  setValue: (value: string, options?: EditorSetValueOptions) => void
  getSelection: () => EditorSelection
  setSelection: (from: number, to?: number) => void
  replaceRange: (from: number, to: number, text: string) => void
  scrollToTop: () => void
  getScrollTop: () => number
  setScrollTop: (scrollTop: number) => void
  getCursorLineInfo: () => EditorCursorLineInfo
}

export type EditorSettings = SharedEditorSettings
