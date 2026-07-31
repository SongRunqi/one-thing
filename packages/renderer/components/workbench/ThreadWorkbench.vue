<template>
  <section class="thread-workbench">
    <header class="thread-head">
      <div class="head-line">
        <span class="head-tag">THREAD</span>
        <span
          class="head-title"
          :title="headTitle"
        >{{ headTitle }}</span>
      </div>
      <div class="head-stats">
        <span>{{ summary.stepCount }} 步</span>
        <span
          v-if="summary.runCount"
          class="dot-sep"
        >{{ summary.runCount }} 次执行</span>
        <span
          v-if="summary.running"
          class="head-live"
        >运行中</span>
        <span
          v-else-if="summary.lastActivityAt"
          class="dot-sep"
        >{{ formatClock(summary.lastActivityAt) }}</span>
      </div>
    </header>

    <div
      v-if="loading && !entries.length"
      class="thread-state"
    >
      正在读这条线程…
    </div>

    <!-- 空线程是个真答案:活刚领下来、工作台还没动过手。 -->
    <div
      v-else-if="!entries.length"
      class="thread-state"
    >
      <p>这条线程还没有执行记录。</p>
      <p class="state-note">
        右栏只收「已发生的执行」——说话在中栏,审批在会话里。
      </p>
    </div>

    <div
      v-else
      ref="scrollEl"
      class="thread-entries"
    >
      <template
        v-for="entry in entries"
        :key="entry.id"
      >
        <div
          v-if="entry.kind === 'instruction'"
          class="thread-entry is-instruction"
          :class="{ 'is-steered': entry.steered }"
        >
          <span class="entry-mark">{{ entry.steered ? '插' : '令' }}</span>
          <span class="entry-text">{{ entry.text }}</span>
          <time class="entry-time">{{ formatClock(entry.timestamp) }}</time>
        </div>

        <div
          v-else-if="entry.kind === 'note'"
          class="thread-entry is-note"
        >
          <span class="entry-mark">×</span>
          <span class="entry-text">{{ entry.text }}</span>
          <time class="entry-time">{{ formatClock(entry.timestamp) }}</time>
        </div>

        <article
          v-else
          class="thread-run"
          :class="{ 'is-running': entry.running }"
        >
          <header class="run-head">
            <span class="run-index">{{ String(entry.index).padStart(2, '0') }}</span>
            <span class="run-count">{{ entry.steps.length }} 步</span>
            <span
              v-if="entry.running"
              class="run-live"
            >运行中</span>
            <time class="entry-time">{{ formatClock(entry.timestamp) }}</time>
          </header>
          <!-- 步骤流与 diff 一律复用既有渲染(StepsPanel → ToolStepDetails →
               DiffView → diff-hunks),右栏只是换了个落位。 -->
          <StepsPanel
            class="run-steps"
            :steps="entry.steps"
            :session-id="props.sessionId"
            @open-file="(filePath: string) => emit('openFile', filePath)"
          />
        </article>
      </template>
    </div>

    <!-- 「在这条线程里回复」:走既有发消息链路(useChatSession → chatStore →
         platformApi.emitCommand),不是第二个 InputBox —— 附件/@/模型选择等
         全部留在中栏的 composer,这里只有一句话。 -->
    <form
      class="thread-reply"
      @submit.prevent="submitReply"
    >
      <textarea
        v-model="draft"
        class="reply-input"
        rows="2"
        :placeholder="replyPlaceholder"
        :disabled="!props.sessionId || sending"
        spellcheck="false"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        @keydown="handleReplyKeydown"
      />
      <div class="reply-bar">
        <span class="reply-mode">{{ isGenerating ? '⏎ 插话' : '⏎ 发送' }}</span>
        <Button
          unstyled
          class="reply-send"
          native-type="submit"
          :disabled="!canSubmit"
          title="在这条线程里回复"
        >
          <ArrowRight
            :size="13"
            :stroke-width="2"
            aria-hidden="true"
          />
        </Button>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import StepsPanel from '@/components/chat/StepsPanel.vue'
import { useChatSession } from '@/composables/useChatSession'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { buildThreadEntries, summarizeThread } from './thread-entries'

const props = defineProps<{
  /** 这条线程对应的执行(工作台)会话。 */
  sessionId: string
}>()

const emit = defineEmits<{
  openFile: [filePath: string]
  /** 让 tab 标题跟着会话名走(与 review tab 同一手法)。 */
  titleResolved: [title: string]
}>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const threadSessionId = computed(() => props.sessionId)
const { messages, isGenerating, sendMessage, steerMessage } = useChatSession(threadSessionId)

const draft = ref('')
const composing = ref(false)
const sending = ref(false)
const loading = ref(false)
const scrollEl = ref<HTMLElement | null>(null)

const entries = computed(() => buildThreadEntries(messages.value))
const summary = computed(() => summarizeThread(entries.value))

