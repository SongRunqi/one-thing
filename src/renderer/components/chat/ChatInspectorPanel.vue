<template>
  <aside class="session-lens-sidebar">
    <section
      class="session-lens"
      role="dialog"
      aria-label="Session details"
    >
      <header class="lens-header">
        <div class="lens-header-top">
          <div class="lens-title">
            <Sparkles
              :size="16"
              :stroke-width="1.9"
            />
            <span>Session Lens</span>
          </div>

          <button
            class="icon-btn lens-toggle-btn"
            title="Close session lens"
            @click="$emit('close')"
          >
            <Radar
              :size="14"
              :stroke-width="2"
            />
          </button>
        </div>

        <div
          role="tablist"
          class="lens-tabs"
        >
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            :title="tab.title"
            :aria-selected="activeTab === tab.id"
            :class="['lens-tab', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            <component
              :is="tab.icon"
              :size="14"
              :stroke-width="1.9"
            />
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </header>

      <div class="lens-summary">
        <code>{{ activeModel || 'Unknown model' }}</code>
        <span class="summary-dot" />
        <span>context {{ pct(lastTurnInput, modelContextLength) }}%</span>
        <span class="summary-dot" />
        <span>{{ assistantTurns }} turns</span>
        <span class="summary-dot" />
        <span>{{ allToolCalls.length }} tools</span>
      </div>

      <div class="lens-body">
        <section
          v-if="activeTab === 'context'"
          class="lens-pane context-pane"
        >
          <div
            v-if="modelContextLength === 0"
            class="empty-state"
          >
            No context-window data for this model.
          </div>
          <template v-else>
            <div class="context-usage">
              <div class="usage-copy">
                <div>
                  <span class="usage-label">Context usage</span>
                  <strong>{{ pct(lastTurnInput, modelContextLength) }}%</strong>
                </div>
                <small>{{ formatTokens(lastTurnInput) }} / {{ formatTokens(modelContextLength) }}</small>
              </div>
              <div class="meter">
                <span
                  :class="['meter-fill', warnLevel(lastTurnInput, modelContextLength)]"
                  :style="{ width: `${barPct(lastTurnInput, modelContextLength)}%` }"
                />
              </div>
              <div class="usage-meta">
                <span>Headroom {{ formatTokens(Math.max(0, modelContextLength - lastTurnInput)) }}</span>
                <span>Session in {{ formatTokens(accumulatedInput) }}</span>
                <span>Session out {{ formatTokens(accumulatedOutput) }}</span>
              </div>
            </div>

            <div class="section-head variables-head">
              <span>Variables</span>
              <div class="section-actions">
                <small>{{ contextVariables.length }}</small>
                <button
                  class="inline-action"
                  type="button"
                  title="Add variable"
                  @click="startAddVariable"
                >
                  <Plus
                    :size="13"
                    :stroke-width="2"
                  />
                  <span>New</span>
                </button>
              </div>
            </div>
            <form
              v-if="variableEditor.mode === 'add'"
              class="variable-add-row"
              @submit.prevent="saveVariable"
            >
              <input
                v-model.trim="variableEditor.name"
                class="variable-add-name"
                placeholder="variable_name"
              >
              <select
                v-model="variableEditor.scope"
                class="variable-add-scope"
                title="Variable scope"
              >
                <option value="session">
                  session
                </option>
                <option value="global">
                  global
                </option>
              </select>
              <input
                v-model="variableEditor.value"
                class="variable-add-value"
                placeholder="value"
              >
              <p
                v-if="variableEditor.error"
                class="editor-error"
              >
                {{ variableEditor.error }}
              </p>
              <div class="editor-actions">
                <button
                  class="editor-icon"
                  type="button"
                  title="Cancel"
                  @click="closeVariableEditor"
                >
                  <X
                    :size="13"
                    :stroke-width="2"
                  />
                </button>
                <button
                  class="editor-icon primary"
                  type="submit"
                  title="Save variable"
                  :disabled="variableEditor.saving"
                >
                  <Check
                    :size="13"
                    :stroke-width="2"
                  />
                </button>
              </div>
            </form>
            <div
              v-if="contextVariables.length === 0"
              class="empty-inline"
            >
              No variables in this session.
            </div>
            <ul
              v-else
              class="variable-list"
            >
              <template
                v-for="group in variableGroups"
                :key="group.scope"
              >
                <li class="variable-scope-heading">
                  <span>{{ group.label }}</span>
                  <small>{{ group.items.length }}</small>
                </li>
                <li
                  v-for="variable in group.items"
                  :key="variable.name"
                  class="variable-item"
                >
                  <div
                    class="variable-row"
                    role="button"
                    tabindex="0"
                    :aria-expanded="isVariableExpanded(variable.name)"
                    @click="toggleVariableExpanded(variable.name)"
                    @keydown.enter.prevent="toggleVariableExpanded(variable.name)"
                    @keydown.space.prevent="toggleVariableExpanded(variable.name)"
                  >
                    <ChevronRight
                      :size="13"
                      :class="['variable-chevron', { open: isVariableExpanded(variable.name) }]"
                    />
                    <code class="variable-name">{{ variable.name }}</code>
                    <span class="variable-preview">{{ compactVariableValue(variable.value) }}</span>
                    <button
                      v-if="!variable.readonly"
                      class="variable-row-action"
                      title="Edit variable"
                      type="button"
                      @click.stop="startEditVariable(variable)"
                    >
                      <Pencil
                        :size="13"
                        :stroke-width="2"
                      />
                    </button>
                    <span
                      v-if="variable.readonly"
                      class="variable-badge"
                    >ro</span>
                  </div>

                  <div
                    v-if="isVariableExpanded(variable.name)"
                    class="variable-detail"
                  >
                    <form
                      v-if="isEditingVariable(variable.name)"
                      class="variable-inline-editor"
                      @submit.prevent="saveVariable"
                    >
                      <label class="inline-field">
                        <span>value</span>
                        <textarea
                          v-if="shouldUseTextarea(variableEditor.value)"
                          v-model="variableEditor.value"
                          class="variable-value-input"
                          rows="4"
                          placeholder="empty"
                        />
                        <input
                          v-else
                          v-model="variableEditor.value"
                          class="variable-value-input"
                          placeholder="empty"
                        >
                      </label>
                      <label class="inline-field">
                        <span>description</span>
                        <input
                          v-model.trim="variableEditor.description"
                          class="variable-note-input"
                          placeholder="Optional note"
                        >
                      </label>
                      <p
                        v-if="variableEditor.error"
                        class="editor-error"
                      >
                        {{ variableEditor.error }}
                      </p>
                      <div class="editor-actions">
                        <button
                          class="editor-icon"
                          type="button"
                          title="Cancel"
                          @click="closeVariableEditor"
                        >
                          <X
                            :size="13"
                            :stroke-width="2"
                          />
                        </button>
                        <button
                          class="editor-icon primary"
                          type="submit"
                          title="Save variable"
                          :disabled="variableEditor.saving"
                        >
                          <Check
                            :size="13"
                            :stroke-width="2"
                          />
                        </button>
                      </div>
                    </form>
                    <template v-else>
                      <div class="variable-detail-head">
                        <pre>{{ variable.value || '-' }}</pre>
                      </div>
                      <p v-if="variable.description">
                        {{ variable.description }}
                      </p>
                    </template>
                  </div>
                </li>
              </template>
            </ul>
          </template>
        </section>

        <section
          v-else-if="activeTab === 'request'"
          class="lens-pane"
        >
          <div
            v-if="snapshots.length === 0"
            class="empty-state"
          >
            No outbound requests captured yet.
          </div>
          <template v-else>
            <div class="snapshot-strip">
              <button
                v-for="(snap, i) in snapshots"
                :key="snap.timestamp"
                :class="['snapshot-chip', { active: i === selectedSnapshotIndex }]"
                type="button"
                @click="selectedSnapshotIndex = i"
              >
                <span>T{{ snap.turn }}</span>
                <small>{{ formatTime(snap.timestamp) }}</small>
              </button>
            </div>

            <div
              v-if="selectedSnapshot"
              class="request-layout"
            >
              <div class="request-meta-line">
                <code>{{ selectedSnapshot.providerId }} / {{ selectedSnapshot.model }}</code>
                <span v-if="selectedSnapshot.temperature !== undefined">temp {{ selectedSnapshot.temperature.toFixed(2) }}</span>
                <span v-if="selectedSnapshot.maxTokens !== undefined">max {{ formatTokens(selectedSnapshot.maxTokens) }}</span>
                <span v-if="selectedSnapshot.thinking">thinking {{ selectedSnapshot.thinking }}</span>
                <span v-if="selectedSnapshot.thinkingEffort">effort {{ selectedSnapshot.thinkingEffort }}</span>
                <span v-if="selectedSnapshot.serviceTier">speed {{ selectedSnapshot.serviceTier }}</span>
              </div>

              <div class="request-main">
                <section class="request-messages">
                  <div class="section-head">
                    <span>Messages</span>
                    <small>{{ selectedSnapshot.messages.length }}</small>
                  </div>
                  <ol class="message-stack">
                    <li
                      v-for="(m, idx) in selectedSnapshot.messages"
                      :key="idx"
                      class="message-card"
                    >
                      <div class="message-head">
                        <span :class="['role-pill', `role-${m.role}`]">{{ m.role }}</span>
                        <small>
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
                        </small>
                      </div>
                      <pre
                        v-if="messageText(m)"
                        :class="{ expanded: isMessageExpanded(idx) }"
                      >{{ messageText(m, isMessageExpanded(idx)) }}</pre>
                      <button
                        v-if="isLongMessage(m)"
                        class="message-expand"
                        type="button"
                        @click="toggleMessageExpanded(idx)"
                      >
                        {{ isMessageExpanded(idx) ? 'Show less' : 'Show more' }}
                      </button>
                      <div
                        v-if="m.toolCalls?.length"
                        class="tool-tags"
                      >
                        <code
                          v-for="tc in m.toolCalls"
                          :key="tc.id"
                        >{{ tc.name }}({{ tc.argsLength }}c)</code>
                      </div>
                    </li>
                  </ol>
                </section>

                <template v-if="selectedSnapshot.tools.length > 0">
                  <button
                    class="tools-disclosure"
                    type="button"
                    @click="showRequestTools = !showRequestTools"
                  >
                    <span>Available tools</span>
                    <small>{{ selectedSnapshot.tools.length }}</small>
                    <ChevronDown
                      :size="14"
                      :class="{ open: showRequestTools }"
                    />
                  </button>
                  <div
                    v-if="showRequestTools"
                    class="tool-grid"
                  >
                    <div
                      v-for="tool in selectedSnapshot.tools"
                      :key="tool.name"
                      class="tool-card"
                    >
                      <code>{{ tool.name }}</code>
                      <span v-if="tool.description">{{ tool.description }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </section>

        <section
          v-else-if="activeTab === 'browser'"
          class="lens-pane browser-pane"
        >
          <div
            v-if="!activeWebSearchStep"
            class="empty-state"
          >
            No web search results in this session.
          </div>
          <WebSearchResultRenderer
            v-else
            :result="activeWebSearchStep.result"
            :is-partial="activeWebSearchStep.isPartial"
          />
        </section>

        <section
          v-else-if="activeTab === 'diff'"
          class="lens-pane diff-pane"
        >
          <div
            v-if="!activeDiffStep"
            class="empty-state"
          >
            No code diffs in this session.
          </div>
          <template v-else>
            <!-- Diff header controls -->
            <div class="diff-panel-header">
              <div class="diff-file-info">
                <span class="file-path">{{ activeDiffStep.fileName }}</span>
                <span class="diff-stats">
                  <span class="additions">+{{ activeDiffStep.diff?.additions || activeDiffStep.streamingDiff?.additions || 0 }}</span>
                  <span class="deletions">-{{ activeDiffStep.diff?.deletions || activeDiffStep.streamingDiff?.deletions || 0 }}</span>
                </span>
              </div>
              <div class="diff-actions">
                <button
                  class="diff-btn"
                  :class="{ active: wrap }"
                  type="button"
                  title="Wrap lines"
                  @click="wrap = !wrap"
                >
                  <WrapText :size="13" />
                </button>
                <button
                  v-if="canRollback"
                  class="diff-btn rollback-btn"
                  :class="{ done: rollbackState === 'done', failed: rollbackState === 'failed' }"
                  type="button"
                  :disabled="rollbackState === 'running' || rollbackState === 'done'"
                  :title="rollbackTitle"
                  @click="rollbackDiff"
                >
                  <RotateCcw :size="13" />
                </button>
                <button
                  class="diff-btn"
                  type="button"
                  :title="copied ? 'Copied!' : 'Copy diff'"
                  @click="copyDiff"
                >
                  <Check
                    v-if="copied"
                    :size="13"
                  />
                  <Copy
                    v-else
                    :size="13"
                  />
                </button>
              </div>
            </div>

            <!-- Diff preview itself -->
            <ToolDiffPreview
              :diff="activeDiffStep.diff || activeDiffStep.streamingDiff"
              :lines="activeDiffStep.diff ? activeDiffStep.diffLines : activeDiffStep.streamingDiffLines"
              :status="activeDiffStep.status"
              :wrap="wrap"
            />
          </template>
        </section>

        <section
          v-else-if="activeTab === 'console'"
          class="lens-pane console-pane"
        >
          <div
            v-if="!activeConsoleStep"
            class="empty-state"
          >
            No terminal/inspect executions in this session.
          </div>
          <div
            v-else
            class="terminal-mock"
          >
            <div class="terminal-header">
              <div class="terminal-dots">
                <span class="dot close" />
                <span class="dot minimize" />
                <span class="dot expand" />
              </div>
              <span class="terminal-title">bash</span>
            </div>
            <div class="terminal-body">
              <div class="terminal-command">
                $ {{ consoleCommandText }}
              </div>
              <ToolResultRenderer
                :result="activeConsoleStep.step.partialResult || { content: [{ type: 'text', text: activeConsoleStep.resultText || '' }] }"
                :is-partial="activeConsoleStep.status === 'executing' || activeConsoleStep.status === 'streaming-input'"
                render-kind="bash"
                tool-name="bash"
              />
            </div>
          </div>
        </section>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Box, Check, ChevronDown, ChevronRight, Database, Pencil, Plus, Radar, Sparkles, TerminalSquare, X, Globe, GitCompare, Terminal, WrapText, RotateCcw, Copy } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import type { ContextVariable } from '@shared/ipc/chat'
