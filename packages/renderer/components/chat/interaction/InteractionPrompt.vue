<template>
  <!-- 提问栏位:与审批账页同一套图纸语言(零填充、一条细边、等宽注记),
       也与它同一个位置 —— composer 上方。理由见 script 段。 -->
  <div
    v-if="current"
    class="session-interaction-panel"
    :data-state="isExpired ? 'expired' : 'open'"
    :data-testid="`interaction-prompt-${current.id}`"
  >
    <div class="interaction-row is-head">
      <span class="interaction-key">ask</span>
      <span class="interaction-value">
        <span class="interaction-origin">{{ originLabel }}</span>
        <span
          v-if="queuedCount > 0"
          class="interaction-queued"
          data-testid="interaction-queued"
        >+{{ queuedCount }} 待答</span>
        <span
          class="interaction-countdown"
          :data-expired="isExpired ? 'true' : 'false'"
        >{{ countdownLabel }}</span>
      </span>
    </div>

    <div
      v-for="question in current.questions"
      :key="question.id"
      class="interaction-question"
      :data-testid="`interaction-question-${question.id}`"
    >
      <div class="question-head">
        <span class="question-title">{{ questionTitle(question) }}</span>
        <span
          v-if="question.multiSelect"
          class="question-flag"
        >可多选</span>
      </div>
      <p
        v-if="question.header?.trim()"
        class="question-body"
      >
        {{ question.question }}
      </p>

      <div class="option-list">
        <Button
          v-for="option in question.options"
          :key="option.label"
          unstyled
          class="option"
          native-type="button"
          :disabled="isExpired"
          :aria-pressed="isSelected(question.id, option.label)"
          @click="pick(question, option.label)"
        >
          <span class="option-label">{{ option.label }}</span>
          <span
            v-if="option.description"
            class="option-desc"
          >{{ option.description }}</span>
          <pre
            v-if="option.preview"
            class="option-preview"
          >{{ option.preview }}</pre>
        </Button>
      </div>

      <div
        v-if="question.allowFreeText"
        class="interaction-row is-freetext"
      >
        <span class="interaction-key">其他</span>
        <textarea
          :value="draft[question.id]?.freeText ?? ''"
          class="freetext-input"
          :disabled="isExpired"
          placeholder="都不合适?自己写一句…"
          rows="1"
          :data-testid="`interaction-freetext-${question.id}`"
          @input="onFreeText(question.id, $event)"
          @keydown.stop
        />
      </div>
    </div>

    <div class="interaction-foot">
      <span class="interaction-hint">{{ footHint }}</span>
      <Button
        unstyled
        class="interaction-btn skip"
        native-type="button"
        :disabled="isExpired || inFlight"
        data-testid="interaction-decline"
        @click="decline"
      >
        SKIP
      </Button>
      <Button
        unstyled
        class="interaction-btn submit"
        native-type="button"
        :disabled="isExpired || !isComplete || inFlight"
        data-testid="interaction-submit"
        @click="submit"
      >
        SEND
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * agent 提问栏位 —— composer 上方,答完即收,会话里不留痕。
 *
 * ## 与审批栏位的异同
 *
 * **同**:同一套图纸语言(零填充 / 一条细边 / 等宽注记 / 决定本身是唯一的颜色),
 * 同一个位置(composer 上方那一格「现在轮到你」),同一条排队纪律(同一时刻只画
 * 一条,后面还欠几条写在头一行),同一条应答纪律(这里只画与收集意图)。
 *
 * **异**,两处:
 *  1. **倒计时**:审批没有硬 deadline(协作房是 30 分钟软提醒);提问必有
 *     (协议里 `deadlineAt` 不可选)。这一格是提问独有的。
 *  2. **应答形状**:审批是四选一的档位,提问是一整张答案表 —— 全部题答完才能交
 *     (`Interaction.respond()` 收的是整张表并当场结算,没有逐题提交这回事)。
 *
 * ## 为什么不再是流内的一张卡
 *
 * 上一版把提问画在消息流里,答完之后收成一行账目留在原地,理由是「你选了哪个本身
 * 就是这段对话的一部分」。真机上它换来的是另外两样:一是位置——一张长在流末尾的卡
 * 读起来就是「凭空多出来的一条消息」;二是残留——答完还杵在那儿。用户要的是
 * **弹窗手感**:该你答的时候贴着输入框出来,答完收走,流里干净。
 *
 * 这条决定的代价说清楚:**回看不到自己选过哪条路**。可对账的东西仍然有一份 ——
 * 那次 `ask_user` 工具调用的结果里就写着答案(`StepsPanel` 上展开得到),而那是
 * 内核自己持久化的真值,不是渲染层拼出来的第二份。
 *
 * ## 补水与排队都在这里
 *
 * 组件自带补水(切会话就问一次「这个会话还欠哪些回答」):事件不会为重载的窗口
 * 补发,而「屏幕上该不该有这条栏位」不允许有第二个答案。排队按 `createdAt` 排,
 * 最早那条先答 —— 与内核的结算次序一致。
 *
 * ## 倒计时与结算的职责划分(重要)
 *
 * 这里的秒表**只显示**。到点之后栏位变成不可点的「已超时」,但把这条提问结成
 * `timeout` 的是内核自己挂的那张表(`Interaction.armDeadline`)。UI 抢着补一发
 * respond 会造出一次用户没点过的应答,而且两边都自认为是结算方。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'
