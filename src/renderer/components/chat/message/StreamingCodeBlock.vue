<template>
  <div class="code-block-container">
    <div class="code-block-header">
      <div class="code-block-lang">
        {{ displayLang }}
      </div>
      <button
        class="code-block-copy"
        :class="{ copied }"
        :title="complete ? 'Copy' : 'Copy (streaming)'"
        type="button"
        @click="handleCopy"
      >
        <svg
          class="copy-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect
            x="9"
            y="9"
            width="13"
            height="13"
            rx="2"
            ry="2"
          />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <svg
          class="check-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </button>
    </div>
    <pre class="code-block-pre"><code
      ref="codeEl"
      :class="`hljs language-${lang}`"
    /></pre>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import hljs from 'highlight.js'
import { traceLog } from '@/utils/stream-scroll-trace'

interface Props {
  lang: string
  content: string
  complete: boolean
  isStreaming?: boolean
}

const props = defineProps<Props>()

const codeEl = ref<HTMLElement | null>(null)
const copied = ref(false)

const displayLang = computed(() => props.lang || 'text')
const shouldHighlight = computed(() => props.complete && !props.isStreaming)
const IMMEDIATE_HIGHLIGHT_LIMIT = 5000
let lastRenderedContent = ''
let lastRenderedHighlighted = false
let highlightJob: number | null = null

type IdleDeadline = {
  didTimeout: boolean
  timeRemaining: () => number
}

const scheduleIdle = typeof window !== 'undefined' && 'requestIdleCallback' in window
  ? (cb: (deadline: IdleDeadline) => void) => (window as any).requestIdleCallback(cb, { timeout: 600 }) as number
  : (cb: (deadline: IdleDeadline) => void) => window.setTimeout(() => cb({
    didTimeout: true,
    timeRemaining: () => 0,
  }), 80)

const cancelIdle = typeof window !== 'undefined' && 'cancelIdleCallback' in window
  ? (id: number) => (window as any).cancelIdleCallback(id)
  : (id: number) => window.clearTimeout(id)

function escapeHtml(s: string): string {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

/**
 * Patch the <code> element's innerHTML. The surrounding <pre> is never
 * rebuilt — so its scrollLeft survives across streaming updates, and any
 * selection the user holds inside an already-complete block remains
 * intact (we don't touch props.content once `complete` stays true).
 */
function renderHighlighted(): string {
  if (props.lang && hljs.getLanguage(props.lang)) {
    try {
      return hljs.highlight(props.content, {
        language: props.lang,
        ignoreIllegals: true,
      }).value
    } catch (err) {
      console.error('[StreamingCodeBlock] highlight failed', err)
    }
  }
  return escapeHtml(props.content)
}

function render() {
  const el = codeEl.value
  if (!el) return
  const highlighted = shouldHighlight.value
  if (lastRenderedContent === props.content && lastRenderedHighlighted === highlighted) return

  if (highlighted) {
    scheduleHighlightedRender()
    return
  }

  cancelHighlightJob()
  renderPlainText(el)
}

function renderPlainText(el: HTMLElement) {
  if (props.content.startsWith(lastRenderedContent) && !lastRenderedHighlighted) {
    const delta = props.content.slice(lastRenderedContent.length)
    if (delta) {
      const textNode = el.firstChild
      if (textNode?.nodeType === Node.TEXT_NODE) {
        textNode.textContent = (textNode.textContent || '') + delta
      } else {
        el.textContent = props.content
      }
    }
  } else {
    el.textContent = props.content
  }

  lastRenderedContent = props.content
  lastRenderedHighlighted = false

  if (import.meta.env.DEV) {
    const lines = props.content.split('\n').length
    traceLog(
      'CodeBlock:render',
      `lines=${lines} len=${props.content.length} hl=false complete=${props.complete}`,
    )
  }
}

function cancelHighlightJob() {
  if (highlightJob === null) return
  cancelIdle(highlightJob)
  highlightJob = null
}

function scheduleHighlightedRender() {
  if (props.content.length <= IMMEDIATE_HIGHLIGHT_LIMIT) {
    cancelHighlightJob()
    const el = codeEl.value
    if (!el) return
    el.innerHTML = renderHighlighted()
    lastRenderedContent = props.content
    lastRenderedHighlighted = true
    return
  }

  if (highlightJob !== null) return
  const expectedContent = props.content
  const expectedLang = props.lang
  highlightJob = scheduleIdle(() => {
    highlightJob = null
    const el = codeEl.value
    if (!el) return
    if (!shouldHighlight.value || props.content !== expectedContent || props.lang !== expectedLang) {
      render()
      return
    }

    el.innerHTML = renderHighlighted()
    lastRenderedContent = props.content
    lastRenderedHighlighted = true

    if (import.meta.env.DEV) {
      traceLog(
        'CodeBlock:highlight',
        `lines=${props.content.split('\n').length} len=${props.content.length} lang=${props.lang}`,
      )
    }
  })
}

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch (err) {
    console.error('[StreamingCodeBlock] copy failed', err)
  }
}

watch(() => props.content, () => {
  if (shouldHighlight.value) { render(); return }
  render()
})
watch(() => props.complete, (val, old) => {
  traceLog('CodeBlock:complete', `${old}→${val} lang=${props.lang} lines=${props.content.split('\n').length}`)
  render()
})
watch(() => props.isStreaming, (val, old) => {
  traceLog('CodeBlock:isStreaming', `${old}→${val} complete=${props.complete}`)
  render()
})
watch(() => props.lang, render)
onMounted(() => {
  traceLog('CodeBlock:mount', `lang=${props.lang} complete=${props.complete} lines=${props.content.split('\n').length}`)
  render()
})
onBeforeUnmount(() => {
  cancelHighlightJob()
  traceLog('CodeBlock:unmount', `lang=${props.lang} complete=${props.complete} lines=${props.content.split('\n').length}`)
})
</script>

<style scoped>
.code-block-container .code-block-pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: scroll;
  overflow-y: hidden;
  white-space: pre;
  line-height: 1.5;
  scrollbar-gutter: stable;
  tab-size: 2;
}

.code-block-container code {
  display: block;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: inherit;
  white-space: inherit;
}
</style>