import { buildToolStepView } from '@/stores/helpers/tool-step-view'
import { copyTextToClipboard } from '@/utils/clipboard'
import ToolDiffPreview from './ToolDiffPreview.vue'
import WebSearchResultRenderer from './WebSearchResultRenderer.vue'
import ToolResultRenderer from './ToolResultRenderer.vue'
import type { Step } from '@/types'

interface Props {
  sessionId: string
}

const props = defineProps<Props>()
defineEmits<{ close: [] }>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()

type TabId = 'context' | 'request' | 'browser' | 'diff' | 'console'
const tabs = [
  { id: 'context', label: 'Context', title: 'Context variables', icon: Database },
  { id: 'request', label: 'Request', title: 'Request payload', icon: Box },
  { id: 'browser', label: 'Browser', title: 'Web search & reader', icon: Globe },
  { id: 'diff', label: 'Diff', title: 'Code changes', icon: GitCompare },
  { id: 'console', label: 'Console', title: 'Console outputs', icon: Terminal },
] satisfies Array<{ id: TabId; label: string; title: string; icon: unknown }>

const activeTab = computed({
  get: () => chatStore.activeInspectorTab,
  set: (val) => { chatStore.activeInspectorTab = val }
})

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

const contextVariables = computed(() => {
  return sessionsStore.sessionVariables.get(props.sessionId) ?? []
})

