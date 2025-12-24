<template>
  <div class="result-block">
    <div class="result-header">
      <span class="result-label">{{ label }}</span>
      <button class="copy-btn" @click="copyContent" :title="copied ? '已复制' : '复制'">
        <svg v-if="!copied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
    </div>
    <div class="result-content" :class="{ 'is-expanded': isExpanded }">
      <pre><code ref="codeEl" :class="highlightClass" v-html="highlightedContent"></code></pre>
    </div>
    <button
      v-if="shouldShowExpandButton"
      class="expand-btn"
      @click="isExpanded = !isExpanded"
    >
      {{ isExpanded ? '收起' : `展开全部 (${contentLines} 行)` }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import css from 'highlight.js/lib/languages/css'
import python from 'highlight.js/lib/languages/python'

// Register languages
hljs.registerLanguage('json', json)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('css', css)
hljs.registerLanguage('python', python)

const props = withDefaults(defineProps<{
  content: string
  label?: string
  language?: string
  maxLines?: number
}>(), {
  label: '结果',
  maxLines: 15
})

const codeEl = ref<HTMLElement | null>(null)
const isExpanded = ref(false)
const copied = ref(false)

const contentLines = computed(() => props.content.split('\n').length)

const shouldShowExpandButton = computed(() => {
  return contentLines.value > props.maxLines
})

// Detect content type for syntax highlighting
const detectedLanguage = computed(() => {
  if (props.language) return props.language

  const content = props.content.trim()

  // Try to detect JSON
  if ((content.startsWith('{') && content.endsWith('}')) ||
      (content.startsWith('[') && content.endsWith(']'))) {
    try {
      JSON.parse(content)
      return 'json'
    } catch {
      // Not valid JSON
    }
  }

  // Detect bash/shell output patterns
  if (content.includes('$ ') || content.includes('# ') ||
      /^(total|drwx|[-rwx]{10})/.test(content) ||
      /^\s*(export|echo|cd|ls|cat|grep|npm|yarn|git)\s/.test(content)) {
    return 'bash'
  }

  // Detect markdown
  if (/^#{1,6}\s/.test(content) || /^\s*[-*]\s/.test(content)) {
    return 'markdown'
  }

  // Detect HTML/XML
  if (content.startsWith('<') && content.includes('>')) {
    return 'html'
  }

  return 'plaintext'
})

const highlightClass = computed(() => {
  return detectedLanguage.value !== 'plaintext' ? `language-${detectedLanguage.value}` : ''
})

const highlightedContent = computed(() => {
  if (detectedLanguage.value === 'plaintext') {
    return escapeHtml(props.content)
  }

  try {
    const result = hljs.highlight(props.content, {
      language: detectedLanguage.value,
      ignoreIllegals: true
    })
    return result.value
  } catch {
    return escapeHtml(props.content)
  }
})

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// Re-highlight when content changes
watch(() => props.content, () => {
  // Force re-computation
}, { immediate: true })
</script>

<style scoped>
.result-block {
  margin-top: 8px;
  border-radius: 6px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.result-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-tertiary, #666);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.copy-btn svg {
  flex-shrink: 0;
}

.result-content {
  max-height: 200px;
  overflow-y: auto;
  overflow-x: auto;
}

.result-content.is-expanded {
  max-height: none;
}

.result-content pre {
  margin: 0;
  padding: 10px 12px;
  background: transparent;
}

.result-content code {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-word;
}

.expand-btn {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: rgba(255, 255, 255, 0.03);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--color-accent, #3b82f6);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.expand-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* Highlight.js theme - VS Code Dark+ inspired */
:deep(.hljs-keyword) { color: #569cd6; }
:deep(.hljs-built_in) { color: #4ec9b0; }
:deep(.hljs-type) { color: #4ec9b0; }
:deep(.hljs-literal) { color: #569cd6; }
:deep(.hljs-number) { color: #b5cea8; }
:deep(.hljs-string) { color: #ce9178; }
:deep(.hljs-symbol) { color: #ce9178; }
:deep(.hljs-comment) { color: #6a9955; }
:deep(.hljs-punctuation) { color: #d4d4d4; }
:deep(.hljs-attr) { color: #9cdcfe; }
:deep(.hljs-attribute) { color: #9cdcfe; }
:deep(.hljs-variable) { color: #9cdcfe; }
:deep(.hljs-property) { color: #9cdcfe; }
:deep(.hljs-title) { color: #dcdcaa; }
:deep(.hljs-function) { color: #dcdcaa; }
:deep(.hljs-class) { color: #4ec9b0; }
:deep(.hljs-tag) { color: #569cd6; }
:deep(.hljs-name) { color: #569cd6; }
:deep(.hljs-selector-class) { color: #d7ba7d; }
:deep(.hljs-selector-id) { color: #d7ba7d; }
:deep(.hljs-meta) { color: #569cd6; }

/* Light theme */
html[data-theme='light'] .result-block {
  background: #f5f5f5;
  border-color: rgba(0, 0, 0, 0.08);
}

html[data-theme='light'] .result-header {
  background: rgba(0, 0, 0, 0.03);
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

html[data-theme='light'] .result-content code {
  color: #1f1f1f;
}

html[data-theme='light'] .expand-btn {
  background: rgba(0, 0, 0, 0.03);
  border-top-color: rgba(0, 0, 0, 0.06);
}

html[data-theme='light'] .expand-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

/* Light theme syntax colors */
html[data-theme='light'] :deep(.hljs-keyword) { color: #0000ff; }
html[data-theme='light'] :deep(.hljs-built_in) { color: #267f99; }
html[data-theme='light'] :deep(.hljs-type) { color: #267f99; }
html[data-theme='light'] :deep(.hljs-literal) { color: #0000ff; }
html[data-theme='light'] :deep(.hljs-number) { color: #098658; }
html[data-theme='light'] :deep(.hljs-string) { color: #a31515; }
html[data-theme='light'] :deep(.hljs-comment) { color: #008000; }
html[data-theme='light'] :deep(.hljs-attr) { color: #001080; }
html[data-theme='light'] :deep(.hljs-property) { color: #001080; }
html[data-theme='light'] :deep(.hljs-title) { color: #795e26; }
html[data-theme='light'] :deep(.hljs-function) { color: #795e26; }
html[data-theme='light'] :deep(.hljs-tag) { color: #800000; }
html[data-theme='light'] :deep(.hljs-name) { color: #800000; }

/* Scrollbar styling */
.result-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.result-content::-webkit-scrollbar-track {
  background: transparent;
}

.result-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.result-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

html[data-theme='light'] .result-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

html[data-theme='light'] .result-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
</style>
