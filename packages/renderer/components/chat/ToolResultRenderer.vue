<template>
  <div
    ref="rendererRef"
    class="tool-result-renderer"
    :class="[`kind-${renderKind}`, { partial: isPartial, error: isError } ]"
    @wheel="handleWheel"
  >
    <template v-if="isVariableResult">
      <div
        v-for="variable in variableRows"
        :key="variable.name"
        class="variable-row"
      >
        <div class="variable-head">
          <span class="variable-name">{{ variable.name }}</span>
          <span
            v-if="variable.value"
            class="variable-value"
          >{{ variable.value }}</span>
          <span
            v-if="variable.isCurrent"
            class="variable-tag accent"
          >current</span>
          <span
            v-if="variable.type && variable.type !== 'string'"
            class="variable-tag"
          >{{ variable.type }}</span>
          <span
            v-if="variable.scope"
            class="variable-tag"
          >{{ variable.scope }}</span>
        </div>
        <div
          v-if="variable.description"
          class="variable-desc"
        >
          {{ variable.description }}
        </div>
      </div>
    </template>

    <template v-else-if="isBashResult">
      <div
        ref="bashOutputRef"
        class="bash-output"
        :class="{ settled: !isPartial }"
        @scroll.passive="handleBashScroll"
      >
        <div
          v-for="(line, index) in bashLines"
          :key="`${index}-${line.text}`"
          class="bash-line"
          :class="line.kind"
        >
          <span class="bash-line-text">{{ line.text }}</span>
        </div>
      </div>
      <div
        v-if="bashMetaLines.length"
        class="bash-meta"
      >
        <div
          v-for="(line, index) in bashMetaLines"
          :key="`meta-${index}`"
          class="bash-meta-line"
        >
          {{ line }}
        </div>
      </div>
    </template>

    <template v-else-if="isReadTextResult">
      <div class="read-output">
        <pre>{{ textContent }}</pre>
      </div>
    </template>

    <template v-else-if="isWebSearchResult && result">
      <WebSearchResultRenderer
        :result="result"
        :is-partial="isPartial"
      />
    </template>

    <template v-else-if="textContent">
      <pre>{{ textContent }}</pre>
    </template>

    <template v-if="fileParts.length">
      <div
        v-for="(part, index) in fileParts"
        :key="`file-${index}-${part.path || index}`"
        class="tool-result-file"
      >
        <span>{{ part.type === 'image' ? 'Image' : 'File' }}</span>
        <code>{{ part.path }}</code>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ToolPartialResult, ToolRenderKind } from '@/types'
import { chainWheelToScrollableAncestor, findScrollableWheelSource } from '@/utils/scroll-chain'
import WebSearchResultRenderer from './WebSearchResultRenderer.vue'

interface VariableDetail {
  name?: string
  value?: string
  values?: string[]
  type?: 'string' | 'number' | 'bool' | 'list' | 'map' | 'set'
  scope?: 'global' | 'session' | 'agent' | 'project'
  readonly?: boolean
  description?: string
}

interface BashLine {
  text: string
  kind: 'result' | 'blank'
}

/**
 * bash 输出**全量渲染**,不截尾、不设「▸ +N lines」展开钮(2026-08-12)。
 *
 * 曾经默认只画尾部 20 行:用户想看前面必须先点一下,而那颗按钮本身又长得像一行
 * 输出。真正需要的护栏不是"少画几行",而是"别让一屏之外的行还占着渲染成本" ——
 * 那件事交给 CSS:`.bash-output.settled .bash-line { content-visibility: auto }`。
 *
 * 为什么只在 settled(非流式)开:`content-visibility: auto` 会让屏外元素用
 * `contain-intrinsic-size` 的估算值参与布局,`scrollHeight` 因此是估的,而流式期间
 * 的 tail-follow 正是靠 `scrollTop = scrollHeight` 跟底 —— 估偏就跟不住底。流式
 * 期间行数还不大,原样渲染没有成本问题;流一停,护栏才接管。
 *
 * 历史:滚不动那次(2026-08-06)的根因是盒子上的 `overscroll-behavior: contain`
 * 配上够不到 max-height 下限的短内容,`scrollHeight === clientHeight` 的盒子被当成
 * scroll container、contain 又挡住链滚 → 滚轮死区。contain 早已全面撤除,滚轮边界
 * 由根上的 `@wheel → chainWheelToScrollableAncestor` 接管(只在真能滚且到边时才
 * 接管),与这里画多少行无关。
 */