const variableGroups = computed(() => {
  const sessionItems = contextVariables.value.filter(v => variableScope(v) === 'session')
  const globalItems = contextVariables.value.filter(v => variableScope(v) === 'global')
  return [
    { scope: 'session', label: 'Session', items: sessionItems },
    { scope: 'global', label: 'Global', items: globalItems },
  ].filter(group => group.items.length > 0)
})

onMounted(() => {
  if (props.sessionId) sessionsStore.fetchVariables(props.sessionId)
})
watch(
  () => props.sessionId,
  (sid) => { if (sid) sessionsStore.fetchVariables(sid) },
)

const snapshots = computed(() => chatStore.getRequestSnapshots(props.sessionId))
const selectedSnapshotIndex = ref(0)
watch(snapshots, (list) => {
  if (list.length > 0) selectedSnapshotIndex.value = list.length - 1
})
const selectedSnapshot = computed(
  () => snapshots.value[selectedSnapshotIndex.value] ?? null,
)
const showRequestTools = ref(false)

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
          status: tc.status || 'unknown',
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

const expandedMessages = ref<Set<string>>(new Set())
const expandedVariableName = ref<string | null>(null)
const variableEditor = ref({
  mode: 'closed' as 'closed' | 'add' | 'edit',
  name: '',
  value: '',
  scope: 'session' as 'global' | 'session',
  description: '',
  saving: false,
  error: '',
})
interface RequestMessageView {
  content?: string
  contentPreview?: string
  contentLength: number
}