const sessionName = computed(() => {
  const id = props.sessionId
  if (!id) return ''
  return sessionsStore.getSessionItem?.(id)?.name || ''
})
const headTitle = computed(() => sessionName.value || '执行会话')
const replyPlaceholder = computed(() =>
  sessionName.value ? `在这条线程里回复 ${sessionName.value}…` : '在这条线程里回复…')
const canSubmit = computed(() => Boolean(props.sessionId) && draft.value.trim().length > 0 && !sending.value)

function formatClock(timestamp: number): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * 补拉这条线程的消息。
 *
 * **只在 store 里一条都没有时才拉** —— 同一个会话可能同时开在中栏页签里,那边
 * 是分页加载的,这里再整份灌一次会把它的分页游标冲掉。已经有内容的会话靠既有的
 * 流式事件继续更新(事件按 sessionId 落进同一份 store,不需要线程自己订阅)。
 */
async function ensureLoaded(sessionId: string): Promise<void> {
  if (!sessionId) return
  if (chatStore.getSessionState(sessionId).messages.value.length > 0) return
  loading.value = true
  try {
    await chatStore.loadMessages(sessionId)
  } finally {
    if (sessionId === props.sessionId) loading.value = false
  }
}

function scrollToLatest(): void {
  const el = scrollEl.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

watch(() => props.sessionId, async id => {
  draft.value = ''
  await ensureLoaded(id)
  await nextTick()
  scrollToLatest()
}, { immediate: true })

watch(sessionName, name => {
  if (name) emit('titleResolved', name)
}, { immediate: true })

// 跟到最新一步,但只在用户本来就贴着底部时跟 —— 往回翻看历史步骤的人不该被
// 一次新的工具回调甩回底下。
watch(() => entries.value.length, async () => {
  const el = scrollEl.value
  const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80
  if (!nearBottom) return
  await nextTick()
  scrollToLatest()
})

async function submitReply(): Promise<void> {
  const text = draft.value.trim()
  if (!text || !props.sessionId || sending.value) return
  sending.value = true
  try {
    // 正在跑的时候回复 = 插话(steer),引擎不打断当前流;停着的时候就是发消息。
    // 两条都是既有链路,线程不另起一种发送语义。
    const ok = isGenerating.value ? await steerMessage(text) : await sendMessage(text)
    if (ok !== false) draft.value = ''
  } finally {
    sending.value = false
  }
}

function handleReplyKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return
  // IME 三重护栏:composition 事件、原生 isComposing、以及 Safari/中文输入法把
  // 确认键报成 229 的那一档。少一道就会在选词时把半截拼音发出去。
  if (composing.value || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submitReply()
}
</script>

<style scoped>
.thread-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.thread-head {
  flex-shrink: 0;
  padding: 9px 10px 8px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border-color, var(--border)));
}

.head-line {
  display: flex;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
}

.head-tag {
  flex-shrink: 0;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
}

.head-title {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head-stats {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.head-live,
.run-live {
  color: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.thread-state {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 18px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  text-align: center;
}

.state-note {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-size: 11px;
  line-height: 1.6;
}

.thread-entries {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden auto;
  padding: 6px 0 10px;
}

/* 账页行:指令与出错都是一行,细横线分隔,不做成卡片。 */
.thread-entry {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 55%, transparent);
  font-size: 11.5px;
  line-height: 1.55;
}

.entry-mark {
  flex: 0 0 auto;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
}

.thread-entry.is-instruction .entry-text {
  color: var(--ui-text-primary-fg, var(--text));
}

.thread-entry.is-steered .entry-mark {
  color: var(--ui-status-warning-fg, var(--color-warning, #ad6f16));
}

.thread-entry.is-note .entry-mark,
.thread-entry.is-note .entry-text {
  color: var(--ui-status-danger-fg, var(--color-error, #8e2721));
}

.entry-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.entry-time {
  flex: 0 0 auto;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}

.thread-run {
  padding: 7px 10px 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 55%, transparent);
}

.run-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.run-index {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  letter-spacing: 0.08em;
}

.thread-run.is-running .run-index {
  color: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.run-count {
  flex: 1 1 auto;
  min-width: 0;
}

.run-steps {
  margin-top: 4px;
}

.thread-reply {
  flex: 0 0 auto;
  padding: 8px 10px 9px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

.reply-input {
  width: 100%;
  box-sizing: border-box;
  display: block;
  padding: 6px 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 0;
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text));
  font-family: inherit;
  font-size: 12px;
  line-height: 1.55;
  outline: none;
  resize: none;
}

.reply-input:focus {
  border-color: var(--ui-status-info-fg, var(--color-info, #39586f));
}

.reply-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 5px;
}

.reply-mode {
  flex: 1 1 auto;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
}

.right-workbench .reply-send,
.reply-send {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  color: var(--ui-text-muted-fg, var(--muted));
}

.reply-send:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.reply-send:disabled {
  opacity: 0.45;
}
</style>
