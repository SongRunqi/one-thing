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

/**
 * 光标是否落在整段文本的首/末「视觉行」——软换行后一条逻辑行会占好几行，
 * 用 `\n` 数出来的逻辑行判不出用户眼里的第一行/最后一行。
 */
export interface EditorVisualLineEdges {
  atFirstLine: boolean
  atLastLine: boolean
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
  /** 只有能测量布局的编辑器实现（CodeMirror）提供；拿不到时调用方退回逻辑行判断。 */
  getVisualLineEdges?: () => EditorVisualLineEdges
}

export type EditorSettings = SharedEditorSettings
