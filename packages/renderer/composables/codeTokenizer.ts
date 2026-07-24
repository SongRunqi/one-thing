import type { Language } from '@codemirror/language'
import { StreamLanguage } from '@codemirror/language'
import { javascriptLanguage, typescriptLanguage } from '@codemirror/lang-javascript'
import { pythonLanguage } from '@codemirror/lang-python'
import { goLanguage } from '@codemirror/lang-go'
import { rustLanguage } from '@codemirror/lang-rust'
import { jsonLanguage } from '@codemirror/lang-json'
import { htmlLanguage } from '@codemirror/lang-html'
import { cssLanguage } from '@codemirror/lang-css'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'

export interface CodeToken {
  from: number
  to: number
  className: string
}

export interface RenderToken {
  key: string
  text: string
  className: string
}

export interface RenderCodeLine {
  key: string
  tokens: RenderToken[]
}

const tokenHighlighter = tagHighlighter([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], class: 'tok-keyword' },
  { tag: [tags.atom, tags.bool, tags.null], class: 'tok-atom' },
  { tag: [tags.number, tags.integer, tags.float], class: 'tok-number' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'tok-string' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'tok-comment' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], class: 'tok-definition' },
  { tag: tags.variableName, class: 'tok-variable' },
  { tag: tags.propertyName, class: 'tok-property' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'tok-type' },
  { tag: [tags.function(tags.propertyName), tags.function(tags.variableName)], class: 'tok-function' },
  { tag: [tags.tagName, tags.attributeName], class: 'tok-tag' },
  { tag: [tags.punctuation, tags.bracket, tags.separator], class: 'tok-punctuation' },
  { tag: [tags.invalid, tags.deleted], class: 'tok-invalid' },
  { tag: tags.inserted, class: 'tok-inserted' },
  { tag: tags.heading, class: 'tok-heading' },
  { tag: tags.link, class: 'tok-link' },
  { tag: tags.emphasis, class: 'tok-emphasis' },
  { tag: tags.strong, class: 'tok-strong' },
])

const streamLanguages = {
  shell: StreamLanguage.define(shell),
  yaml: StreamLanguage.define(yaml),
  toml: StreamLanguage.define(toml),
  sql: StreamLanguage.define(standardSQL),
  dockerfile: StreamLanguage.define(dockerFile),
}

function normalizeLang(lang: string): string {
  return lang.trim().toLowerCase().replace(/^language-/, '')
}

function getLanguage(lang: string): Language | null {
  const normalized = normalizeLang(lang)
  switch (normalized) {
    case 'js':
    case 'jsx':
    case 'javascript':
      return javascriptLanguage
    case 'ts':
    case 'tsx':
    case 'typescript':
      return typescriptLanguage
    case 'py':
    case 'python':
      return pythonLanguage
    case 'go':
    case 'golang':
      return goLanguage
    case 'rs':
    case 'rust':
      return rustLanguage
    case 'json':
      return jsonLanguage
    case 'html':
    case 'xml':
    case 'vue':
    case 'svelte':
      return htmlLanguage
    case 'css':
    case 'scss':
    case 'less':
      return cssLanguage
    case 'md':
    case 'markdown':
      return markdownLanguage
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'shell':
      return streamLanguages.shell
    case 'yaml':
    case 'yml':
      return streamLanguages.yaml
    case 'toml':
      return streamLanguages.toml
    case 'sql':
      return streamLanguages.sql
    case 'dockerfile':
    case 'docker':
      return streamLanguages.dockerfile
    default:
      return null
  }
}

export function tokenizeCode(lang: string, code: string): CodeToken[] {
  if (!code) return []
  const language = getLanguage(lang)
  if (!language) return []

  const tree = language.parser.parse(code)
  const tokens: CodeToken[] = []
  highlightTree(tree, tokenHighlighter, (from, to, className) => {
    if (from < to) tokens.push({ from, to, className })
  })
  return tokens
}

export function renderTokenSpans(lang: string, code: string): RenderToken[] {
  if (!code) return [{ key: 'empty', text: '', className: '' }]

  const tokens = tokenizeCode(lang, code)
  if (tokens.length === 0) {
    return [{ key: `plain-0-${code.length}`, text: code, className: '' }]
  }

  const spans: RenderToken[] = []
  let cursor = 0
  for (const token of tokens) {
    if (token.from > cursor) {
      spans.push({
        key: `plain-${cursor}-${token.from}`,
        text: code.slice(cursor, token.from),
        className: '',
      })
    }
    spans.push({
      key: `${token.className}-${token.from}-${token.to}`,
      text: code.slice(token.from, token.to),
      className: token.className,
    })
    cursor = token.to
  }
  if (cursor < code.length) {
    spans.push({
      key: `plain-${cursor}-${code.length}`,
      text: code.slice(cursor),
      className: '',
    })
  }
  return spans
}

export function renderCodeLines(lang: string, code: string): RenderCodeLine[] {
  const lines = code.split('\n')
  const tokens = tokenizeCode(lang, code)
  const renderedLines: RenderCodeLine[] = []
  let lineStart = 0
  let tokenIndex = 0

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const lineEnd = lineStart + line.length
    const lineTokens: RenderToken[] = []
    let cursor = lineStart

    while (tokenIndex < tokens.length && tokens[tokenIndex].to <= lineStart) {
      tokenIndex++
    }

    let scanIndex = tokenIndex
    while (scanIndex < tokens.length && tokens[scanIndex].from < lineEnd) {
      const token = tokens[scanIndex]
      const from = Math.max(token.from, lineStart)
      const to = Math.min(token.to, lineEnd)
      if (from > cursor) {
        lineTokens.push({
          key: `plain-${cursor}-${from}`,
          text: code.slice(cursor, from),
          className: '',
        })
      }
      if (from < to) {
        lineTokens.push({
          key: `${token.className}-${from}-${to}`,
          text: code.slice(from, to),
          className: token.className,
        })
      }
      cursor = Math.max(cursor, to)
      scanIndex++
    }

    if (cursor < lineEnd) {
      lineTokens.push({
        key: `plain-${cursor}-${lineEnd}`,
        text: code.slice(cursor, lineEnd),
        className: '',
      })
    }

    if (lineTokens.length === 0) {
      lineTokens.push({
        key: `plain-empty-${lineIndex}`,
        text: ' ',
        className: '',
      })
    }

    renderedLines.push({
      key: `line-${lineIndex}`,
      tokens: lineTokens,
    })
    lineStart = lineEnd + 1
  }

  return renderedLines
}
