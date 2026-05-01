<template>
  <aside class="inspector">
    <header class="inspector-header">
      <div
        role="tablist"
        class="inspector-tabs"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :class="['inspector-tab', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <button
        class="inspector-close"
        title="Close inspector"
        @click="$emit('close')"
      >
        <X
          :size="14"
          :stroke-width="2"
        />
      </button>
    </header>

    <div class="inspector-body">
      <!-- ─── Context ─────────────────────────────────────── -->
      <section
        v-if="activeTab === 'context'"
        class="tab-pane"
      >
        <div
          v-if="modelContextLength === 0"
          class="empty"
        >
          No context-window data for {{ activeModel || 'this model' }}.
        </div>
        <div
          v-else
          class="context-summary"
        >
          <div class="metric-row">
            <span class="metric-label">Model</span>
            <code class="metric-value">{{ activeModel || '—' }}</code>
          </div>
          <div class="metric-row">
            <span class="metric-label">Window</span>
            <span class="metric-value">{{ formatTokens(modelContextLength) }}</span>
          </div>

          <div class="bar-section">
            <div class="bar-label-row">
              <span>Last turn input</span>
              <span class="bar-numbers">
                {{ formatTokens(lastTurnInput) }} /
                {{ formatTokens(modelContextLength) }}
                <span class="bar-pct">({{ pct(lastTurnInput, modelContextLength) }}%)</span>
              </span>
            </div>
            <div class="bar">
              <div
                class="bar-fill"
                :class="warnLevel(lastTurnInput, modelContextLength)"
                :style="{ width: `${barPct(lastTurnInput, modelContextLength)}%` }"
              />
            </div>
            <div class="bar-hint">
              Headroom: {{ formatTokens(Math.max(0, modelContextLength - lastTurnInput)) }}
            </div>
          </div>

          <div class="totals">
            <div class="totals-cell">
              <div class="totals-label">Session input</div>
              <div class="totals-value">{{ formatTokens(accumulatedInput) }}</div>
            </div>
            <div class="totals-cell">
              <div class="totals-label">Session output</div>
              <div class="totals-value">{{ formatTokens(accumulatedOutput) }}</div>
            </div>
            <div class="totals-cell">
              <div class="totals-label">Turns</div>
              <div class="totals-value">{{ assistantTurns }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ─── Request ─────────────────────────────────────── -->
      <section
        v-else-if="activeTab === 'request'"
        class="tab-pane"
      >
        <div
          v-if="snapshots.length === 0"
          class="empty"
        >
          No outbound requests captured for this session yet. Send a message to populate.
        </div>
        <div v-else>
          <div class="snapshot-picker">
            <button
              v-for="(snap, i) in snapshots"
              :key="snap.timestamp"
              :class="['snapshot-pill', { active: i === selectedSnapshotIndex }]"
              type="button"
              @click="selectedSnapshotIndex = i"
            >
              <span class="snapshot-pill-turn">T{{ snap.turn }}</span>
              <span class="snapshot-pill-time">{{ formatTime(snap.timestamp) }}</span>
            </button>
          </div>

          <div
            v-if="selectedSnapshot"
            class="snapshot-detail"
          >
            <div class="metric-row">
              <span class="metric-label">Provider / model</span>
              <code class="metric-value">{{ selectedSnapshot.providerId }} / {{ selectedSnapshot.model }}</code>
            </div>
            <div class="metric-row">
              <span class="metric-label">Turn</span>
              <span class="metric-value">{{ selectedSnapshot.turn }}</span>
            </div>
            <div
              v-if="selectedSnapshot.thinking"
              class="metric-row"
            >
              <span class="metric-label">Thinking</span>
              <span
                class="metric-value"
                :class="['thinking-flag', selectedSnapshot.thinking]"
              >{{ selectedSnapshot.thinking }}</span>
            </div>
            <div
              v-if="selectedSnapshot.temperature !== undefined"
              class="metric-row"
            >
              <span class="metric-label">Temperature</span>
              <span class="metric-value">{{ selectedSnapshot.temperature.toFixed(2) }}</span>
            </div>
            <div
              v-if="selectedSnapshot.maxTokens !== undefined"
              class="metric-row"
            >
              <span class="metric-label">Max output</span>
              <span class="metric-value">{{ formatTokens(selectedSnapshot.maxTokens) }}</span>
            </div>

            <h4 class="block-heading">
              Messages <span class="block-meta">({{ selectedSnapshot.messages.length }})</span>
            </h4>
            <ol class="messages-list">
              <li
                v-for="(m, idx) in selectedSnapshot.messages"
                :key="idx"
                class="message-row"
              >
                <div class="message-row-head">
                  <span :class="['role-tag', `role-${m.role}`]">{{ m.role }}</span>
                  <span class="message-row-meta">
                    {{ m.contentLength }} chars
                    <template v-if="m.hasReasoning">
                      · reasoning {{ m.reasoningLength ?? 0 }}c
                    </template>
                    <template v-if="m.toolCalls?.length">
                      · {{ m.toolCalls.length }} tool call(s)
                    </template>
                    <template v-if="m.toolName">
                      · result for {{ m.toolName }}
                    </template>
                  </span>
                </div>
                <pre
                  v-if="m.contentPreview"
                  class="message-preview"
                >{{ m.contentPreview }}{{ m.contentLength > m.contentPreview.length ? '…' : '' }}</pre>
                <div
                  v-if="m.toolCalls?.length"
                  class="tool-call-tags"
                >
                  <code
                    v-for="tc in m.toolCalls"
                    :key="tc.id"
                    class="tool-call-tag"
                  >{{ tc.name }}({{ tc.argsLength }}c)</code>
                </div>
              </li>
            </ol>

            <h4
              v-if="selectedSnapshot.tools.length > 0"
              class="block-heading"
            >
              Tools <span class="block-meta">({{ selectedSnapshot.tools.length }})</span>
            </h4>
            <ul
              v-if="selectedSnapshot.tools.length > 0"
              class="tools-list"
            >
              <li
                v-for="tool in selectedSnapshot.tools"
                :key="tool.name"
                class="tool-item"
              >
                <code class="tool-name">{{ tool.name }}</code>
                <span
                  v-if="tool.description"
                  class="tool-desc"
                >{{ tool.description }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ─── Tool Calls ──────────────────────────────────── -->
      <section
        v-else
        class="tab-pane"
      >
        <div
          v-if="allToolCalls.length === 0"
          class="empty"
        >
          No tool calls in this session yet.
        </div>
        <ul
          v-else
          class="tool-call-log"
        >
          <li
            v-for="entry in allToolCalls"
            :key="entry.id"
            class="tool-call-entry"
          >
            <button
              class="tool-call-summary"
              type="button"
              @click="toggleExpanded(entry.id)"
            >
              <span :class="['tool-call-status', entry.status]">{{ entry.status }}</span>
              <code class="tool-call-name">{{ entry.toolName }}</code>
              <span
                v-if="entry.duration !== undefined"
                class="tool-call-duration"
              >{{ formatDuration(entry.duration) }}</span>
              <ChevronDown
                :size="12"
                :class="['caret', { open: expanded.has(entry.id) }]"
              />
            </button>
            <div
              v-if="expanded.has(entry.id)"
              class="tool-call-body"
            >
              <div class="tool-call-section">
                <div class="tool-call-section-label">args</div>
                <pre class="tool-call-pre">{{ formatJson(entry.args) }}</pre>
              </div>
              <div
                v-if="entry.result !== undefined"
                class="tool-call-section"
              >
                <div class="tool-call-section-label">result</div>
                <pre class="tool-call-pre">{{ truncate(formatJson(entry.result), 1500) }}</pre>
              </div>
              <div
                v-if="entry.error"
                class="tool-call-section"
              >
                <div class="tool-call-section-label error">error</div>
                <pre class="tool-call-pre error">{{ entry.error }}</pre>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X, ChevronDown } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'

interface Props {
  sessionId: string
}

const props = defineProps<Props>()
defineEmits<{ close: [] }>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()

type TabId = 'context' | 'request' | 'tools'
const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'context', label: 'Context' },
  { id: 'request', label: 'Request' },
  { id: 'tools', label: 'Tool Calls' },
]
const activeTab = ref<TabId>('context')