function messageText(message: RequestMessageView, expanded = false): string {
  if (expanded) return message.content ?? message.contentPreview ?? ''
  const preview = message.contentPreview ?? message.content ?? ''
  return message.contentLength > preview.length ? `${preview}...` : preview
}

function isLongMessage(message: RequestMessageView): boolean {
  const full = message.content ?? message.contentPreview ?? ''
  return message.contentLength > 420 || full.split('\n').length > 5
}

function messageKey(index: string | number): string {
  return String(index)
}

function isMessageExpanded(index: string | number): boolean {
  return expandedMessages.value.has(messageKey(index))
}

function toggleMessageExpanded(index: string | number) {
  const key = messageKey(index)
  const next = new Set(expandedMessages.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedMessages.value = next
}

function compactVariableValue(value: string | undefined): string {
  if (!value) return '-'
  const singleLine = value.replace(/\s+/g, ' ').trim()
  return singleLine.length > 64 ? `${singleLine.slice(0, 64)}...` : singleLine
}

function variableScope(variable: ContextVariable): 'global' | 'session' {
  if (variable.scope === 'global' || variable.scope === 'session') return variable.scope
  return ['ai_note_dir', 'user_note_dir', 'work_note_dir'].includes(variable.name) ? 'global' : 'session'
}

function shouldUseTextarea(value: string): boolean {
  return value.includes('\n') || value.length > 96
}

function isVariableExpanded(name: string): boolean {
  return expandedVariableName.value === name
}

function isEditingVariable(name: string): boolean {
  return variableEditor.value.mode === 'edit' && variableEditor.value.name === name
}

function toggleVariableExpanded(name: string) {
  expandedVariableName.value = expandedVariableName.value === name ? null : name
}

function startAddVariable() {
  variableEditor.value = {
    mode: 'add',
    name: '',
    value: '',
    scope: 'session',
    description: '',
    saving: false,
    error: '',
  }
  expandedVariableName.value = null
}

function startEditVariable(variable: ContextVariable) {
  if (variable.readonly) return
  expandedVariableName.value = variable.name
  variableEditor.value = {
    mode: 'edit',
    name: variable.name,
    value: variable.value || '',
    scope: variableScope(variable),
    description: variable.description || '',
    saving: false,
    error: '',
  }
}

function closeVariableEditor() {
  variableEditor.value = {
    mode: 'closed',
    name: '',
    value: '',
    scope: 'session',
    description: '',
    saving: false,
    error: '',
  }
}

async function saveVariable() {
  const draft = variableEditor.value
  if (!draft.name) {
    variableEditor.value = { ...draft, error: 'Name is required.' }
    return
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(draft.name)) {
    variableEditor.value = { ...draft, error: 'Use letters, numbers, and underscores. Start with a letter or underscore.' }
    return
  }

  variableEditor.value = { ...draft, saving: true, error: '' }
  const response = await sessionsStore.setVariable(
    props.sessionId,
    draft.name,
    draft.value,
    draft.description || undefined,
    draft.scope,
  )

  if (!response.success) {
    variableEditor.value = {
      ...draft,
      saving: false,
      error: response.error || 'Failed to save variable.',
    }
    return
  }

  expandedVariableName.value = draft.name
  closeVariableEditor()
  await sessionsStore.fetchVariables(props.sessionId)
}

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
  if (!total) return 'ok'
  const ratio = part / total
  if (ratio > 0.9) return 'danger'
  if (ratio > 0.7) return 'warn'
  return 'ok'
}

