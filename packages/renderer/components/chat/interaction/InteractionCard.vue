<template>
  <!-- 提问卡片:与审批账页同一套图纸语言(零填充、一条细边、等宽注记),
       但它是**流内**的一张卡而不是 composer 上方的栏位 —— 理由见 script 段。 -->
  <div
    class="interaction-card"
    :data-state="cardState"
    :data-testid="`interaction-card-${request.id}`"
  >
    <div class="interaction-row is-head">
      <span class="interaction-key">ask</span>
      <span class="interaction-value">
        <span class="interaction-origin">{{ originLabel }}</span>
        <span
          class="interaction-countdown"
          :data-expired="isExpired ? 'true' : 'false'"
        >{{ statusLabel }}</span>
      </span>
    </div>

    <div
      v-for="question in request.questions"
      :key="question.id"
      class="interaction-question"
      :data-testid="`interaction-question-${question.id}`"
    >
      <div class="question-head">
        <span class="question-title">{{ questionTitle(question) }}</span>
        <span
          v-if="question.multiSelect && !isSettled"
          class="question-flag"
        >可多选</span>
      </div>
      <p
        v-if="question.header?.trim()"
        class="question-body"
      >
        {{ question.question }}
      </p>

      <!-- 待答态:选项 + 「其他」 -->
      <template v-if="!isSettled">
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
      </template>

      <!-- 历史态:答过什么留在原地,卡片不消失 -->
      <div
        v-else
        class="answer-line"
        :data-testid="`interaction-answer-${question.id}`"
      >
        {{ summarizeAnswer(answer?.answers?.[question.id]) || '—' }}
      </div>
    </div>

    <div
      v-if="isSettled && answer?.reason"
      class="interaction-row is-reason"
    >
      <span class="interaction-key">reason</span>
      <span class="interaction-value is-dim">{{ answer.reason }}</span>
    </div>

    <div class="interaction-foot">
      <span class="interaction-hint">{{ footHint }}</span>
      <template v-if="!isSettled">
        <Button
          unstyled
          class="interaction-btn skip"
          native-type="button"
          :disabled="isExpired"
          data-testid="interaction-decline"
          @click="emit('decline', request)"
        >
          SKIP
        </Button>
        <Button
          unstyled
          class="interaction-btn submit"
          native-type="button"
          :disabled="isExpired || !isComplete"
          data-testid="interaction-submit"
          @click="submit"
        >
          SEND
        </Button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 一次 agent 提问 = 一张卡(claude-code-integration-v2 §4,E2)。
 *
 * ## 与审批卡的异同
 *
 * **同**:同一套图纸语言(零填充 / 一条细边 / 等宽注记 / 决定本身是唯一的颜色),
 * 同一条归位纪律(有 `toolCallId` 就贴在那次工具调用所属的消息之后),
 * 同一条应答纪律(卡只画与收集意图,发命令由上层统一执行)。
 *
 * **异**,三处,都是被两个概念的差别逼出来的:
 *  1. **位置**:审批是 composer 上方的一条栏位(同一时刻只可能有一条需要决定的
 *     审批,而它要贴着输入区);提问可以**同时有好几条**,而且答完之后要留在
 *     原地能回看 —— 一条栏位画不了「三张卡,两张已答」。所以提问在**流内**。
 *  2. **历史态**:审批答完即消失(结果写在那次工具调用的状态上);提问答完之后
 *     「你选了哪个」本身就是这段对话的一部分,消失了用户就无从对账。
 *  3. **倒计时**:审批没有硬 deadline(协作房是 30 分钟软提醒);提问必有
 *     (协议里 `deadlineAt` 不可选)。这一格是提问独有的。
 *
 * ## 倒计时与结算的职责划分(重要)
 *
 * 这里的秒表**只显示**。到点之后卡片变成不可点的「已超时」,但把这条提问结成
 * `timeout` 的是内核自己挂的那张表(`Interaction.armDeadline`)。UI 抢着补一发
 * respond 会造出一次用户没点过的应答,而且两边都自认为是结算方 —— 那正是
 * 「每一条等待都有 deadline,且 deadline 归内核」这条原则要避免的。
 * 卡片在事件回来之后才进历史态,慢半拍是对的:它跟随真值,不预测真值。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'
