<template>
  <!-- 提问卡片:与审批账页同一套图纸语言(零填充、一条细边、等宽注记),
       但它是**流内**的一张卡而不是 composer 上方的栏位 —— 理由见 script 段。 -->
  <div
    class="interaction-card"
    :class="{ 'is-settled': isSettled }"
    :data-state="cardState"
    :data-testid="`interaction-card-${request.id}`"
  >
    <div class="interaction-row is-head">
      <span class="interaction-key">ask</span>
      <span class="interaction-value">
        <!-- 待答时先摆一枚「需要你」的记号:这张卡在流里与消息并排,没有位置可以
             代它说话(审批卡贴着 composer,位置本身就是信号),只能自己带上。 -->
        <span
          v-if="!isSettled"
          class="interaction-badge"
          data-testid="interaction-todo-badge"
        >{{ isExpired ? '已超时' : '待你回答' }}</span>
        <span class="interaction-origin">{{ originLabel }}</span>
        <span
          v-if="isSettled && settledTimeLabel"
          class="interaction-time"
          data-testid="interaction-settled-at"
        >{{ settledTimeLabel }}</span>
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
      <!-- 已办之后题干原文收起:留下的那行「标题 + 你选的」才是回看要的东西,
           把整段问题连同选项一起摊着,就是这张卡「答完了还占着一屏」的由来。 -->
      <p
        v-if="!isSettled && question.header?.trim()"
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

      <!-- 已办态:一行结论。选中的那条醒目,没选的那些整组收起 —— 一张回看用的
           记录不需要把当初的备选再摆一遍。 -->
      <div
        v-else
        class="answer-row"
      >
        <span
          v-if="answerText(question.id)"
          class="answer-mark"
          aria-hidden="true"
        >✓</span>
        <span
          class="answer-line"
          :data-testid="`interaction-answer-${question.id}`"
        >{{ answerText(question.id) || '—' }}</span>
        <span
          v-if="skippedCount(question) > 0"
          class="answer-skipped"
        >未选 {{ skippedCount(question) }} 项</span>
      </div>
    </div>

    <div
      v-if="isSettled && answer?.reason"
      class="interaction-row is-reason"
    >
      <span class="interaction-key">reason</span>
      <span class="interaction-value is-dim">{{ answer.reason }}</span>
    </div>

    <!-- 收场之后整条操作带撤掉:留一条只写着「已收场」的空脚,正是用户说的
         「答完了这个框还杵在那儿」。已办的状态与时刻在头一行,那里够了。 -->
    <div
      v-if="!isSettled"
      class="interaction-foot"
    >
      <span class="interaction-hint">{{ footHint }}</span>
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
  formatSettledAt,
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
  /** 收场的时刻。已办记录上要有它 —— 一条没有时间的记录对不了账。 */
  settledAt?: number
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

const settledTimeLabel = computed(() => formatSettledAt(props.settledAt))

/** 已办那一行的正文。抽出来是为了让「有没有答案」这件事只判一次(记号跟着它走)。 */
function answerText(questionId: string): string {
  return summarizeAnswer(props.answer?.answers?.[questionId])
}

/**
 * 这题当初还摆过几个没选的选项。
 *
 * 只报数不列出来:回看要的是「我选了哪个」,备选摊开只会把已办记录重新撑成一屏 ——
 * 但完全不提又等于假装当初只有一个选择,数字是这两者之间那条便宜的中间道。
 */
function skippedCount(question: InteractionQuestion): number {
  const selected = props.answer?.answers?.[question.id]?.selected ?? []
  return Math.max(0, question.options.length - selected.length)
}