function statusTone(status = ''): string {
  if (['failed', 'error', 'rejected'].includes(status)) return 'danger'
  if (['running', 'pending', 'executing'].includes(status)) return 'warn'
  if (['completed', 'success'].includes(status)) return 'ok'
  return 'neutral'
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
  return `${s.slice(0, max)}\n... (${s.length - max} more chars)`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const rollbackState = ref<'idle' | 'running' | 'done' | 'failed'>('idle')
const rollbackError = ref('')
const copied = ref(false)
const wrap = ref(false)

const activeWebSearchStep = computed(() => {
  const selectedId = chatStore.selectedToolCallId
  let foundStep: Step | null = null
  let isPartial = false

  const isSearchName = (name?: string) => {
    if (!name) return false
    return ['web_search', 'web-search', 'websearch', 'web_open', 'web-open', 'webopen', 'web_find', 'web-find', 'webfind'].includes(name.toLowerCase())
  }

  if (selectedId) {
    for (const m of messages.value) {
      if (m.role !== 'assistant') continue
      if (m.steps) {
        const s = m.steps.find(x => x.id === selectedId || x.toolCallId === selectedId)
        if (s && isSearchName(s.toolCall?.toolName || s.title)) {
          foundStep = s
          isPartial = s.status === 'running'
          break
        }
      }
    }
  }

  if (!foundStep) {
    for (const m of [...messages.value].reverse()) {
      if (m.role !== 'assistant') continue
      if (m.steps) {
        const s = [...m.steps].reverse().find(x => isSearchName(x.toolCall?.toolName || x.title))
        if (s) {
          foundStep = s
          isPartial = s.status === 'running'
          break
        }
      }
    }
  }

  if (!foundStep) return null

  let partialResult: any = foundStep.partialResult
  if (!partialResult) {
    let details: any = null
    if (foundStep.result) {
      try {
        details = JSON.parse(foundStep.result)
      } catch {
        details = foundStep.toolCall?.result
      }
    } else {
      details = foundStep.toolCall?.result
    }

    if (details && typeof details === 'object') {
      if (details.details) {
        partialResult = details
      } else {
        partialResult = {
          content: [{ type: 'text', text: foundStep.result || '' }],
          details: details
        }
      }
    }
  }

  return {
    step: foundStep,
    result: partialResult || { content: [] },
    isPartial
  }
})

const activeDiffStep = computed(() => {
  const selectedId = chatStore.selectedToolCallId
  let foundStep: Step | null = null

  const isDiffName = (name?: string) => {
    if (!name) return false
    return ['edit', 'write'].includes(name.toLowerCase())
  }

  if (selectedId) {
    for (const m of messages.value) {
      if (m.role !== 'assistant') continue
      if (m.steps) {
        const s = m.steps.find(x => x.id === selectedId || x.toolCallId === selectedId)
        if (s && isDiffName(s.toolCall?.toolName || s.title)) {
          foundStep = s
          break
        }
      }
    }
  }

  if (!foundStep) {
    for (const m of [...messages.value].reverse()) {
      if (m.role !== 'assistant') continue
      if (m.steps) {
        const s = [...m.steps].reverse().find(x => isDiffName(x.toolCall?.toolName || x.title))
        if (s) {
          foundStep = s
          break
        }
      }
    }
  }

  if (!foundStep) return null
  return buildToolStepView(foundStep)
})

const activeConsoleStep = computed(() => {
  const selectedId = chatStore.selectedToolCallId
  let foundStep: Step | null = null

  const isConsoleName = (name?: string) => {
    if (!name) return false
    return ['bash', 'read', 'glob', 'grep', 'variable'].includes(name.toLowerCase())
  }

  if (selectedId) {
    for (const m of messages.value) {
      if (m.role !== 'assistant') continue
      if (m.steps) {
        const s = m.steps.find(x => x.id === selectedId || x.toolCallId === selectedId)
        if (s && isConsoleName(s.toolCall?.toolName || s.title)) {
          foundStep = s
          break
        }
      }
    }
  }

  if (!foundStep) {
    for (const m of [...messages.value].reverse()) {
      if (m.role !== 'assistant') continue
      if (m.steps) {
        const s = [...m.steps].reverse().find(x => isConsoleName(x.toolCall?.toolName || x.title))
        if (s) {
          foundStep = s
          break
        }
      }
    }
  }

  if (!foundStep) return null
  return buildToolStepView(foundStep)
})

const consoleCommandText = computed(() => {
  const stepView = activeConsoleStep.value
  if (!stepView) return ''
  if (stepView.toolName === 'bash') {
    return stepView.argsJson || ''
  }
  return `${stepView.toolName} ${stepView.filePath || ''}`
})

const canRollback = computed(() => {
  const stepView = activeDiffStep.value
  return (
    stepView &&
    stepView.status === 'completed' &&
    !!stepView.diff?.auditPath &&
    ['edit', 'write'].includes(stepView.toolName)
  )
})

const rollbackTitle = computed(() => {
  if (rollbackState.value === 'running') return 'Rolling back...'
  if (rollbackState.value === 'done') return 'Rolled back'
  if (rollbackState.value === 'failed') return rollbackError.value || 'Rollback failed'
  return 'Rollback this file change'
})

async function rollbackDiff() {
  const stepView = activeDiffStep.value
  if (!stepView) return
  const auditPath = stepView.diff?.auditPath
  if (!auditPath || rollbackState.value === 'running' || rollbackState.value === 'done') return
  const fileName = stepView.filePath || 'this file'
  const confirmed = window.confirm(`Rollback changes to ${fileName}? This only succeeds if the file still matches the audited post-change content.`)
  if (!confirmed) return

  rollbackState.value = 'running'
  rollbackError.value = ''
  try {
    const result = await window.electronAPI.rollbackFile({ auditPath })
    if (!result.success) throw new Error(result.error || 'Rollback failed')
    rollbackState.value = 'done'
  } catch (error: any) {
    rollbackError.value = error?.message || 'Rollback failed'
    rollbackState.value = 'failed'
  }
}

async function copyDiff() {
  const stepView = activeDiffStep.value
  if (!stepView) return
  const activeDiffLines = stepView.diff ? stepView.diffLines : stepView.streamingDiffLines
  const text = activeDiffLines
    .filter(line => line.class !== 'diff-hunk')
    .map(line => `${line.prefix}${line.content}`)
    .join('\n')
  if (!text) return
  if (!(await copyTextToClipboard(text))) return
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<style scoped>
.session-lens-sidebar {
  display: flex;
  flex-direction: column;
  width: 340px;
  flex-shrink: 0;
  min-height: 0;
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg-elevated, var(--bg-chat)))) 94%, var(--ui-status-info-fg) 6%);
}

