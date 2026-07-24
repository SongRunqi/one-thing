<template>
  <div class="round-timeline">
    <ErrorNote
      v-if="store.roundsError"
      class="rt-error"
      size="sm"
      :message="store.roundsError"
    />
    <div
      v-else-if="store.roundsLoading"
      class="rt-hint"
    >
      加载中…
    </div>
    <div
      v-else-if="store.rounds && store.rounds.length === 0"
      class="rt-hint"
    >
      该事故没有逐轮请求记录(事故创建于逐轮追踪上线之前,或追踪目录已被清理)。
    </div>

    <div
      v-for="round in store.rounds ?? []"
      :key="round.round"
      class="rt-round"
    >
      <!-- Round header: the decision at a glance -->
      <div
        class="rt-head"
        @click="toggleRound(round.round)"
      >
        <span class="rt-badge round">第 {{ round.round }} 轮</span>
        <span
          v-if="round.purpose && round.purpose !== 'chat'"
          class="rt-badge"
        >{{ round.purpose }}</span>
        <span
          v-if="round.incomplete"
          class="rt-badge warn"
          title="增量链不完整,请求视图为尽力恢复"
        >链不完整</span>
        <span class="rt-meta">{{ round.requestMessages.length }} 条消息</span>
        <span class="rt-decision">
          <template v-if="round.responseToolCalls.length">
            → 调用 {{ round.responseToolCalls.map(tc => tc.name).join(', ') }}
          </template>
          <template v-else>
            → 文本回复{{ round.responseContent ? ':' + shorten(round.responseContent, 60) : '' }}
          </template>
        </span>
        <span class="rt-expand">{{ expanded === round.round ? '▾' : '▸' }}</span>
      </div>

      <!-- Expanded: exact request + decision + resend -->
      <div
        v-if="expanded === round.round"
        class="rt-body"
      >
        <div class="rt-params">
          <code>{{ round.model }}</code>
          <span v-if="round.temperature !== undefined">temp {{ round.temperature }}</span>
          <span>{{ round.toolNames.length }} 个工具</span>
          <span class="rt-meta">{{ round.ts.slice(5, 19).replace('T', ' ') }}</span>
        </div>

        <!-- Request messages (ground truth) -->
        <div class="rt-messages">
          <details
            v-for="(msg, i) in round.requestMessages as RequestMessage[]"
            :key="i"
            class="rt-message"
            :open="i >= round.requestMessages.length - 2"
          >
            <summary>
              <span
                class="rt-badge role"
                :class="msg.role"
              >{{ msg.role }}</span>
              <span class="rt-msg-preview">{{ messagePreview(msg) }}</span>
              <button
                v-if="typeof msg.content === 'string' && editedIndex !== i"
                class="rt-btn tiny"
                @click.prevent.stop="startEdit(i, msg.content)"
              >
                编辑
              </button>
            </summary>
            <textarea
              v-if="editedIndex === i"
              v-model="editedContent"
              class="rt-edit-area"
              rows="6"
            />
            <pre v-else>{{ messageFullText(msg) }}</pre>
            <div
              v-if="(msg.toolCalls ?? []).length"
              class="rt-msg-toolcalls"
            >
              <div
                v-for="(tc, j) in msg.toolCalls"
                :key="j"
                class="rt-toolcall"
              >
                <code>{{ tc.name }}</code>
                <span class="rt-meta">{{ shorten(JSON.stringify(tc.arguments ?? {}), 200) }}</span>
              </div>
            </div>
          </details>
        </div>

        <!-- Original decision -->
        <h5 class="rt-subtitle">
          当时的决策
        </h5>
        <div class="rt-attempt original">
          <div
            v-for="(tc, j) in round.responseToolCalls"
            :key="j"
            class="rt-toolcall"
          >
            <code>{{ tc.name }}</code>
            <span class="rt-meta">{{ shorten(JSON.stringify(tc.args ?? {}), 300) }}</span>
          </div>
          <pre v-if="round.responseContent">{{ round.responseContent }}</pre>
          <span class="rt-meta">finish: {{ round.finishReason }}</span>
        </div>

        <!-- Resend controls -->
        <div class="rt-resend">
          <label>次数
            <select v-model.number="resendRuns">
              <option :value="1">1</option>
              <option :value="3">3</option>
              <option :value="5">5</option>
            </select>
          </label>
          <button
            class="rt-btn primary"
            :disabled="store.roundReplaying !== null"
            :title="editedIndex !== null
              ? '带上你编辑后的消息重发,对比决策是否改变(归因验证)'
              : '把这一轮的请求原样重发给模型,看决策是否稳定复现'"
            @click="handleResend(round)"
          >
            {{ store.roundReplaying === round.round
              ? '重发中…'
              : editedIndex !== null ? '重发(已编辑)' : '原样重发' }}
          </button>
          <button
            v-if="editedIndex !== null"
            class="rt-btn"
            @click="cancelEdit"
          >
            放弃编辑
          </button>
          <ErrorNote
            v-if="store.roundReplayErrors[round.round]"
            class="rt-error-inline"
            size="sm"
            :message="store.roundReplayErrors[round.round]"
          />
        </div>

        <!-- Resend results vs original -->
        <template v-if="store.roundReplayResults[round.round]">
          <h5 class="rt-subtitle">
            重发结果
            <span
              v-if="store.roundReplayResults[round.round].edited"
              class="rt-badge warn"
            >已编辑请求</span>
          </h5>
          <div
            v-for="(attempt, k) in store.roundReplayResults[round.round].attempts"
            :key="k"
            class="rt-attempt"
            :class="{ diverged: attemptDiverged(round, attempt) }"
          >
            <span
              class="rt-badge"
              :class="attemptDiverged(round, attempt) ? 'warn' : 'same'"
            >{{ attemptDiverged(round, attempt) ? '决策不同' : '决策一致' }}</span>
            <div
              v-for="(tc, j) in attempt.toolCalls"
              :key="j"
              class="rt-toolcall"
            >
              <code>{{ tc.name }}</code>
              <span class="rt-meta">{{ shorten(JSON.stringify(tc.args ?? {}), 300) }}</span>
            </div>
            <pre v-if="attempt.content">{{ attempt.content }}</pre>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { useEvalsWorkbenchStore, type RoundView, type RoundReplayAttempt } from '@/stores/evalsWorkbench'