import { useInteractionsStore } from '@/stores/interactions'
import type { InteractionQuestion, InteractionRequest } from '@/types'
import {
  buildAnswers,
  emptyDraft,
  formatCountdown,
  interactionFootHint,
  isDraftComplete,
  isQuestionAnswered,
  questionTitle,
  toggleSelection,
  type InteractionDraft,
} from './interaction-prompt'

const props = defineProps<{
  sessionId?: string
}>()

const interactionsStore = useInteractionsStore()

/** 这个会话此刻欠着的提问,最早的在前 —— 只画第一条,其余只报数。 */
const queue = computed<InteractionRequest[]>(() =>
  [...interactionsStore.pendingFor(props.sessionId)].sort((a, b) => a.createdAt - b.createdAt),
)

const current = computed<InteractionRequest | undefined>(() => queue.value[0])
const queuedCount = computed(() => Math.max(0, queue.value.length - 1))

const draft = ref<InteractionDraft>({})
const now = ref(Date.now())

// 换了一条提问就换一份草稿 —— 上一题的选择绝不能顺延到下一题。
watch(current, request => {
  draft.value = request ? emptyDraft(request.questions) : {}
}, { immediate: true })

// 补水:切会话(冷启动也走这一支)就问一次内核还欠哪些回答。
watch(() => props.sessionId, sessionId => {
  void interactionsStore.ensureForSession(sessionId)
}, { immediate: true })

const remainingMs = computed(() => (current.value?.deadlineAt ?? 0) - now.value)
const isExpired = computed(() => Boolean(current.value) && remainingMs.value <= 0)
const isComplete = computed(() =>
  Boolean(current.value) && isDraftComplete(current.value!.questions, draft.value),
)

const originLabel = computed(() =>
  current.value?.origin === 'external-agent' ? '外部 agent 提问' : '工具提问',
)

const countdownLabel = computed(() => formatCountdown(remainingMs.value))

const footHint = computed(() => interactionFootHint({
  expired: isExpired.value,
  answered: (current.value?.questions ?? []).filter(q => isQuestionAnswered(draft.value[q.id])).length,
  total: current.value?.questions.length ?? 0,
  queued: queuedCount.value,
}))

// 秒表只在「还在等」的时候跑;栏位撤走或到点之后它一帧都不再走。
let timer: ReturnType<typeof setInterval> | null = null

function stopTicking(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

watch([current, isExpired], ([request, expired]) => {
  if (!request || expired) {
    stopTicking()
    return
  }
  if (!timer) {
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
}, { immediate: true })

onUnmounted(stopTicking)

function isSelected(questionId: string, label: string): boolean {
  return Boolean(draft.value[questionId]?.selected.includes(label))
}

function pick(question: InteractionQuestion, label: string): void {
  if (isExpired.value) return
  const entry = draft.value[question.id] ?? { selected: [], freeText: '' }
  draft.value = {
    ...draft.value,
    [question.id]: {
      ...entry,
      selected: toggleSelection(entry.selected, label, question.multiSelect),
    },
  }
}

function onFreeText(questionId: string, event: Event): void {
  const entry = draft.value[questionId] ?? { selected: [], freeText: '' }
  draft.value = {
    ...draft.value,
    [questionId]: { ...entry, freeText: (event.target as HTMLTextAreaElement).value },
  }
}

/**
 * 交卷在飞。
 *
 * 栏位是等应答回来、账本摘牌之后才撤走的(不本地伪造收场),那中间的几十毫秒里
 * 按钮还点得动 —— 连点两下就是两次 respond,第二次注定被内核当「已经结了」驳回。
 * 一个闩就够,不需要乐观地先把它从账上抹掉。
 */
const inFlight = ref(false)

async function submit(): Promise<void> {
  const request = current.value
  const sessionId = props.sessionId
  if (!request || !sessionId || isExpired.value || !isComplete.value || inFlight.value) return
  inFlight.value = true
  try {
    await interactionsStore.respond(sessionId, request, buildAnswers(request.questions, draft.value))
  } finally {
    inFlight.value = false
  }
}

async function decline(): Promise<void> {
  const request = current.value
  const sessionId = props.sessionId
  if (!request || !sessionId || isExpired.value || inFlight.value) return
  inFlight.value = true
  try {
    await interactionsStore.decline(sessionId, request)
  } finally {
    inFlight.value = false
  }
}
</script>

<style scoped>
/* 与权限账页同一族的图纸框:零填充、一条细边、细线分隔、等宽注记,并且与它
   共用同一条量出来的阅读列(`--chat-composer-width` + 两枚列边距),两个栏位
   在 composer 上方叠起来时左右缘对得上。
   唯一的颜色由「还在等你」这件事本身带(到点之后转为静默的警示色)。 */
.session-interaction-panel {
  --interaction-frame: color-mix(in srgb, var(--ui-border-strong-border) 52%, transparent);
  --interaction-divider: color-mix(in srgb, var(--ui-border-strong-border) 30%, transparent);
  /* 状态色成套取(fg / bg / border 各有其位),而不是拿 fg 去 color-mix 出
     另外两格 —— 那正是 `styles/__tests__/ui-token-vars.test.ts` 盯着的那条。 */
  --interaction-ink: var(--ui-status-info-fg, var(--ui-text-primary-fg));
  --interaction-tint: var(--ui-status-info-bg, var(--ui-state-hover-bg));
  --interaction-edge: var(--ui-status-info-border, var(--ui-border-strong-border));

  box-sizing: border-box;
  width: var(--chat-composer-width);
  margin: 0 var(--chat-content-column-right, auto) 8px var(--chat-content-column-left, auto);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--interaction-frame);
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  overflow: hidden;
}

/* 「轮到你」的形态信号:一道状态色左缘 + 头行一层待办底。位置已经说了大半
   (贴着输入框的那一格从来只放需要你动手的东西),这两样是补足的音量。 */
.session-interaction-panel[data-state='open'],
.session-interaction-panel[data-state='expired'] {
  border-left: 2px solid var(--interaction-edge);
}

.session-interaction-panel .interaction-row.is-head {
  background: var(--interaction-tint);
}

.session-interaction-panel[data-state='expired'] {
  --interaction-ink: var(--ui-status-warning-fg);
  --interaction-tint: var(--ui-status-warning-bg);
  --interaction-edge: var(--ui-status-warning-border);
}

.interaction-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: stretch;
  min-height: 30px;
  border-bottom: 1px solid var(--interaction-divider);
}