html[data-theme='light'] .session-lens-sidebar {
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg-elevated, var(--bg-chat)))) 96%, var(--ui-status-info-fg) 4%);
}

.session-lens {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: transparent;
  overflow: hidden;
}

.lens-header {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 14px 8px;
}

.lens-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding-right: 2px;
}

.lens-title,
.lens-tabs,
.lens-tab,
.icon-btn,
.tool-call-summary,
.snapshot-chip {
  display: flex;
  align-items: center;
}

.lens-title {
  gap: 8px;
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 600;
}

.lens-title svg {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.lens-tabs {
  width: 100%;
  gap: 4px;
  padding: 2px;
  border-radius: 6px;
  background: var(--ui-state-hover-bg, var(--hover));
}

.lens-tab {
  flex: 1;
  justify-content: center;
  height: 24px;
  gap: 5px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.lens-tab:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.lens-tab.active {
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--panel)));
  color: var(--ui-text-primary-fg, var(--text));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.lens-tab.active svg {
  color: var(--ui-text-primary-fg, var(--text));
}

.icon-btn {
  width: 28px;
  height: 28px;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.lens-toggle-btn {
  flex-shrink: 0;
}

.lens-summary {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  margin: 4px 10px 8px;
  padding: 0 2px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  overflow: hidden;
  white-space: nowrap;
}

.message-card,
.tool-card,
.tool-call-card {
  border-radius: 7px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 46%, transparent);
}

.lens-summary code {
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-dot {
  width: 3px;
  height: 3px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 55%, transparent);
}

code {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.meter {
  width: 100%;
  overflow: hidden;
  background: var(--ui-state-hover-bg, var(--hover));
}

.meter-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.18s ease, background 0.18s ease;
}

.meter-fill.ok,
.status-dot.ok { background: var(--ui-status-success-fg, #34d399); }
.meter-fill.warn,
.status-dot.warn { background: var(--ui-status-warning-fg, #facc15); }
.meter-fill.danger,
.status-dot.danger { background: var(--ui-status-danger-fg, #ef4444); }
.status-dot.neutral { background: var(--ui-text-muted-fg, var(--muted)); }

.lens-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.lens-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 8px 10px 12px;
  overflow-y: auto;
  scrollbar-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 35%, transparent) transparent;
  scrollbar-width: thin;
}

.empty-state,
.empty-inline {
  display: grid;
  place-items: center;
  min-height: 160px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 13px;
  text-align: center;
}

.empty-inline {
  min-height: 72px;
  border: 1px dashed var(--ui-border-default-border, var(--border));
  border-radius: 7px;
}

.section-head,
.message-head,
.meta-row {
  display: flex;
  align-items: center;
}

.section-head,
.message-head,
.meta-row {
  justify-content: space-between;
  gap: 10px;
}

.context-usage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 30%, transparent);
}

.usage-copy {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.usage-copy > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.usage-label {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.usage-copy strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.usage-copy small {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.meter {
  height: 7px;
  border-radius: 4px;
}

.usage-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  line-height: 1.35;
}

.section-head {
  margin: 16px 0 8px;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  font-weight: 650;
}

.section-head small {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 500;
}

.variables-head {
  align-items: center;
}

.section-actions,
.editor-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-actions {
  margin-left: auto;
}

.inline-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 72%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.inline-action:hover {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 35%, var(--ui-border-default-border, var(--border)));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.inline-action.primary {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 44%, var(--ui-border-default-border, var(--border)));
  color: var(--ui-accent-primary-fg, var(--accent));
}

.inline-action.primary:disabled {
  opacity: 0.55;
  cursor: wait;
}

.variable-inline-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 7px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 42%, transparent);
}

.inline-field {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.inline-field span {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  text-transform: lowercase;
}

.variable-add-row {
  display: grid;
  grid-template-columns: minmax(86px, 0.7fr) 72px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  margin: 4px 0 6px;
  padding: 3px 6px 3px 22px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 48%, transparent);
}

.variable-add-name,
.variable-add-scope,
.variable-add-value,
.variable-value-input,
.variable-note-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 72%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
  outline: none;
}