const props = withDefaults(defineProps<{
  result?: ToolPartialResult | null
  isPartial?: boolean
  isError?: boolean
  renderKind?: ToolRenderKind | string
  toolName?: string
}>(), {
  result: null,
  isPartial: false,
  isError: false,
  renderKind: 'text',
  toolName: '',
})

const textContent = computed(() => compactOutput(props.result?.content
  ?.filter(part => part.type === 'text')
  .map(part => part.text ?? '')
  .filter(Boolean)
  .join('\n') || ''))

function compactOutput(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trimEnd()
}

function stripStatusEmoji(value: string): string {
  return value
    .replace(/^\s*(?:✅|⚡|✔︎|✓)+\s*(?=Done\b)/i, '')
    .replace(/^\s*(?:✅|⚡|✔︎|✓)+\s*/, '')
}

const fileParts = computed(() => props.result?.content
  ?.filter(part => part.type === 'file' || part.type === 'image') || [])

const variableRows = computed(() => {
  const details = props.result?.details as { variables?: VariableDetail[] } | undefined
  const variables = Array.isArray(details?.variables) ? details.variables : []
  return variables
    .filter(variable => variable?.name)
    .map(variable => ({
      name: variable.name || '',
      value: variable.value || variable.values?.[0] || '',
      type: variable.type,
      scope: variable.scope,
      description: variable.description,
      isCurrent: variable.name === 'workdir' && !!(variable.value || variable.values?.[0]),
    }))
})

const isVariableResult = computed(() =>
  props.toolName === 'variable' && variableRows.value.length > 0,
)

const isBashResult = computed(() => props.renderKind === 'bash' && !!textContent.value)
const isReadTextResult = computed(() => props.toolName === 'read' && !!textContent.value)
const isWebSearchResult = computed(() =>
  ['web_search', 'web-search', 'websearch', 'web_open', 'web-open', 'webopen', 'web_find', 'web-find', 'webfind'].includes(props.toolName) &&
  !!props.result?.details &&
  (
    Array.isArray((props.result.details as any).searches) ||
    Array.isArray((props.result.details as any).results) ||
    Array.isArray((props.result.details as any).pages) ||
    typeof (props.result.details as any).phase === 'string'
  ),
)
const rendererRef = ref<HTMLElement | null>(null)

const BASH_METADATA_BLOCK = /<bash_metadata>\n?([\s\S]*?)\n?<\/bash_metadata>/g

/** Machine-ish annotations (background jobs, truncation, exit codes) render
 * as a muted meta strip below the output instead of as literal tag lines. */
const bashMetaLines = computed<string[]>(() => {
  const lines: string[] = []
  for (const match of textContent.value.matchAll(BASH_METADATA_BLOCK)) {
    for (const line of match[1].split('\n')) {
      if (line.trim()) lines.push(line.trim())
    }
  }
  return lines
})

/**
 * Pure stdout/stderr: the command itself lives in the row title and the
 * duration in the row meta, so echoed `> command` lines and trailing
 * "Done in Xs" summaries are dropped instead of re-rendered.
 */
const bashLines = computed<BashLine[]>(() => {
  const source = textContent.value
    .replace(BASH_METADATA_BLOCK, '')
    .replace(/\r\n/g, '\n')
  const rows: BashLine[] = []
  let lastWasBlank = false

  for (const rawLine of source.split('\n')) {
    const line = stripStatusEmoji(rawLine).trimEnd()
    if (!line.trim()) {
      if (!lastWasBlank && rows.length > 0) rows.push({ text: '', kind: 'blank' })
      lastWasBlank = true
      continue
    }

    lastWasBlank = false
    const trimmed = line.trimStart()
    if (trimmed.startsWith('>')) continue
    if (/^Done\s+in\s+/i.test(trimmed)) continue
    rows.push({ text: line, kind: 'result' })
  }

  if (rows[rows.length - 1]?.kind === 'blank') rows.pop()
  return rows
})

// Live bash output follows the tail (like `tail -f`) until the user scrolls
// up; scrolling back to the bottom re-engages following.
const bashOutputRef = ref<HTMLElement | null>(null)
const bashFollowing = ref(true)

function handleBashScroll() {
  const element = bashOutputRef.value
  if (!element) return
  bashFollowing.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 4
}

watch(
  () => [bashLines.value.length, props.isPartial] as const,
  async () => {
    if (!props.isPartial || !bashFollowing.value) return
    await nextTick()
    const element = bashOutputRef.value
    if (element) element.scrollTop = element.scrollHeight
  },
  { flush: 'post' },
)