import type {
  InteractionAnswer,
  InteractionQuestion,
  InteractionQuestionAnswer,
  InteractionRequest,
} from '@/types'
import {
  buildAnswers,
  emptyDraft,
  formatCountdown,
  interactionOutcomeLabel,
  isDraftComplete,
  questionTitle,
  summarizeAnswer,
  toggleSelection,
  type InteractionDraft,
} from './interaction-card'

const props = defineProps<{
  request: InteractionRequest
  /** 给了它就是历史态(这次提问已经收场了)。 */
  answer?: InteractionAnswer
}>()

const emit = defineEmits<{
  submit: [request: InteractionRequest, answers: Record<string, InteractionQuestionAnswer>]
  decline: [request: InteractionRequest]
}>()

const draft = ref<InteractionDraft>(emptyDraft(props.request.questions))
const now = ref(Date.now())

// 换了一条提问就换一份草稿 —— 上一题的选择绝不能顺延到下一题。
watch(() => props.request.id, () => {
  draft.value = emptyDraft(props.request.questions)
})

const isSettled = computed(() => Boolean(props.answer))
const remainingMs = computed(() => props.request.deadlineAt - now.value)
const isExpired = computed(() => !isSettled.value && remainingMs.value <= 0)
const isComplete = computed(() => isDraftComplete(props.request.questions, draft.value))

const cardState = computed(() => {
  if (isSettled.value) return props.answer?.outcome ?? 'settled'
  return isExpired.value ? 'expired' : 'open'
})

const originLabel = computed(() =>
  props.request.origin === 'external-agent' ? '外部 agent 提问' : '工具提问',
)

const statusLabel = computed(() => {
  if (isSettled.value) return interactionOutcomeLabel(props.answer!.outcome)
  return formatCountdown(remainingMs.value)
})

const footHint = computed(() => {
  if (isSettled.value) return '已收场,记录留在这里'
  if (isExpired.value) return '已超时,等待后端结算'
  const answered = props.request.questions.filter(q => {
    const entry = draft.value[q.id]
    return Boolean(entry && (entry.selected.length > 0 || entry.freeText.trim()))
  }).length
  const total = props.request.questions.length
  return total > 1 ? `${answered}/${total} 题已选,全部答完才能发送` : 'awaiting your answer'
})

// 秒表只在「还在等」的时候跑;结算或到点之后它一帧都不再走。
let timer: ReturnType<typeof setInterval> | null = null

function stopTicking(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

watch([isSettled, isExpired], ([settled, expired]) => {
  if (settled || expired) {
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

function submit(): void {
  if (isExpired.value || !isComplete.value) return
  emit('submit', props.request, buildAnswers(props.request.questions, draft.value))
}
</script>

<style scoped>
/* 与权限账页同一族的图纸框:零填充、一条细边、细线分隔、等宽注记。
   唯一的颜色由「还在等你」这件事本身带(到点之后转为静默的警示色)。 */
.interaction-card {
  --interaction-frame: color-mix(in srgb, var(--ui-border-strong-border) 52%, transparent);
  --interaction-divider: color-mix(in srgb, var(--ui-border-strong-border) 30%, transparent);
  /* 状态色成套取(fg / bg / border 各有其位),而不是拿 fg 去 color-mix 出
     另外两格 —— 那正是 `styles/__tests__/ui-token-vars.test.ts` 盯着的那条。 */
  --interaction-ink: var(--ui-status-info-fg, var(--ui-text-primary-fg));
  --interaction-tint: var(--ui-status-info-bg, var(--ui-state-hover-bg));
  --interaction-edge: var(--ui-status-info-border, var(--ui-border-strong-border));

  margin: 14px 0 10px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--interaction-frame);
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  overflow: hidden;
}

.interaction-card[data-state='expired'],
.interaction-card[data-state='timeout'] {
  --interaction-ink: var(--ui-status-warning-fg);
  --interaction-tint: var(--ui-status-warning-bg);
  --interaction-edge: var(--ui-status-warning-border);
}

.interaction-card[data-state='answered'] {
  --interaction-ink: var(--ui-status-success-fg);
  --interaction-tint: var(--ui-status-success-bg);
  --interaction-edge: var(--ui-status-success-border);
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

.interaction-value.is-dim {
  color: var(--ui-text-muted-fg);
}

.interaction-origin {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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

.answer-line {
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--interaction-ink);
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
