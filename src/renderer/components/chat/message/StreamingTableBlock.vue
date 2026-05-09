<template>
  <div class="table-stream-container">
    <div class="table-stream-header">
      table
    </div>
    <pre class="table-stream-preview"><code ref="codeEl" /></pre>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  content: string
}>()

const codeEl = ref<HTMLElement | null>(null)
let lastRenderedContent = ''
let frameId: number | ReturnType<typeof setTimeout> | null = null

const raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16)
const cancelRaf = typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame
  : (id: ReturnType<typeof setTimeout>) => clearTimeout(id)

function render() {
  const el = codeEl.value
  if (!el || lastRenderedContent === props.content) return
  el.textContent = props.content
  lastRenderedContent = props.content
}

function scheduleRender() {
  if (frameId !== null) return
  frameId = raf(() => {
    frameId = null
    render()
  })
}

watch(() => props.content, scheduleRender)
onMounted(render)
onBeforeUnmount(() => {
  if (frameId !== null) {
    cancelRaf(frameId as any)
    frameId = null
  }
})
</script>

<style scoped>
.table-stream-container {
  margin: var(--content-spacing, 0.75em) 0;
  border: 1px solid var(--border-code, var(--border));
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-code-block, rgba(0, 0, 0, 0.3));
}

.table-stream-header {
  padding: 2px 10px;
  border-bottom: 1px solid var(--border-code, var(--border));
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 24px;
  text-transform: lowercase;
}

.table-stream-preview {
  margin: 0;
  padding: 12px 14px;
  overflow-x: scroll;
  overflow-y: hidden;
  scrollbar-gutter: stable;
  white-space: pre;
  line-height: 1.5;
  tab-size: 2;
}

.table-stream-preview code {
  display: block;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: inherit;
  white-space: inherit;
  color: var(--text-code-block, var(--text));
}
</style>
