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
      :class="`cm-code language-${lang}`"
    /></pre>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderTokenSpans } from '@/composables/codeTokenizer'

interface Props {
  lang: string
  content: string
  complete: boolean
  isStreaming?: boolean
}

const props = defineProps<Props>()

const copied = ref(false)
const displayLang = computed(() => props.lang || 'text')
const codeEl = ref<HTMLElement | null>(null)

interface LineState {
  text: string
  frozen: boolean
  el: HTMLSpanElement
}

const raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number
const caf = typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame
  : (id: number) => clearTimeout(id)

let lineStates: LineState[] = []
let renderFrame: number | null = null
let renderedLang = props.lang

function createLineEl(): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = 'code-line stream-code-line'
  el.dataset.codeLine = ''
  el.style.display = 'block'
  el.style.minHeight = '20px'
  return el
}

function renderLineEl(lineEl: HTMLElement, text: string) {
  lineEl.replaceChildren()
  const source = text || ' '
  const fragment = document.createDocumentFragment()
  for (const token of renderTokenSpans(props.lang, source)) {
    const span = document.createElement('span')
    if (token.className) span.className = token.className
    span.textContent = token.text
    fragment.appendChild(span)
  }
  lineEl.appendChild(fragment)
}

function clearRenderedLines() {
  codeEl.value?.replaceChildren()
  lineStates = []
  renderedLang = props.lang
}

function renderIncrementalCode() {
  const root = codeEl.value
  if (!root) return

  if (renderedLang !== props.lang) {
    // Language changes mean token classes are no longer comparable.
    clearRenderedLines()
  }

  const lines = props.content.split('\n')
  const activeLineIndex = props.complete ? -1 : lines.length - 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const frozen = i !== activeLineIndex
    const existing = lineStates[i]

    if (existing && existing.text === line) {
      existing.frozen = existing.frozen || frozen
      continue
    }

    const lineEl = existing?.el ?? createLineEl()
    renderLineEl(lineEl, line)
    if (!existing) root.appendChild(lineEl)
    lineStates[i] = { text: line, frozen, el: lineEl }
  }

  while (lineStates.length > lines.length) {
    const removed = lineStates.pop()
    removed?.el.remove()
  }
}

function scheduleRender() {
  if (renderFrame !== null) return
  renderFrame = raf(() => {
    renderFrame = null
    renderIncrementalCode()
  })
}

watch(() => [props.content, props.lang, props.complete, props.isStreaming] as const, scheduleRender)

onMounted(() => {
  nextTick(renderIncrementalCode)
})

onBeforeUnmount(() => {
  if (renderFrame !== null) {
    caf(renderFrame)
    renderFrame = null
  }
  lineStates = []
})

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
</script>

<style scoped>
.code-block-container .code-block-pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  overflow-y: hidden;
  line-height: 20px;
  scrollbar-width: none;
  tab-size: 2;
}

.code-block-container .code-block-pre::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.code-block-container code {
  display: block;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: inherit;
  white-space: pre;
}

.code-block-container code :deep(.code-line) {
  display: block;
  min-height: 20px;
}

.code-block-container code :deep(.tok-keyword),
.code-block-container code :deep(.tok-atom) {
  color: #c678dd;
}

.code-block-container code :deep(.tok-number) {
  color: #d19a66;
}

.code-block-container code :deep(.tok-string) {
  color: #98c379;
}

.code-block-container code :deep(.tok-comment) {
  color: color-mix(in srgb, var(--muted) 72%, transparent);
  font-style: italic;
}

.code-block-container code :deep(.tok-definition),
.code-block-container code :deep(.tok-function) {
  color: #61afef;
}

.code-block-container code :deep(.tok-variable),
.code-block-container code :deep(.tok-property) {
  color: inherit;
}

.code-block-container code :deep(.tok-type),
.code-block-container code :deep(.tok-tag) {
  color: #e5c07b;
}

.code-block-container code :deep(.tok-punctuation) {
  color: color-mix(in srgb, currentColor 70%, transparent);
}

.code-block-container code :deep(.tok-invalid) {
  color: #e06c75;
}

.code-block-container code :deep(.tok-inserted) {
  color: #98c379;
}

.code-block-container code :deep(.tok-heading),
.code-block-container code :deep(.tok-strong) {
  font-weight: 600;
}

.code-block-container code :deep(.tok-emphasis) {
  font-style: italic;
}

.code-block-container code :deep(.tok-link) {
  color: var(--accent);
}
</style>