watch(() => props.isPartial, (partial) => {
  if (partial) bashFollowing.value = true
})

function handleWheel(event: WheelEvent) {
  chainWheelToScrollableAncestor(event, findScrollableWheelSource(event, rendererRef.value))
}
</script>

<style scoped>
.tool-result-renderer {
  --tool-result-max-height: var(--tool-pane-max, clamp(148px, 28vh, 240px));
  min-width: 0;
  color: var(--ui-tool-text-muted-fg);
  font-family: var(--tool-font-sans);
}

.tool-result-renderer.partial {
  --tool-result-max-height: var(--tool-pane-max, clamp(148px, 28vh, 240px));
}

/* No `overscroll-behavior: contain` on any scroll box here — see the note in
   ToolStepDetails: contain on a box that does not really overflow turns the
   wheel into a dead zone. The root @wheel handler owns the boundary. */
.tool-result-renderer:has(.variable-row),
.tool-result-renderer:has(.read-output),
.tool-result-renderer:has(.tool-result-file) {
  max-height: var(--tool-result-max-height);
  overflow: auto;
}

.variable-row {
  padding: 9px 12px;
  border-top: 0.5px solid var(--ui-tool-border-border, var(--ui-tool-surface-border));
}

.variable-row:first-child {
  border-top: 0;
}

.variable-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-title);
}

.variable-name {
  color: var(--ui-tool-text-fg);
  font-weight: 500;
}

.variable-value {
  color: var(--ui-tool-text-muted-fg);
}

.variable-desc {
  max-width: 62ch;
  margin-top: 4px;
  color: var(--ui-tool-text-muted-fg);
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-line-height);
}

.variable-tag {
  padding: 1px 7px;
  border-radius: calc(var(--tool-radius) - 5px);
  background: color-mix(in srgb, var(--ui-tool-text-fg) 8%, transparent);
  color: var(--ui-tool-text-muted-fg);
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: 1.25;
}

.variable-tag.accent {
  background: var(--ui-tool-accent-fg);
  color: var(--ui-tool-accent-on-fg);
}

.tool-result-renderer pre {
  margin: 0;
  max-height: var(--tool-result-max-height);
  overflow: auto;
  padding: 2px 0;
  color: var(--ui-tool-text-muted-fg);
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-code-line-height);
  white-space: pre-wrap;
  word-break: break-word;
}

.bash-output {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: var(--tool-result-max-height);
  overflow: auto;
  padding: 2px 0;
  color: var(--ui-tool-text-muted-fg);
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-code-line-height);
}

.bash-line {
  display: flex;
  align-items: baseline;
  flex-shrink: 0;
  min-height: calc(var(--tool-font-size-body) * var(--tool-code-line-height));
  white-space: pre-wrap;
  word-break: break-word;
}

.bash-line.blank {
  min-height: calc(var(--tool-font-size-body) * 0.65);
}

.bash-line.result {
  color: var(--ui-tool-text-fg);
}

/* 全量渲染的性能护栏:输出停下来之后,一屏之外的行不再排版/绘制。
   流式期间**不开** —— 屏外行改用估算高度会让 scrollHeight 失真,而 tail-follow
   正靠 scrollHeight 跟底(见脚本顶部的说明)。 */
.bash-output.settled .bash-line {
  content-visibility: auto;
  contain-intrinsic-size: auto calc(var(--tool-font-size-body) * var(--tool-code-line-height));
}

.bash-line-text {
  min-width: 0;
}

/* Blueprint dimension note: bare caps annotation, no side bar. */
.bash-meta {
  margin-top: 6px;
  padding: 0;
  color: var(--ui-tool-text-faint-fg);
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  letter-spacing: 1px;
  line-height: var(--tool-code-line-height);
  text-transform: uppercase;
}

.bash-meta-line {
  white-space: pre-wrap;
  word-break: break-word;
}

.read-output {
  max-height: var(--tool-result-max-height);
  overflow: auto;
}

.read-output pre {
  max-height: none;
  overflow: visible;
  padding: 4px 0;
  white-space: pre;
  word-break: normal;
}


.tool-result-file {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin-top: 4px;
  color: var(--ui-tool-text-muted-fg);
  font-size: var(--tool-font-size-body);
}

.tool-result-file code {
  color: var(--ui-tool-text-fg);
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
}
</style>
