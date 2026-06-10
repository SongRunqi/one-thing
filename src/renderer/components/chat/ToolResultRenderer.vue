<template>
  <div
    class="tool-result-renderer"
    :class="[`kind-${renderKind}`, { partial: isPartial, error: isError } ]"
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
      <div class="bash-output">
        <div
          v-for="(line, index) in bashLines"
          :key="`${index}-${line.text}`"
          class="bash-line"
          :class="line.kind"
        >
          <Zap
            v-if="line.kind === 'done'"
            class="bash-done-icon"
            :size="13"
          />
          <span class="bash-line-text">{{ line.text }}</span>
        </div>
      </div>
    </template>

    <template v-else-if="isReadTextResult">
      <div class="read-output">
        <pre>{{ visibleReadText }}</pre>
        <button
          v-if="hasMoreReadLines"
          class="more-button"
          type="button"
          @click="showMoreReadLines"
        >
          <ChevronDown
            :size="13"
            :stroke-width="2"
          />
          <span>more</span>
        </button>
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
import { computed, ref, watch } from 'vue'
import { ChevronDown, Zap } from 'lucide-vue-next'
import type { ToolPartialResult, ToolRenderKind } from '@/types'
import WebSearchResultRenderer from './WebSearchResultRenderer.vue'

interface VariableDetail {
  name?: string
  value?: string
  values?: string[]
  scope?: 'global' | 'session'
  readonly?: boolean
  description?: string
}

interface BashLine {
  text: string
  kind: 'command' | 'done' | 'result' | 'blank'
}

const READ_LINES_PER_PAGE = 8

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
const visibleReadLineCount = ref(READ_LINES_PER_PAGE)
const readLines = computed(() => textContent.value.split('\n'))
const visibleReadText = computed(() =>
  readLines.value.slice(0, visibleReadLineCount.value).join('\n'),
)
const hasMoreReadLines = computed(() => visibleReadLineCount.value < readLines.value.length)
const bashLines = computed<BashLine[]>(() => {
  const source = textContent.value.replace(/\r\n/g, '\n')
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
    if (trimmed.startsWith('>')) {
      rows.push({ text: line, kind: 'command' })
    } else if (/^Done\s+in\s+/i.test(trimmed)) {
      rows.push({ text: trimmed, kind: 'done' })
    } else {
      rows.push({ text: line, kind: 'result' })
    }
  }

  if (rows[rows.length - 1]?.kind === 'blank') rows.pop()
  return rows
})

function showMoreReadLines() {
  visibleReadLineCount.value += READ_LINES_PER_PAGE
}

watch(
  () => [props.toolName, textContent.value],
  () => {
    visibleReadLineCount.value = READ_LINES_PER_PAGE
  },
)
</script>

<style scoped>
.tool-result-renderer {
  --tool-result-max-height: var(--tool-pane-max, clamp(148px, 28vh, 240px));
  min-width: 0;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
}

.tool-result-renderer.partial {
  --tool-result-max-height: var(--tool-pane-max, clamp(148px, 28vh, 240px));
}

.tool-result-renderer:has(.variable-row),
.tool-result-renderer:has(.read-output),
.tool-result-renderer:has(.tool-result-file) {
  max-height: var(--tool-result-max-height);
  overflow: auto;
  overscroll-behavior: contain;
}

.variable-row {
  padding: 9px 12px;
  border-top: 0.5px solid var(--ui-tool-border-border, var(--tool-border));
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
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-weight: 500;
}

.variable-value {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.variable-desc {
  max-width: 62ch;
  margin-top: 4px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-line-height);
}

.variable-tag {
  padding: 1px 7px;
  border-radius: calc(var(--tool-radius) - 5px);
  background: color-mix(in srgb, var(--ui-tool-text-fg, var(--tool-ink)) 8%, transparent);
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: 1.25;
}

.variable-tag.accent {
  background: var(--ui-tool-accent-fg, var(--tool-accent));
  color: var(--ui-tool-accent-on-fg, var(--tool-accent-on));
}

.tool-result-renderer pre {
  margin: 0;
  max-height: var(--tool-result-max-height);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 30%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)) 34%, transparent);
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
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
  overscroll-behavior: contain;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 30%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)) 42%, transparent);
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-title);
  font-weight: 400;
  line-height: var(--tool-code-line-height);
}

.bash-line {
  display: flex;
  align-items: baseline;
  flex-shrink: 0;
  min-height: calc(var(--tool-font-size-title) * var(--tool-code-line-height));
  white-space: pre-wrap;
  word-break: break-word;
}

.bash-line.blank {
  min-height: calc(var(--tool-font-size-title) * 0.65);
}

.bash-line.command {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-weight: 500;
}

.bash-line.result {
  color: var(--ui-tool-text-fg, var(--tool-ink));
}

.bash-line.done {
  gap: 7px;
  margin-top: 4px;
  color: var(--ui-tool-success-text-fg, var(--tool-ok));
  font-weight: 500;
}

.bash-done-icon {
  flex: 0 0 auto;
  color: var(--ui-tool-success-text-fg, var(--tool-ok));
}

.bash-line-text {
  min-width: 0;
}

.read-output {
  max-height: var(--tool-result-max-height);
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 30%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)) 42%, transparent);
}

.read-output pre {
  max-height: none;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 8px 10px;
  white-space: pre;
  word-break: normal;
}

.more-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  height: 24px;
  border: 0;
  border-top: 0.5px solid var(--ui-tool-border-border, var(--tool-border));
  background: transparent;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 500;
  cursor: pointer;
}

.more-button:hover {
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 10%, transparent);
  color: var(--ui-tool-text-fg, var(--tool-ink));
}

.tool-result-file {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin-top: 4px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-size: var(--tool-font-size-body);
}

.tool-result-file code {
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
}
</style>