// ── Context tab data ────────────────────────────
const session = computed(() =>
  sessionsStore.sessions.find((s) => s.id === props.sessionId) || null,
)

const activeModel = computed(() => {
  const sess = session.value
  if (sess?.lastModel) return sess.lastModel
  const provider = sess?.lastProvider || settingsStore.settings?.ai?.provider
  return provider
    ? settingsStore.settings?.ai?.providers?.[provider]?.model || ''
    : ''
})

const modelContextLength = computed(() => {
  const id = activeModel.value
  if (!id) return 0
  const provider =
    session.value?.lastProvider || settingsStore.settings?.ai?.provider
  const list = provider ? settingsStore.getCachedModels(provider) : []
  const found = list.find((m) => m.id === id)
  return found?.context_length ?? found?.top_provider?.context_length ?? 0
})

// Session token fields live directly on the session, not nested under
// `usage`. `contextSize` (or `lastInputTokens`) is the most recent turn's
// input — that's what we charge against the window. Accumulated session
// totals are `totalInputTokens` / `totalOutputTokens`.
const lastTurnInput = computed(
  () =>
    (session.value as any)?.contextSize ??
    (session.value as any)?.lastInputTokens ??
    0,
)
const accumulatedInput = computed(
  () => (session.value as any)?.totalInputTokens ?? 0,
)
const accumulatedOutput = computed(
  () => (session.value as any)?.totalOutputTokens ?? 0,
)

