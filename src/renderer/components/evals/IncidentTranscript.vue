<template>
  <div class="incident-transcript">
    <template
      v-for="(item, idx) in items"
      :key="idx"
    >
      <!-- Round separator -->
      <div
        v-if="item.kind === 'round'"
        class="transcript-round"
      >
        第 {{ item.round }} 轮
      </div>

      <!-- User message bubble -->
      <div
        v-else-if="item.kind === 'user'"
        class="transcript-bubble user"
      >
        <StaticMarkdown
          :content="item.text || '(空)'"
          :is-user="true"
        />
      </div>

      <!-- Assistant bubble: text + tool calls -->
      <div
        v-else-if="item.kind === 'assistant'"
        class="transcript-bubble assistant"
      >
        <StaticMarkdown
          v-if="item.text"
          :content="item.text"
        />
        <div
          v-for="(tc, tcIdx) in item.toolCalls"
          :key="tcIdx"
          class="transcript-tool-call"
        >
          <span class="transcript-tool-name">{{ tc.name }}</span>
          <code class="transcript-tool-args">{{ tc.args }}</code>
        </div>
      </div>

      <!-- Tool result card with mock-source badge -->
      <div
        v-else-if="item.kind === 'tool-result'"
        class="transcript-tool-result"
        :class="`source-${item.source}`"
      >
        <div class="transcript-tool-result-header">
          <span class="transcript-tool-name">{{ item.name }}</span>
          <span
            class="transcript-source-badge"
            :class="`source-${item.source}`"
            :title="sourceTitle(item.source)"
          >{{ sourceLabel(item.source) }}</span>
        </div>
        <pre class="transcript-tool-result-body">{{ item.text }}</pre>
      </div>

      <!-- Judge verdict banner -->
      <div
        v-else-if="item.kind === 'judge'"
        class="transcript-judge"
        :class="item.pass ? 'pass' : 'fail'"
      >
        <strong>{{ item.pass ? '✓ 符合期望' : '✗ 不符合期望' }}</strong>
        <span>{{ item.text }}</span>
      </div>

      <!-- Error -->
      <div
        v-else-if="item.kind === 'error'"
        class="transcript-error"
      >
        {{ item.text }}
      </div>
    </template>

    <div
      v-if="items.length === 0"
      class="transcript-empty"
    >
      (无内容)
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import StaticMarkdown from '@/components/chat/message/StaticMarkdown.vue'

/**
 * Chat-style renderer shared by the scene view (turn-trace) and the
 * replay view (transcript events). Both are normalized into `items`.
 */

export interface TranscriptItem {
  kind: 'round' | 'user' | 'assistant' | 'tool-result' | 'judge' | 'error'
  round?: number
  text?: string
  toolCalls?: Array<{ name: string; args: string }>
  name?: string
  source?: string
  pass?: boolean
}

const props = defineProps<{ items: TranscriptItem[] }>()

const items = computed(() => props.items)

function sourceLabel(source?: string): string {
  switch (source) {
    case 'recorded': return '录制'
    case 'simulated': return 'AI 模拟'
    case 'stub': return '桩'
    case 'real': return '真实'
    default: return source ?? ''
  }
}

function sourceTitle(source?: string): string {
  switch (source) {
    case 'recorded': return '来自原始现场的真实工具结果回放'
    case 'simulated': return '重放中由分析模型模拟的结果,非真实执行'
    case 'stub': return '无录制匹配且未模拟,占位结果'
    case 'real': return '原始现场的真实执行结果'
    default: return ''
  }
}
</script>

<style scoped>
.incident-transcript {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.transcript-round {
  align-self: center;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-secondary));
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-default-border, var(--border));
}

.transcript-bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.transcript-bubble.user {
  align-self: flex-end;
  background: var(--ui-action-primary-bg, var(--accent-light));
  border: 1px solid var(--ui-border-default-border, var(--border));
}

.transcript-bubble.assistant {
  align-self: flex-start;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-default-border, var(--border));
}

.transcript-tool-call {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--ui-surface-app-bg, var(--bg));
  border: 1px dashed var(--ui-border-default-border, var(--border));
  font-size: 12px;
  overflow-x: auto;
}

.transcript-tool-name {
  font-weight: 600;
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
}

.transcript-tool-args {
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  font-size: 11.5px;
  white-space: nowrap;
}

.transcript-tool-result {
  align-self: flex-start;
  max-width: 82%;
  margin-left: 16px;
  border-radius: 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-app-bg, var(--bg));
  overflow: hidden;
}

.transcript-tool-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  font-size: 11.5px;
}

.transcript-source-badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
}

.transcript-source-badge.source-recorded,
.transcript-source-badge.source-real {
  background: var(--ui-status-success-bg);
  color: var(--ui-status-success-fg, #27ae60);
}

.transcript-source-badge.source-simulated {
  background: var(--ui-status-warning-bg);
  color: var(--ui-status-warning-fg, #e67e22);
}

.transcript-source-badge.source-stub {
  background: var(--ui-status-danger-bg);
  color: var(--ui-status-danger-fg, #e74c3c);
}

.transcript-tool-result-body {
  margin: 0;
  padding: 8px 10px;
  font-size: 11.5px;
  line-height: 1.5;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.transcript-judge {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12.5px;
}

.transcript-judge.pass {
  background: var(--ui-status-success-bg);
  color: var(--ui-status-success-fg, #27ae60);
  border: 1px solid var(--ui-status-success-border);
}

.transcript-judge.fail {
  background: var(--ui-status-danger-bg);
  color: var(--ui-status-danger-fg, #e74c3c);
  border: 1px solid var(--ui-status-danger-border);
}

.transcript-error {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--ui-status-danger-bg);
  color: var(--ui-status-danger-fg, #e74c3c);
}

.transcript-empty {
  color: var(--ui-text-muted-fg, var(--text-secondary));
  font-size: 12.5px;
  text-align: center;
  padding: 24px 0;
}
</style>