interface RequestMessage {
  role: string
  content?: unknown
  toolCalls?: Array<{ name?: string; arguments?: unknown }>
  toolCallId?: string
}

const store = useEvalsWorkbenchStore()

onMounted(() => {
  if (!store.rounds) void store.loadRounds()
})

const expanded = ref<number | null>(null)
const editedIndex = ref<number | null>(null)
const editedContent = ref('')
const resendRuns = ref(1)

function toggleRound(round: number) {
  expanded.value = expanded.value === round ? null : round
  cancelEdit()
}

function startEdit(index: number, content: string) {
  editedIndex.value = index
  editedContent.value = content
}

function cancelEdit() {
  editedIndex.value = null
  editedContent.value = ''
}

function handleResend(round: RoundView) {
  let editedMessages: unknown[] | undefined
  if (editedIndex.value !== null) {
    editedMessages = round.requestMessages.map((msg, i) =>
      i === editedIndex.value
        ? { ...(msg as RequestMessage), content: editedContent.value }
        : msg,
    )
  }
  void store.replayRoundRequest({
    round: round.round,
    runs: resendRuns.value,
    editedMessages,
  })
}

/** Divergence = a different tool-call sequence than the recorded decision. */
function attemptDiverged(round: RoundView, attempt: RoundReplayAttempt): boolean {
  const original = round.responseToolCalls.map(tc => tc.name).join(',')
  const replayed = attempt.toolCalls.map(tc => tc.name).join(',')
  return original !== replayed
}

function messageText(msg: RequestMessage): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<{ type?: string; text?: string }>)
      .map(p => (p?.type === 'text' && typeof p.text === 'string' ? p.text : `[${p?.type ?? 'content'}]`))
      .join('\n')
  }
  return ''
}

function messagePreview(msg: RequestMessage): string {
  const text = messageText(msg)
  if (text) return shorten(text.replace(/\s+/g, ' '), 90)
  if ((msg.toolCalls ?? []).length) {
    return `调用 ${(msg.toolCalls ?? []).map(tc => tc.name).join(', ')}`
  }
  return '(空)'
}

function messageFullText(msg: RequestMessage): string {
  return shorten(messageText(msg), 8000) || '(无文本内容)'
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
</script>

<style scoped>
.round-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-round {
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  overflow: hidden;
}

.rt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
}

.rt-decision {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.rt-expand {
  color: var(--ui-text-muted-fg, var(--text-secondary));
}

.rt-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-params {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11.5px;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.rt-messages {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rt-message {
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  padding: 4px 8px;
}

.rt-message summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
}

.rt-msg-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.rt-message pre {
  margin: 6px 0 2px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow: auto;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.rt-edit-area {
  width: 100%;
  margin: 6px 0 2px;
  font-size: 11.5px;
  font-family: var(--font-mono, monospace);
  line-height: 1.5;
  border-radius: 6px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text-primary));
  padding: 6px 8px;
  resize: vertical;
}

.rt-msg-toolcalls,
.rt-attempt {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rt-attempt {
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11.5px;
}

.rt-attempt.original {
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
}

.rt-attempt.diverged {
  border-color: var(--ui-status-warning-border, var(--ui-border-default-border, var(--border)));
}

.rt-attempt pre {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}

.rt-toolcall {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 11.5px;
  min-width: 0;
}

.rt-toolcall .rt-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-subtitle {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  display: flex;
  align-items: center;
  gap: 8px;
}

.rt-resend {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  flex-wrap: wrap;
}

.rt-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-default-border, var(--border));
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  flex-shrink: 0;
}

.rt-badge.round {
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.rt-badge.warn {
  background: var(--ui-status-warning-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  color: var(--ui-status-warning-fg, #e67e22);
}

.rt-badge.same {
  background: var(--ui-status-success-bg);
  color: var(--ui-status-success-fg, #27ae60);
}

.rt-badge.role.assistant {
  color: var(--ui-status-info-fg, var(--ui-text-primary-fg, var(--text-primary)));
}

.rt-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: 11.5px;
  cursor: pointer;
}

.rt-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.rt-btn.primary {
  background: var(--ui-action-primary-bg, var(--accent-light));
}

.rt-btn.tiny {
  padding: 1px 7px;
  font-size: 10.5px;
  flex-shrink: 0;
}

.rt-meta {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-secondary));
  flex-shrink: 0;
}

.rt-error {
  margin: 10px;
}

/* Sits in the replay action row — no margin, just the rule. */
.rt-error-inline {
  flex-shrink: 1;
}

.rt-hint {
  color: var(--ui-text-muted-fg, var(--text-secondary));
  font-size: 12px;
  padding: 10px;
  text-align: center;
}
</style>
