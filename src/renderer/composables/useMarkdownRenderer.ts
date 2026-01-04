import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import mathjax3 from 'markdown-it-mathjax3'

// Singleton markdown-it instance with highlight.js and MathJax
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true,
})

// Enable MathJax for LaTeX rendering
// Supports $...$ for inline math and $$...$$ for block math
md.use(mathjax3)

// Custom fence (code block) renderer
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const code = token.content
  const lang = token.info.trim() || 'text'

  // 处理 infographic 代码块
  if (lang === 'infographic') {
    try {
      // 验证 JSON 格式
      JSON.parse(code)
      // 返回占位符，将由 Vue 组件替换
      const configStr = encodeURIComponent(code)
      return `<div class="infographic-block" data-config="${configStr}">
        <div class="infographic-placeholder">
          <div class="placeholder-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 3v18h18"/>
              <path d="M18 17V9"/>
              <path d="M13 17V5"/>
              <path d="M8 17v-3"/>
            </svg>
          </div>
          <span>正在加载信息图表...</span>
        </div>
      </div>`
    } catch (e) {
      // JSON 解析失败，显示错误
      return `<div class="infographic-block infographic-error" data-config="${encodeURIComponent(code)}">
        <div class="infographic-parse-error">
          <div class="error-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <span>无效的图表配置 (JSON 格式错误)</span>
        </div>
      </div>`
    }
  }

  let highlighted: string
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch (e) {
      console.error('Highlight error:', e)
      highlighted = md.utils.escapeHtml(code)
    }
  } else {
    highlighted = md.utils.escapeHtml(code)
  }

  return `<div class="code-block-container">
    <div class="code-block-header">
      <div class="code-block-lang">${lang}</div>
      <button class="code-block-copy" onclick="navigator.clipboard.writeText(decodeURIComponent(this.getAttribute('data-code'))); this.querySelector('span').textContent='Copied!'; setTimeout(() => this.querySelector('span').textContent='Copy', 2000)" data-code="${encodeURIComponent(code)}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
    </div>
    <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
  </div>`
}

// Custom inline code renderer
md.renderer.rules.code_inline = (tokens, idx) => {
  const token = tokens[idx]
  return `<code class="inline-code">${md.utils.escapeHtml(token.content)}</code>`
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
export function renderMarkdown(content: string, isUserMessage: boolean = false): string {
  if (isUserMessage) {
    return escapeHtml(content).replace(/\n/g, '<br>')
  }
  return md.render(content)
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

  return content
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