.interaction-key {
  display: flex;
  align-items: center;
  padding: 0 11px;
  border-right: 1px solid var(--interaction-divider);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

.interaction-value {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0 11px;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  color: var(--ui-text-primary-fg);
}

.interaction-origin {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.interaction-queued {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--interaction-edge);
  border-radius: var(--radius-xs, 4px);
  background: var(--interaction-tint);
  color: var(--interaction-ink);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.interaction-countdown {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--interaction-ink);
}

.interaction-countdown[data-expired='true'] {
  color: var(--ui-status-warning-fg);
}

.interaction-question {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 11px 10px;
  border-bottom: 1px solid var(--interaction-divider);
}

.question-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.question-title {
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ui-text-primary-fg);
}

.question-flag {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

.question-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ui-text-muted-fg);
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 6px 9px;
  border: 1px solid var(--interaction-divider);
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--duration-normal) var(--ease-default), background var(--duration-normal) var(--ease-default);
}

.option:hover:not(:disabled) {
  background: var(--ui-state-hover-bg);
}

.option[aria-pressed='true'] {
  border-color: var(--interaction-edge);
  background: var(--interaction-tint);
}

.option:disabled {
  cursor: default;
  opacity: 0.55;
}

.option-label {
  font-size: 12.5px;
  color: var(--ui-text-primary-fg);
}

.option-desc {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ui-text-muted-fg);
}

.option-preview {
  margin: 2px 0 0;
  padding: 6px 8px;
  max-height: 160px;
  overflow: auto;
  border-radius: var(--radius-xs, 4px);
  background: var(--ui-surface-code-block-bg, var(--ui-state-hover-bg));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--ui-text-muted-fg);
}

.interaction-row.is-freetext {
  align-items: start;
  border-bottom: 0;
  border-top: 1px solid var(--interaction-divider);
  margin-top: 2px;
}

.interaction-row.is-freetext .interaction-key {
  align-items: flex-start;
  padding-top: 9px;
}

.freetext-input {
  min-width: 0;
  min-height: 34px;
  resize: vertical;
  padding: 8px 11px;
  border: 0;
  background: transparent;
  color: var(--ui-text-primary-fg);
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  line-height: 1.5;
}

textarea.freetext-input:focus {
  outline: none;
  background: var(--ui-state-hover-bg);
}

.interaction-foot {
  display: flex;
  align-items: stretch;
  min-height: 32px;
}

.interaction-hint {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 0 11px;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.interaction-btn {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-left: 1px solid var(--interaction-divider);
  border-radius: 0;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ui-text-muted-fg);
  transition: background var(--duration-normal) var(--ease-default);
}

.interaction-btn.submit {
  color: var(--ui-status-success-fg);
}

.interaction-btn.submit:hover:not(:disabled) {
  background: var(--ui-status-success-bg);
}

.interaction-btn.skip:hover:not(:disabled) {
  background: var(--ui-state-hover-bg);
}

.interaction-btn:disabled {
  cursor: default;
  opacity: 0.45;
}
</style>
