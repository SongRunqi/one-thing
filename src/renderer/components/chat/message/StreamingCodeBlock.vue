<template>
  <div class="code-block-container">
    <div class="code-block-header">
      <div class="code-block-lang">{{ displayLang }}</div>
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
    <pre><code
      ref="codeEl"
      :class="`hljs language-${lang}`"
    /></pre>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import hljs from 'highlight.js'

interface Props {
  lang: string
  content: string
  complete: boolean
}

const props = defineProps<Props>()

const codeEl = ref<HTMLElement | null>(null)
const copied = ref(false)

const displayLang = computed(() => props.lang || 'text')

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
function render() {
  const el = codeEl.value
  if (!el) return
  let html: string
  if (props.lang && hljs.getLanguage(props.lang)) {
    try {
      html = hljs.highlight(props.content, {
        language: props.lang,
        ignoreIllegals: true,
      }).value
    } catch (err) {
      console.error('[StreamingCodeBlock] highlight failed', err)
      html = escapeHtml(props.content)
    }
  } else {
    html = escapeHtml(props.content)
  }
  el.innerHTML = html
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

watch(() => props.content, render)
watch(() => props.lang, render)
onMounted(render)
</script>