const footHint = computed(() => {
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
  border-left: 1px solid var(--interaction-frame);
  /* `--radius-xs` 是**账页族**的圆角(权限账页用的就是它),不是气泡族的
     `--skin-bubble-radius` / `--ui-message-user-*`。底色同理:这里 transparent,
     气泡取的是 `--user-bubble-surface`。这两条是「不许长得像消息」的 token 判据。 */
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  overflow: hidden;
  transition: border-color var(--duration-normal) var(--ease-default), background var(--duration-normal) var(--ease-default);
}

/* 收场之后最后一格不再拖一条分隔线 —— 那条线原本是给下一格用的,而已办卡没有下一格。 */
.interaction-card > *:last-child {
  border-bottom: 0;
}

/**
 * 「还等你」的形态信号。
 *
 * 审批卡不需要这一层:它长在 composer 上方,位置本身就说明了「现在轮到你」。提问卡
 * 在流里(那是对的 —— 上下文就在旁边),于是必须自己带信号,否则它与一段普通消息
 * 之间只差一条细边。三样都从既有 token 取,不发明新语言:一道左缘、一层待办底、
 * 一枚记号。收场之后三样一起撤走,已办记录该是安静的。
 */
.interaction-card[data-state='open'],
.interaction-card[data-state='expired'] {
  border-left: 2px solid var(--interaction-edge);
}

.interaction-card[data-state='open'] .interaction-row.is-head,
.interaction-card[data-state='expired'] .interaction-row.is-head {
  background: var(--interaction-tint);
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

.interaction-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--interaction-edge);
  border-radius: var(--radius-xs, 4px);
  background: var(--interaction-tint);
  color: var(--interaction-ink);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.interaction-origin {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.interaction-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
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

/* 已办的一行:记号 + 结论 + 一句「还有几项没选」。整行只有结论是亮的。 */
.answer-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.answer-mark {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--interaction-ink);
}

.answer-line {
  min-width: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--interaction-ink);
}

.answer-skipped {
  flex-shrink: 0;
  margin-left: auto;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

/**
 * 已办态 = **一行账目**,不是一个块。
 *
 * 上一版把已办卡收成了一个「中性小块」:框还在四条边上,分隔线还在,底色一撤,
 * 于是它在流里读起来正是「一个装着我答案的气泡」——用户以为自己作答之后凭空多了
 * 一条 user message。真正的病根是**形态**:块 = 消息,记录 = 一道边 + 一行字。
 *
 * 所以收场之后三件事一起做,与权限账页的记录形态对齐:
 *  1. 四边的框收成**一道细左缘**(1px,中性 `--interaction-frame`,与待答那道 2px
 *     状态色左缘区分开:一个是「轮到你」,一个是「这里有过一次问答」);
 *  2. **无底**:头行的待办底撤走,圆角一并归零 —— 圆角+底色正是气泡的两件衣服;
 *  3. **次要字色**:正文降到 `--ui-text-secondary-fg`,只留 ✓ 记号与收场标签吃
 *     状态色(`--interaction-ink`)—— 那一枚图标就是这条记录的全部音量。
 *
 * 高度不做突变补偿:内部横向 padding 与外边距原样保留(内容本身少了选项与操作带,
 * 那一段收缩是这张卡该有的),边框与底色走 `--duration-normal` 过渡。
 */
.interaction-card.is-settled {
  border: 0;
  border-left: 1px solid var(--interaction-frame);
  border-radius: 0;
  background: transparent;
}

.interaction-card.is-settled .interaction-row,
.interaction-card.is-settled .interaction-question {
  border-bottom: 0;
}

/* 单元格的竖墙也撤掉:记录是一行字,不是一张表。 */
.interaction-card.is-settled .interaction-key {
  border-right: 0;
}

.interaction-card.is-settled .interaction-row {
  min-height: 26px;
}

/* `.is-dim`(reason 行)不动 —— 它本来就更靠后一层,拉到 secondary 反而变亮。 */
.interaction-card.is-settled .interaction-value:not(.is-dim),
.interaction-card.is-settled .question-title,
.interaction-card.is-settled .answer-line {
  color: var(--ui-text-secondary-fg);
}

.interaction-card.is-settled .question-title {
  font-weight: 500;
}

/* 已办卡整体收紧一格:同一张卡,答完之后不该还占着待答时的高度。 */
.interaction-card.is-settled .interaction-question {
  gap: 3px;
  padding: 6px 11px 7px;
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
