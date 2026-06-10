<template>
  <div class="diff-preview tool-diff-preview">
    <div
      ref="diffContentRef"
      class="diff-content"
      :class="{ fixed: shouldUseFixedHeight, wrap }"
    >
      <div class="diff-lines">
        <template
          v-for="(entry, idx) in highlightedLines"
          :key="lineKey(entry.line, idx)"
        >
          <div
            v-if="!(entry.line.class === 'diff-hunk' && idx === 0)"
            :class="['diff-line', entry.line.class]"
            data-diff-line
          >
            <span class="line-gutter">
              <span
                v-if="diff?.deletions"
                class="line-number old"
              >{{ entry.line.oldNum || '' }}</span>
              <span class="line-number new">{{ entry.line.newNum || '' }}</span>
            </span>
            <span class="line-prefix">{{ entry.line.prefix }}</span>
            <span class="line-content">
              <span
                v-for="(segment, segmentIndex) in entry.segments"
                :key="`${idx}-${segmentIndex}`"
                :class="segment.className"
              >{{ segment.text }}</span>
            </span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ToolDiffData, ToolDiffLine } from '@/stores/helpers/tool-step-view'
import type { ToolRenderStatus } from '@/stores/helpers/tool-status'

const props = defineProps<{
  diff?: ToolDiffData | null
  lines: ToolDiffLine[]
  status: ToolRenderStatus
  /** Soft-wrap long lines instead of horizontal scrolling */
  wrap?: boolean
}>()

interface SyntaxSegment {
  text: string
  className?: string
}

const KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally',
  'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'interface',
  'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'type', 'undefined', 'var', 'void', 'while', 'yield',
])

const diffContentRef = ref<HTMLElement | null>(null)
const isLive = computed(() =>
  props.status === 'streaming-input' || props.status === 'executing',
)
const lineCount = computed(() => props.lines.length)
const shouldUseFixedHeight = computed(() =>
  isLive.value || props.status === 'awaiting-confirmation',
)
const highlightedLines = computed(() => props.lines.map(line => ({
  line,
  segments: highlightCode(line.content),
})))

function lineKey(line: ToolDiffLine, idx: number): string {
  const oldNum = line.oldNum ?? ''
  const newNum = line.newNum ?? ''
  if (oldNum !== '' || newNum !== '') {
    return `${line.class}:${oldNum}:${newNum}:${line.prefix}`
  }
  return `${line.class}:meta:${idx}:${line.prefix}:${line.content}`
}

function highlightCode(code: string): SyntaxSegment[] {
  const segments: SyntaxSegment[] = []
  let index = 0

  const push = (text: string, className?: string) => {
    if (text) segments.push({ text, className })
  }

  while (index < code.length) {
    const rest = code.slice(index)

    if (rest.startsWith('//')) {
      push(rest, 'syntax-comment')
      break
    }

    const quote = code[index]
    if (quote === '"' || quote === '\'' || quote === '`') {
      const start = index
      index++
      let escaped = false
      while (index < code.length) {
        const char = code[index]
        index++
        if (escaped) {
          escaped = false
          continue
        }
        if (char === '\\') {
          escaped = true
          continue
        }
        if (char === quote) break
      }
      push(code.slice(start, index), 'syntax-string')
      continue
    }

    const numberMatch = rest.match(/^\b\d+(?:\.\d+)?\b/)
    if (numberMatch) {
      push(numberMatch[0], 'syntax-number')
      index += numberMatch[0].length
      continue
    }

    const identifierMatch = rest.match(/^[A-Za-z_$][\w$]*/)
    if (identifierMatch) {
      const word = identifierMatch[0]
      index += word.length
      if (KEYWORDS.has(word)) {
        push(word, 'syntax-keyword')
      } else {
        const nextChar = code.slice(index).trimStart()[0]
        push(word, nextChar === '(' ? 'syntax-func' : undefined)
      }
      continue
    }

    push(code[index])
    index++
  }

  return segments.length ? segments : [{ text: code }]
}

function scrollToBottom() {
  if (!diffContentRef.value) return
  diffContentRef.value.scrollTop = diffContentRef.value.scrollHeight
}

watch(
  () => [lineCount.value, props.diff?.additions, props.diff?.deletions, props.status],
  async () => {
    if (!isLive.value) return
    await nextTick()
    scrollToBottom()
  },
  { flush: 'post' },
)

defineExpose({
  scrollToBottom,
})
</script>

<style scoped>
.diff-preview {
  margin: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 38%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)) 58%, transparent);
}

.diff-content {
  background: transparent;
  border: 0;
  border-radius: inherit;
  max-height: 220px;
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-code-line-height);
}

/* Wrap mode: soft-wrap long lines, no horizontal scroll */
.diff-content.wrap {
  overflow-x: hidden;
}