const messages = computed(() => chatStore.sessionMessages.get(props.sessionId) ?? [])
const assistantTurns = computed(
  () => messages.value.filter((m: any) => m.role === 'assistant').length,
)

// ── Request tab data ────────────────────────────
const snapshots = computed(() => chatStore.getRequestSnapshots(props.sessionId))
const selectedSnapshotIndex = ref(0)
watch(snapshots, (list) => {
  // Auto-select the latest when new snapshots stream in.
  if (list.length > 0) selectedSnapshotIndex.value = list.length - 1
})
const selectedSnapshot = computed(
  () => snapshots.value[selectedSnapshotIndex.value] ?? null,
)

// ── Tool Calls tab data ────────────────────────
interface ToolCallLogEntry {
  id: string
  toolName: string
  status: string
  args: unknown
  result?: unknown
  error?: string
  duration?: number
}

const allToolCalls = computed<ToolCallLogEntry[]>(() => {
  const out: ToolCallLogEntry[] = []
  for (const m of messages.value as any[]) {
    if (m.role !== 'assistant') continue
    if (Array.isArray(m.steps)) {
      for (const step of m.steps) {
        if (!step.toolCallId) continue
        const tc = step.toolCall
        out.push({
          id: step.id,
          toolName: tc?.toolName || step.title || 'tool',
          status: step.status || tc?.status || 'unknown',
          args: tc?.arguments,
          result: tc?.result ?? step.result,
          error: tc?.error || step.error,
          duration: step.duration,
        })
      }
    } else if (Array.isArray(m.toolCalls)) {
      for (const tc of m.toolCalls) {
        out.push({
          id: tc.id,
          toolName: tc.toolName,
          status: tc.status,
          args: tc.arguments,
          result: tc.result,
          error: tc.error,
        })
      }
    }
  }
  return out
})

