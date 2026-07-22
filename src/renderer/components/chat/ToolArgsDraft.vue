<template>
  <div
    ref="rootRef"
    class="tool-args-draft"
  >
    <!-- Receive meter: every number here is measured, never predicted. -->
    <div class="draft-meta">
      <span class="draft-meta-label">接收中</span>
      <span class="draft-meta-sep">·</span>
      <span>{{ charsLabel }}</span>
      <span class="draft-meta-sep">·</span>
      <span>{{ elapsedLabel }}</span>
      <span
        v-if="stalledLabel"
        class="draft-meta-stalled"
      >{{ stalledLabel }}</span>
    </div>

    <div
      v-if="draft.kind === 'edit'"
      class="draft-body"
    >
      <div
        v-if="draft.pathPending"
        class="draft-placeholder"
      >
        path ─ 等待中
      </div>
      <template
        v-for="replacement in draft.replacements"
        :key="replacement.index"
      >
        <div class="draft-label">
          替换 {{ replacement.index + 1 }}<span
            v-if="replacement.replaceAll"
            class="draft-label-flag"
          > · 全部匹配</span><span
            v-if="isReplacementOpen(replacement)"
            class="draft-label-live"
          > · 接收中</span>
        </div>
        <template v-if="replacement.find">
          <div class="draft-sublabel">
            FIND
          </div>
          <pre
            class="draft-text draft-find"
            :class="{ 'is-open': replacement.find.open }"
          >{{ tailOf(replacement.find) }}<span
            v-if="replacement.find.open"
            class="draft-caret"
          /></pre>
        </template>
        <template v-if="replacement.replace">
          <div class="draft-sublabel">
            REPLACE WITH
          </div>
          <pre
            class="draft-text draft-replace"
            :class="{ 'is-open': replacement.replace.open }"
          >{{ tailOf(replacement.replace) }}<span
            v-if="replacement.replace.open"
            class="draft-caret"
          /></pre>
        </template>
      </template>
    </div>

    <div
      v-else-if="draft.kind === 'write'"
      class="draft-body"
    >
      <div
        v-if="draft.pathPending"
        class="draft-placeholder"
      >
        path ─ 等待中
      </div>
      <pre
        v-if="draft.content"
        class="draft-text draft-replace"
        :class="{ 'is-open': draft.content.open }"
      >{{ tailOf(draft.content) }}<span
        v-if="draft.content.open"
        class="draft-caret"
      /></pre>
    </div>

    <dl
      v-else-if="draft.fields.length"
      class="draft-fields"
    >
      <template
        v-for="(field, index) in draft.fields"
        :key="`${field.path}:${index}`"
      >
        <dt class="draft-field-key">
          {{ field.path }}
        </dt>
        <dd class="draft-field-value">
          {{ tailOf({ text: field.value, open: field.state === 'open' }) }}<span
            v-if="field.state === 'open'"
            class="draft-caret"
          />
        </dd>
      </template>
    </dl>

    <div
      v-if="draft.parseError"
      class="draft-error"
    >
      参数流解析失败：{{ draft.parseError }}
    </div>
    <div
      v-else-if="!draft.complete"
      class="draft-tail"
    >
      ⋯ 参数未收完，可能还有后续内容
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ToolDraftText, ToolStreamingDraft } from '@/stores/helpers/tool-step-view'
import { formatToolDuration } from '@/stores/helpers/tool-activity-view'
import { useDurationTicker } from '@/composables/useDurationTicker'

const props = defineProps<{
  draft: ToolStreamingDraft
  /** The toolCall's creation timestamp (input-start) — the receive clock's zero. */
  startTime: number
}>()

const rootRef = ref<HTMLElement | null>(null)
const now = useDurationTicker()