.variable-add-name,
.variable-add-scope,
.variable-add-value {
  height: 24px;
  padding: 0 6px;
  font-size: 11.5px;
}

.variable-add-scope {
  color: var(--ui-text-muted-fg, var(--muted));
}

.variable-add-name {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-weight: 650;
}

.variable-value-input {
  min-height: 26px;
  padding: 4px 7px;
  resize: vertical;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11.5px;
  line-height: 1.5;
}

textarea.variable-value-input {
  min-height: 76px;
  padding: 7px 8px;
}

.variable-note-input {
  height: 26px;
  padding: 0 8px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
}

.variable-add-name:focus,
.variable-add-scope:focus,
.variable-add-value:focus,
.variable-value-input:focus,
.variable-note-input:focus {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 65%, var(--ui-border-default-border, var(--border)));
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 86%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 22%, transparent);
}

.editor-error {
  margin: 0;
  color: var(--ui-status-danger-fg, #ef4444);
  font-size: 11px;
  line-height: 1.35;
}

.editor-actions {
  justify-content: flex-end;
  gap: 4px;
  margin-top: 1px;
}

.editor-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.editor-icon:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.editor-icon.primary {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.editor-icon.primary:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 18%, transparent);
}

.editor-icon.primary:disabled {
  opacity: 0.55;
  cursor: wait;
}

.variable-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
}

.variable-scope-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  margin-top: 6px;
  padding: 0 6px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.variable-scope-heading:first-child {
  margin-top: 0;
}

.variable-scope-heading small {
  margin-left: auto;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 72%, transparent);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
}

.variable-item {
  border-radius: 4px;
  overflow: hidden;
  background: transparent;
  transition: background 0.15s ease;
}

.variable-item:has(.variable-row:hover),
.variable-item:has(.variable-row[aria-expanded='true']) {
  background: transparent;
}

.variable-row {
  display: grid;
  grid-template-columns: 14px minmax(92px, 0.78fr) minmax(0, 1fr) 22px auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
  text-align: left;
  outline: none;
  user-select: none;
  transition: background 0.15s ease, color 0.15s ease;
}

.variable-row:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.variable-row:focus-visible {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 70%, transparent);
}

.variable-row[aria-expanded='true'] {
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 62%, transparent);
}

.variable-row:hover .variable-preview,
.variable-row:hover .variable-chevron,
.variable-row[aria-expanded='true'] .variable-chevron {
  color: var(--ui-text-primary-fg, var(--text));
}

.variable-name {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 11.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variable-preview {
  min-width: 0;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variable-badge {
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 70%, transparent);
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.variable-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: var(--ui-text-muted-fg, var(--muted));
  transition: transform 0.15s ease, color 0.15s ease;
}

.variable-row:hover .variable-chevron {
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 62%, transparent);
}

.variable-row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  opacity: 0;
}

.variable-row:hover .variable-row-action,
.variable-row:focus-within .variable-row-action {
  opacity: 1;
}

.variable-row-action:hover {
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 72%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.variable-chevron.open {
  transform: rotate(90deg);
}

.variable-detail {
  padding: 3px 6px 8px 26px;
  border-left: none;
  margin-left: 0;
}

.variable-detail-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 8px;
}

.variable-detail pre {
  margin: 0;
  padding: 0;
  overflow: visible;
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.variable-detail p {
  margin: 5px 0 0;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  line-height: 1.4;
}

.tool-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.tool-card {
  min-width: 0;
  padding: 8px 9px;
}

.tool-card code,
.message-card code,
.tool-call-summary code,
.meta-row code {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 11.5px;
  overflow-wrap: anywhere;
}

.tool-card span {
  margin: 5px 0 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.snapshot-strip {
  display: flex;
  gap: 5px;
  margin-bottom: 10px;
  overflow-x: auto;
  scrollbar-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 35%, transparent) transparent;
  scrollbar-width: none;
}

.snapshot-strip::-webkit-scrollbar {
  display: none;
}

.snapshot-chip {
  flex: 0 0 auto;
  height: 24px;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.snapshot-chip:hover,
.snapshot-chip.active {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.snapshot-chip.active {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 55%, var(--ui-border-default-border, var(--border)));
  color: var(--ui-text-primary-fg, var(--text));
}

.snapshot-chip span {
  font-size: 11.5px;
  font-weight: 650;
}

.snapshot-chip small {
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.request-layout {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
  flex: 1;
}

.request-meta-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px 8px;
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  line-height: 1.35;
}

.request-meta-line code {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 11px;
  overflow-wrap: anywhere;
}

.request-meta-line span {
  color: var(--ui-text-muted-fg, var(--muted));
}

.request-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.request-messages {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.meta-row {
  padding: 6px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 62%, transparent);
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-row span {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
}

.meta-row strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
}

.message-stack,
.tool-call-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.request-messages .message-stack {
  flex: 1;
  min-height: 220px;
  overflow-y: auto;
  padding-right: 3px;
  scrollbar-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 35%, transparent) transparent;
  scrollbar-width: thin;
}

.lens-pane::-webkit-scrollbar,
.request-messages .message-stack::-webkit-scrollbar,
.detail-block pre::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.lens-pane::-webkit-scrollbar-track,
.request-messages .message-stack::-webkit-scrollbar-track,
.detail-block pre::-webkit-scrollbar-track {
  background: transparent;
}

.lens-pane::-webkit-scrollbar-thumb,
.request-messages .message-stack::-webkit-scrollbar-thumb,
.detail-block pre::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 34%, transparent);
  background-clip: content-box;
}

