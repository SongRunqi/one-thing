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

// Custom fence (code block) renderer with lazy highlighting
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const code = token.content
  const lang = token.info.trim() || 'text'
  const trimmedCode = code.trim()

  // 检测是否为 infographic 内容
  // 官方格式：```plain 代码块，内容以 "infographic " 开头
  // 也支持：```infographic 代码块（向后兼容）
  const isInfographicLang = lang === 'infographic'
  const isPlainWithInfographic = lang === 'plain' && trimmedCode.startsWith('infographic ')

  if (isInfographicLang || isPlainWithInfographic) {
    const isDSL = trimmedCode.startsWith('infographic ') ||
                  trimmedCode.startsWith('data') ||
                  trimmedCode.startsWith('theme')

    if (isDSL) {
      // 渲染为普通代码块样式，但添加 data-infographic 标记
      // 流式输出时显示代码，流式结束后由 MessageBubble 替换为 InfographicBlock
      const configStr = encodeURIComponent(code)
      const escapedCode = md.utils.escapeHtml(code)
      return `<div class="code-block-container infographic-block" data-config="${configStr}" data-syntax="dsl">
    <div class="code-block-header">
      <div class="code-block-lang">infographic</div>
      <button class="code-block-copy" onclick="navigator.clipboard.writeText(decodeURIComponent(this.getAttribute('data-code'))); this.querySelector('span').textContent='Copied!'; setTimeout(() => this.querySelector('span').textContent='Copy', 2000)" data-code="${configStr}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
    </div>
    <pre><code class="hljs">${escapedCode}</code></pre>
  </div>`
    }
  }

  // 延迟高亮：初始渲染为纯文本，使用 requestIdleCallback 或 IntersectionObserver 延迟高亮
  const escapedCode = md.utils.escapeHtml(code)
  const encodedCode = encodeURIComponent(code)
  
  // 如果语言支持高亮，标记为待高亮
  if (lang && hljs.getLanguage(lang)) {
    return `<div class="code-block-container" data-lazy-highlight="true" data-lang="${lang}" data-code="${encodedCode}">
    <div class="code-block-header">
      <div class="code-block-lang">${lang}</div>
      <button class="code-block-copy" onclick="navigator.clipboard.writeText(decodeURIComponent(this.getAttribute('data-code'))); this.querySelector('span').textContent='Copied!'; setTimeout(() => this.querySelector('span').textContent='Copy', 2000)" data-code="${encodedCode}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
    </div>
    <pre><code class="hljs language-${lang}">${escapedCode}</code></pre>
  </div>`
  }

  // 不支持高亮的语言，直接返回
  return `<div class="code-block-container">
    <div class="code-block-header">
      <div class="code-block-lang">${lang}</div>
      <button class="code-block-copy" onclick="navigator.clipboard.writeText(decodeURIComponent(this.getAttribute('data-code'))); this.querySelector('span').textContent='Copied!'; setTimeout(() => this.querySelector('span').textContent='Copy', 2000)" data-code="${encodedCode}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
    </div>
    <pre><code class="hljs language-${lang}">${escapedCode}</code></pre>
  </div>`
}

// 延迟高亮函数（由 MessageBubble 调用）
export function applyLazyHighlight(container: HTMLElement) {
  const blocks = container.querySelectorAll('[data-lazy-highlight="true"]')
  
  blocks.forEach((block) => {
    const lang = block.getAttribute('data-lang')
    const encodedCode = block.getAttribute('data-code')
    
    if (!lang || !encodedCode) return
    
    const codeElement = block.querySelector('code')
    if (!codeElement) return
    
    // 使用 requestIdleCallback 延迟高亮
    const applyHighlight = () => {
      try {
        const code = decodeURIComponent(encodedCode)
        const highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        codeElement.innerHTML = highlighted
        block.removeAttribute('data-lazy-highlight')
      } catch (e) {
        console.error('Lazy highlight error:', e)
        // 失败时保持原始转义文本
      }
    }
    
    // 优先使用 requestIdleCallback，降级为 setTimeout
    if ('requestIdleCallback' in window) {
      requestIdleCallback(applyHighlight, { timeout: 2000 })
    } else {
      setTimeout(applyHighlight, 0)
    }
  })
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