/** Wall-clock moment the last byte arrived; drives the stall notice. */
const lastGrowthAt = ref(Date.now())
watch(
  () => props.draft.charsReceived,
  () => {
    lastGrowthAt.value = Date.now()
    // Keep the open value's tail in view while it streams.
    requestAnimationFrame(() => {
      const openElement = rootRef.value?.querySelector('.draft-text.is-open')
      if (openElement) openElement.scrollTop = openElement.scrollHeight
    })
  },
)

const charsLabel = computed(() => `${props.draft.charsReceived.toLocaleString()} 字符`)
const elapsedLabel = computed(() => formatToolDuration(Math.max(0, now.value - props.startTime)))

const STALL_NOTICE_MS = 3000
const stalledLabel = computed(() => {
  const silentMs = now.value - lastGrowthAt.value
  if (silentMs < STALL_NOTICE_MS) return ''
  return `${Math.floor(silentMs / 1000)}s 未收到数据`
})

/**
 * Rendering cost guard for very long open values: only the tail is rendered,
 * and the elision is announced instead of silently truncating.
 */
const OPEN_TAIL_CHARS = 4000
function tailOf(value: ToolDraftText): string {
  if (!value.open || value.text.length <= OPEN_TAIL_CHARS) return value.text
  const hidden = value.text.length - OPEN_TAIL_CHARS
  return `… 前 ${hidden.toLocaleString()} 字符已收（省略显示）…\n${value.text.slice(-OPEN_TAIL_CHARS)}`
}

function isReplacementOpen(replacement: { find: ToolDraftText | null; replace: ToolDraftText | null }): boolean {
  return Boolean(replacement.find?.open || replacement.replace?.open)
}
</script>

<style scoped>
/* Draft tone: dashed rule + faded ink. The settled preview and the real diff
   keep their solid frames and colours — the two states must never look alike. */
.tool-args-draft {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px dashed color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 75%, transparent);
  background: transparent;
}

.draft-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 1.4px;
  text-transform: uppercase;
}

.draft-meta-label {
  color: var(--ui-tool-accent-fg, var(--tool-accent));
  animation: draft-breathe 1.6s ease-in-out infinite;
}

.draft-meta-sep { opacity: 0.5; }

.draft-meta-stalled {
  margin-left: auto;
  color: var(--ui-status-warning-fg, var(--tool-accent));
  letter-spacing: 0.6px;
  text-transform: none;
}

.draft-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.draft-placeholder {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
  opacity: 0.8;
}

.draft-label {
  margin-top: 2px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: calc(var(--tool-font-size-body) * 0.85);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.75;
}

.draft-label-live {
  color: var(--ui-tool-accent-fg, var(--tool-accent));
  text-transform: none;
}

.draft-label-flag {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  text-transform: none;
}

.draft-sublabel {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-mono);
  font-size: 9px;
  letter-spacing: 1.2px;
}

.draft-text {
  margin: 0;
  max-height: clamp(96px, 18vh, 180px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 2px 0 2px 10px;
  border-left: 1px dashed color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 60%, transparent);
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
  line-height: var(--tool-code-line-height);
  white-space: pre-wrap;
  word-break: break-word;
}

.draft-find {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  opacity: 0.72;
}

.draft-replace {
  color: var(--ui-tool-text-args-fg, var(--text-tool-args, var(--tool-soft)));
  opacity: 0.9;
}

.draft-fields {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 9px;
  margin: 0;
}

.draft-field-key {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
}

.draft-field-value {
  min-width: 0;
  max-height: clamp(48px, 12vh, 96px);
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.draft-caret {
  display: inline-block;
  width: 7px;
  height: 1em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: var(--ui-tool-accent-fg, var(--tool-accent));
  animation: draft-caret-blink 0.7s steps(2, end) infinite;
}

.draft-tail {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
  opacity: 0.8;
}

.draft-error {
  color: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 70%, var(--ui-tool-text-fg, var(--tool-ink)));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
}

@keyframes draft-caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

@keyframes draft-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
</style>