.lens-pane::-webkit-scrollbar-thumb:hover,
.request-messages .message-stack::-webkit-scrollbar-thumb:hover,
.detail-block pre::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 50%, transparent);
  background-clip: content-box;
}

.message-card {
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 64%, transparent);
  padding: 7px 8px;
}

.message-head {
  margin-bottom: 5px;
}

.message-head small {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.role-pill {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.role-pill.role-system { color: var(--ui-status-warning-fg, #facc15); }
.role-pill.role-developer { color: var(--ui-accent-subtle-fg, #c084fc); }
.role-pill.role-user { color: var(--ui-status-info-fg, #60a5fa); }
.role-pill.role-assistant { color: var(--ui-accent-primary-fg, var(--accent)); }
.role-pill.role-tool { color: var(--ui-status-success-fg, #34d399); }

.message-card pre,
.detail-block pre {
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-card pre {
  display: -webkit-box;
  max-height: none;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}

.message-card pre.expanded {
  display: block;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 35%, transparent) transparent;
  scrollbar-width: thin;
  -webkit-line-clamp: unset;
}

.message-card pre.expanded::-webkit-scrollbar {
  width: 8px;
}

.message-card pre.expanded::-webkit-scrollbar-track {
  background: transparent;
}

.message-card pre.expanded::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 34%, transparent);
  background-clip: content-box;
}

.message-expand {
  display: inline-flex;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ui-accent-primary-fg, var(--accent));
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

.message-expand:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.tool-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.tool-tags code {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
}

.tool-card {
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 62%, transparent);
}

.tool-card span {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.tool-call-card {
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 72%, transparent);
  overflow: hidden;
}

.tools-disclosure {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}

.tools-disclosure small {
  margin-left: auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 500;
}

.tools-disclosure svg {
  color: var(--ui-text-muted-fg, var(--muted));
  transition: transform 0.15s ease;
}

.tools-disclosure svg.open {
  transform: rotate(180deg);
}

.tool-call-summary {
  width: 100%;
  height: 34px;
  gap: 8px;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
}

.tool-call-summary:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-label {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.duration {
  margin-left: auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.chevron {
  color: var(--ui-text-muted-fg, var(--muted));
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.tool-call-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
}

.detail-block span {
  display: block;
  margin-bottom: 4px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.detail-block pre {
  max-height: 280px;
  overflow: auto;
}

.detail-block.error span,
.detail-block.error pre {
  color: var(--ui-status-danger-fg, #ef4444);
}

.detail-block.error pre {
  background: rgba(239, 68, 68, 0.08);
}

@media (max-width: 760px) {
  .session-lens-sidebar {
    width: min(340px, 48vw);
  }
}

/* Diff Pane Header styling inside Inspector Panel */
.diff-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 40%, transparent);
  border-radius: 6px;
  margin-bottom: 8px;
}

.diff-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.diff-file-info .file-path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-primary-fg, var(--text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-stats {
  display: flex;
  gap: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
}

.diff-stats .additions {
  color: var(--ui-status-success-fg, #34d399);
}

.diff-stats .deletions {
  color: var(--ui-status-danger-fg, #ef4444);
}

.diff-actions {
  display: flex;
  gap: 4px;
}

.diff-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.diff-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.diff-btn.active {
  background: var(--ui-state-selected-bg, var(--hover));
  border-color: var(--ui-accent-primary-fg, var(--accent));
  color: var(--ui-text-primary-fg, var(--text));
}

/* Console Pane terminal mock */
.console-pane {
  padding: 8px 10px 12px;
}

.terminal-mock {
  display: flex;
  flex-direction: column;
  background: var(--ui-terminal-bg);
  border: 1px solid var(--ui-terminal-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.terminal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: var(--ui-terminal-header-bg);
  border-bottom: 1px solid var(--ui-terminal-border);
}

.terminal-dots {
  display: flex;
  gap: 5px;
}

.terminal-dots .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.terminal-dots .dot.close { background: var(--ui-terminal-dot-close); }
.terminal-dots .dot.minimize { background: var(--ui-terminal-dot-minimize); }
.terminal-dots .dot.expand { background: var(--ui-terminal-dot-expand); }

.terminal-title {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-terminal-title);
}

.terminal-body {
  padding: 12px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-terminal-text);
  overflow-y: auto;
}

.terminal-command {
  color: var(--ui-terminal-command);
  margin-bottom: 8px;
  font-weight: 500;
}
</style>
