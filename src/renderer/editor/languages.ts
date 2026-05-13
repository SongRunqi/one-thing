import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { css } from '@codemirror/lang-css'
import { go } from '@codemirror/lang-go'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import type { EditorLanguage } from './types'

const EXTENSION_LANGUAGE: Record<string, EditorLanguage> = {
  css: 'css',
  go: 'go',
  html: 'html',
  htm: 'html',
  js: 'javascript',
  jsx: 'javascript',
  cjs: 'javascript',
  mjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rs: 'rust',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  toml: 'toml',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  vue: 'html',
  svg: 'html',
  xml: 'html',
}

export function languageFromPath(path?: string): EditorLanguage {
  if (!path) return 'plain'
  const cleanPath = path.split(/[?#]/)[0]
  const ext = cleanPath.includes('.') ? cleanPath.split('.').pop()?.toLowerCase() : ''
  return (ext && EXTENSION_LANGUAGE[ext]) || 'plain'
}

export function resolveEditorLanguage(language?: EditorLanguage, path?: string): EditorLanguage {
  return language && language !== 'plain' ? language : languageFromPath(path)
}

export function languageExtension(language?: EditorLanguage, path?: string): Extension[] {
  switch (resolveEditorLanguage(language, path)) {
    case 'css':
      return [css()]
    case 'go':
      return [go()]
    case 'html':
      return [html()]
    case 'javascript':
      return [javascript()]
    case 'typescript':
      return [javascript({ typescript: true })]
    case 'json':
      return [json()]
    case 'markdown':
      return [markdown()]
    case 'python':
      return [python()]
    case 'rust':
      return [rust()]
    case 'shell':
      return [StreamLanguage.define(shell)]
    case 'toml':
      return [StreamLanguage.define(toml)]
    case 'yaml':
      return [StreamLanguage.define(yaml)]
    case 'sql':
      return [StreamLanguage.define(standardSQL)]
    default:
      return []
  }
}