const expanded = ref<Set<string>>(new Set())
function toggleExpanded(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

// ── Formatters ──────────────────────────────────
function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function pct(part: number, total: number): string {
  if (!total) return '0'
  return ((part / total) * 100).toFixed(1)
}

function barPct(part: number, total: number): number {
  if (!total) return 0
  return Math.min(100, Math.max(0, (part / total) * 100))
}

function warnLevel(part: number, total: number): string {
  if (!total) return ''
  const ratio = part / total
  if (ratio > 0.9) return 'danger'
  if (ratio > 0.7) return 'warn'
  return 'ok'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function formatJson(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function truncate(s: string, max: number): string {
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n… (${s.length - max} more chars)`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}
</script>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-panel, var(--bg-elevated, var(--bg-chat)));
  min-height: 0;
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.inspector-tabs {
  display: flex;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.inspector-tab {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.inspector-tab:hover {
  background: var(--hover);
  color: var(--text);
}

.inspector-tab.active {
  background: var(--accent-bg, rgba(168, 85, 247, 0.15));
  color: var(--accent, #a855f7);
}

.inspector-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.inspector-close:hover {
  background: var(--hover);
  color: var(--text);
}

.inspector-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
}

.tab-pane {
  padding: 12px;
  font-size: 12.5px;
  color: var(--text);
}

.empty {
  color: var(--muted);
  font-size: 12.5px;
  padding: 24px 8px;
  text-align: center;
  line-height: 1.5;
}

/* metric rows */
.metric-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  align-items: center;
}
.metric-label {
  color: var(--muted);
  font-size: 11.5px;
}
.metric-value {
  color: var(--text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  word-break: break-all;
}

code.metric-value,
code.tool-call-name,
code.tool-name {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11.5px;
  background: var(--hover);
  padding: 1px 5px;
  border-radius: 4px;
}

/* context */
.context-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-section {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bar-label-row {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.bar-numbers {
  color: var(--text);
}
.bar-pct {
  color: var(--muted);
  margin-left: 2px;
}
.bar {
  width: 100%;
  height: 6px;
  background: var(--hover);
  border-radius: 3px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s ease, background 0.2s ease;
}
.bar-fill.ok { background: var(--accent, #22c55e); }
.bar-fill.warn { background: #facc15; }
.bar-fill.danger { background: #ef4444; }
.bar-hint {
  font-size: 11px;
  color: var(--muted);
}

.totals {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.totals-cell {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
}
.totals-label {
  font-size: 10.5px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.totals-value {
  font-size: 13px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}

/* request */
.snapshot-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.snapshot-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 11px;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
}
.snapshot-pill:hover {
  background: var(--hover);
  color: var(--text);
}
.snapshot-pill.active {
  background: var(--accent-bg, rgba(168, 85, 247, 0.15));
  border-color: rgba(168, 85, 247, 0.4);
  color: var(--accent, #a855f7);
}
.snapshot-pill-turn {
  font-weight: 600;
}
.snapshot-pill-time {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.snapshot-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thinking-flag.enabled {
  color: var(--accent, #a855f7);
}
.thinking-flag.disabled {
  color: var(--muted);
}

.block-heading {
  margin: 14px 0 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.block-meta {
  font-weight: 400;
  margin-left: 4px;
}

/* messages list */
.messages-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.message-row {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
}
.message-row-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.message-row-meta {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.role-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--hover);
  color: var(--muted);
  flex-shrink: 0;
}
.role-tag.role-system { color: #facc15; }
.role-tag.role-user { color: #60a5fa; }
.role-tag.role-assistant { color: #a855f7; }
.role-tag.role-tool { color: #34d399; }

.message-preview {
  margin: 4px 0 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text);
  background: var(--hover);
  padding: 4px 6px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 80px;
  overflow: hidden;
}

.tool-call-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.tool-call-tag {
  font-size: 10.5px;
  padding: 1px 5px;
  background: var(--hover);
  border-radius: 3px;
  color: var(--muted);
}

/* tools list */
.tools-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 4px;
}
.tool-item:hover {
  background: var(--hover);
}
.tool-desc {
  font-size: 10.5px;
  color: var(--muted);
  line-height: 1.4;
}

/* tool calls log */
.tool-call-log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-call-entry {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.tool-call-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 6px 8px;
  cursor: pointer;
  color: var(--text);
}
.tool-call-summary:hover {
  background: var(--hover);
}
.tool-call-status {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--hover);
}
.tool-call-status.completed { color: #34d399; }
.tool-call-status.failed,
.tool-call-status.error,
.tool-call-status.rejected { color: #ef4444; }
.tool-call-status.running,
.tool-call-status.pending,
.tool-call-status.executing { color: #facc15; }

.tool-call-duration {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.caret {
  color: var(--muted);
  transition: transform 0.15s ease;
}
.caret.open {
  transform: rotate(180deg);
}

.tool-call-body {
  border-top: 1px solid var(--border);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tool-call-section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 2px;
}
.tool-call-section-label.error {
  color: #ef4444;
}
.tool-call-pre {
  margin: 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  background: var(--hover);
  padding: 6px 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow: auto;
}
.tool-call-pre.error {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}
</style>
