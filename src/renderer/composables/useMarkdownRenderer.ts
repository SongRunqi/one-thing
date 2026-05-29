import { copyTextToClipboard } from '@/utils/clipboard'
import { perfMark, perfMeasure } from '@/utils/perf'
import { replaceEmojiShortcodes } from '@/editor/markdown-emoji'
import type { MarkdownRenderOptions } from '@/editor/markdown-document'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import mathjax3 from 'markdown-it-mathjax3'

interface MarkdownRendererConfig {
  enableMath: boolean
  allowHtml: boolean
}

const markdownRendererCache = new Map<string, MarkdownIt>()
let codeCopyHandlerInstalled = false

function createMarkdownRenderer(config: MarkdownRendererConfig) {
  const instance = new MarkdownIt({
    html: config.allowHtml,
    breaks: true,
    linkify: true,
    typographer: true,
  })

  if (config.enableMath) {
    // Supports $...$ for inline math and $$...$$ for block math.
    instance.use(mathjax3)
  }

  instance.renderer.rules.text = (tokens, idx) => {
    return instance.utils.escapeHtml(replaceEmojiShortcodes(tokens[idx].content))
  }

  // Custom fence (code block) renderer
  instance.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const code = token.content
    const rawLang = token.info.trim().split(/\s+/)[0] || 'text'
    const lang = sanitizeCodeLanguage(rawLang)
    const langLabel = instance.utils.escapeHtml(rawLang || 'text')
    let highlighted: string
    if (rawLang && hljs.getLanguage(rawLang)) {
      try {
        highlighted = hljs.highlight(code, { language: rawLang, ignoreIllegals: true }).value
      } catch (e) {
        console.error('Highlight error:', e)
        highlighted = instance.utils.escapeHtml(code)
      }
    } else {
      highlighted = instance.utils.escapeHtml(code)
    }

    return `<div class="code-block-container">
    <div class="code-block-header">
      <div class="code-block-lang">${langLabel}</div>
      <button class="code-block-copy" type="button" data-code="${escapeHtmlAttribute(encodeURIComponent(code))}" title="Copy" aria-label="Copy code">
        <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
      </button>
    </div>
    <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
  </div>`
  }

  // Custom inline code renderer
  instance.renderer.rules.code_inline = (tokens, idx) => {
    const token = tokens[idx]
    return `<code class="inline-code">${instance.utils.escapeHtml(token.content)}</code>`
  }

  return instance
}

function getMarkdownRenderer(config: MarkdownRendererConfig): MarkdownIt {
  const key = `${config.enableMath}:${config.allowHtml}`
  const existing = markdownRendererCache.get(key)
  if (existing) return existing
  const instance = createMarkdownRenderer(config)
  markdownRendererCache.set(key, instance)
  return instance
}

function sanitizeCodeLanguage(lang: string): string {
  return (lang || 'text').replace(/[^\w-]/g, '-') || 'text'
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function ensureCodeCopyHandler(): void {
  if (codeCopyHandlerInstalled || typeof document === 'undefined') return
  codeCopyHandlerInstalled = true
  document.addEventListener('click', async (event) => {
    const target = event.target as Element | null
    const button = target?.closest?.('.code-block-copy[data-code]') as HTMLButtonElement | null
    if (!button) return
    const encoded = button.getAttribute('data-code') || ''
    const copied = await copyTextToClipboard(decodeURIComponent(encoded))
    if (!copied) {
      console.warn('Failed to copy code block')
      return
    }

    button.classList.add('copied')
    window.setTimeout(() => button.classList.remove('copied'), 1500)
  })
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Render markdown content to HTML
 * For user messages, escapes HTML and converts newlines to <br>
 * For assistant messages, uses full markdown rendering
 */
export function renderMarkdown(
  content: string,
  isUserMessage: boolean = false,
  options: MarkdownRenderOptions = {},
): string {
  if (isUserMessage || options.surface === 'user-message') {
    return escapeHtml(content).replace(/\n/g, '<br>')
  }
  perfMark('md-render-start')
  ensureCodeCopyHandler()
  const streaming = options.streaming || options.surface === 'streaming'
  const html = getMarkdownRenderer({
    enableMath: options.math ?? !streaming,
    allowHtml: options.allowHtml ?? false,
  }).render(content)
  perfMark('md-render-end')
  perfMeasure('md.render', 'md-render-start', 'md-render-end')
  return html
}

/**
 * Clean reasoning content by removing XML tags (e.g., <think>...</think> from DeepSeek-R1)
 */
export function cleanReasoningContent(content: string): string {
  if (!content) return ''

  // Remove <think> and </think> tags (case-insensitive)
  let cleaned = content.replace(/<\/?think>/gi, '')

  // Remove other common reasoning-related XML tags
  cleaned = cleaned.replace(/<\/?thinking>/gi, '')
  cleaned = cleaned.replace(/<\/?reasoning>/gi, '')

  // Trim leading/trailing whitespace
  return cleaned.trim()
}

/**
 * Strip markdown formatting from text (for TTS)
 */
export function stripMarkdown(content: string): string {
  if (!content) return ''

  return replaceEmojiShortcodes(content)
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`[^`]+`/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove headers
    .replace(/^#+\s*/gm, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Remove blockquotes
    .replace(/^>\s*/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Composable for markdown rendering utilities
 */
export function useMarkdownRenderer() {
  return {
    renderMarkdown,
    escapeHtml,
    cleanReasoningContent,
    stripMarkdown,
  }
}