.diff-content.fixed {
  height: clamp(148px, 24vh, 220px);
  max-height: clamp(148px, 24vh, 220px);
}

/* Inner track sized to the widest line so every row can fill the full scroll
   width (not just the viewport). Without this, short/empty rows' highlight
   stops at the client edge, leaving a hard vertical seam mid-panel. */
.diff-lines {
  width: max-content;
  min-width: 100%;
}

.diff-content.wrap .diff-lines {
  width: auto;
  min-width: 0;
}

.diff-line {
  --row-bg: var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub));
  display: flex;
  align-items: stretch;
  white-space: pre;
  width: 100%;
  min-height: calc(var(--tool-font-size-body) * var(--tool-code-line-height));
  background: var(--row-bg);
}

.diff-line[data-diff-line] {
  animation: none;
  transform: none;
}

/* Sticky line-number gutter — pinned left while code scrolls horizontally */
.line-gutter {
  position: sticky;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  background: var(--row-bg);
  border-left: 3px solid transparent;
}

.line-number {
  width: 34px;
  text-align: right;
  padding-right: 8px;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  user-select: none;
  flex-shrink: 0;
  font-size: var(--tool-font-size-line);
}

.line-number.old {
  border-right: 0.5px solid var(--ui-tool-border-border, var(--tool-border));
}

.line-prefix {
  width: 18px;
  min-width: 18px;
  text-align: center;
  user-select: none;
  flex-shrink: 0;
  font-weight: 500;
  align-self: center;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.line-content {
  flex: 1 1 auto;
  min-width: max-content;
  padding: 1px 12px 1px 0;
  white-space: pre;
}

.diff-content.wrap .line-content {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}

/* ── Added lines: green gutter is the primary signal, fill is auxiliary ── */
.diff-add {
  --row-bg: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-add-bar)) 16%, transparent);
  color: var(--ui-tool-text-fg, var(--tool-ink));
}

.diff-add .line-gutter {
  border-left-color: var(--ui-tool-success-text-fg, var(--tool-add-bar));
}

.diff-add .line-prefix {
  color: var(--ui-tool-success-text-fg, var(--tool-add-bar));
  font-weight: 500;
}

.diff-add .line-number {
  color: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-add-bar)) 45%, var(--ui-tool-text-faint-fg, var(--tool-faint)));
}

/* ── Deleted lines: red gutter is the primary signal, fill is auxiliary ── */
.diff-del {
  --row-bg: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 14%, transparent);
  color: var(--ui-tool-text-fg, var(--tool-ink));
}

.diff-del .line-gutter {
  border-left-color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
}

.diff-del .line-prefix {
  color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
  font-weight: 500;
}

.diff-del .line-number {
  color: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 45%, var(--ui-tool-text-faint-fg, var(--tool-faint)));
}

.diff-hunk {
  --row-bg: color-mix(in srgb, var(--ui-tool-text-fg, var(--tool-ink)) 4%, transparent);
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  padding: 4px 0;
  justify-content: center;
}

.diff-hunk .line-gutter {
  border-left-color: transparent;
}

.syntax-keyword {
  color: var(--hg-syntax-keyword-fg, var(--syntax-keyword));
  background-color: var(--hg-syntax-keyword-bg, transparent);
  font-style: var(--hg-syntax-keyword-font-style, normal);
  font-weight: var(--hg-syntax-keyword-font-weight, 400);
  text-decoration: var(--hg-syntax-keyword-text-decoration, none);
}

.syntax-number {
  color: var(--hg-syntax-number-fg, var(--syntax-number));
  background-color: var(--hg-syntax-number-bg, transparent);
  font-style: var(--hg-syntax-number-font-style, normal);
  font-weight: var(--hg-syntax-number-font-weight, 400);
  text-decoration: var(--hg-syntax-number-text-decoration, none);
}

.syntax-string {
  color: var(--hg-syntax-string-fg, var(--syntax-string));
  background-color: var(--hg-syntax-string-bg, transparent);
  font-style: var(--hg-syntax-string-font-style, normal);
  font-weight: var(--hg-syntax-string-font-weight, 400);
  text-decoration: var(--hg-syntax-string-text-decoration, none);
}

.syntax-comment {
  color: var(--hg-syntax-comment-fg, var(--syntax-comment));
  background-color: var(--hg-syntax-comment-bg, transparent);
  font-style: var(--hg-syntax-comment-font-style, italic);
  font-weight: var(--hg-syntax-comment-font-weight, 400);
  text-decoration: var(--hg-syntax-comment-text-decoration, none);
}

.syntax-func {
  color: var(--hg-syntax-function-fg, var(--syntax-func));
  background-color: var(--hg-syntax-function-bg, transparent);
  font-style: var(--hg-syntax-function-font-style, normal);
  font-weight: var(--hg-syntax-function-font-weight, 400);
  text-decoration: var(--hg-syntax-function-text-decoration, none);
}
</style>
