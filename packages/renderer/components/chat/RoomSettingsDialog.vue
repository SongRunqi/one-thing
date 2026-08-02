<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="room-dialog-overlay"
      @click.self="close"
    >
      <div
        class="room-dialog"
        role="dialog"
        aria-label="房间设置"
      >
        <div class="dialog-header">
          <h3>房间设置</h3>
        </div>

        <div class="dialog-body">
          <label class="field">
            <span class="field-label">房间名</span>
            <input
              v-model="draft.name"
              class="field-input"
              type="text"
              @keydown.enter="save"
            >
          </label>

          <!-- dm 房的名册只读(agent-im-dm.md P1b 遗留发现 4):形态即身份 ——
               人数决定这间房是什么(单成员 = 和你的托管私聊,双成员 = 两位同事
               的私聊),而它的 id、房名、免判激活、链长闸默认值全部建立在这个
               人数上。加个人就把私聊变成群,那是另一个动作,不该藏在这张表里。
               其余每一格(预算、断路器、权限、暂停)照常。 -->
          <div
            v-if="isDmRoom"
            class="field"
          >
            <span class="field-label">成员</span>
            <div
              v-for="agent in memberAgents"
              :key="agent.id"
              class="member-line is-static"
            >
              <AgentAvatar
                class="member-avatar"
                :avatar="agent.avatar"
                :avatar-image="agent.avatarImage"
                :size="18"
              />
              <span class="member-name">{{ agent.name }}</span>
              <span
                v-if="agent.title"
                class="member-title"
              >{{ agent.title }}</span>
            </div>
            <span class="field-hint">私聊的成员不能增删——要多一个人,请另开一个群聊。</span>
          </div>

          <div
            v-else
            class="field"
          >
            <span class="field-label">成员</span>
            <p
              v-if="selectableAgents.length === 0"
              class="field-hint"
            >
              还没有可用的 Agent——先在「Agents」面板创建几个角色。
            </p>
            <button
              v-for="agent in selectableAgents"
              :key="agent.id"
              type="button"
              class="member-line"
              :class="{ 'is-on': draft.memberAgentIds.includes(agent.id) }"
              :aria-pressed="draft.memberAgentIds.includes(agent.id)"
              @click="toggleMember(agent.id)"
            >
              <AgentAvatar
                class="member-avatar"
                :avatar="agent.avatar"
                :avatar-image="agent.avatarImage"
                :size="18"
              />
              <span class="member-name">{{ agent.name }}</span>
              <span
                v-if="agent.title"
                class="member-title"
              >{{ agent.title }}</span>
            </button>
          </div>

          <!-- 负责人同理:私聊里没有"负责评审与分派"这件事(双成员 dm 房按设计
               就没有 pmAgentId),留一个只能选那一两个人的下拉是纯噪声。 -->
          <label
            v-if="!isDmRoom"
            class="field"
          >
            <span class="field-label">负责人(PM) <em>可选</em></span>
            <select
              v-model="draft.pmAgentId"
              class="field-input"
            >
              <option value="">
                无
              </option>
              <option
                v-for="agent in selectedAgents"
                :key="agent.id"
                :value="agent.id"
              >
                {{ agent.name }}{{ agent.title ? ` · ${agent.title}` : '' }}
              </option>
            </select>
            <span class="field-hint">负责评审与任务分派;群聊中更倾向主动接话(不再是唯一应答人)。</span>
          </label>

          <!-- 响应模式(docs/design/collab-speaking-order.md)。参数跟着模式显隐 ——
               并行时"次序"没有意义,顺序时"同时发言上限"恒为 1,两边同时摆出来
               只会让人去调一个不生效的格子。 -->
          <label class="field">
            <span class="field-label">响应模式</span>
            <select
              v-model="draft.responseMode"
              class="field-input"
            >
              <option value="parallel">
                并行(各自判断要不要接话)
              </option>
              <option value="auto">
                智能(协调器每轮现场编排)
              </option>
              <option value="serial">
                顺序(按次序依次发言)
              </option>
            </select>
            <span class="field-hint">
              并行:每条消息问一遍每位同事想不想说,愿意的一起说。
              智能:每条消息只问一次协调器「这轮谁说、什么次序」,它可以安排一起说、
              依次说,或者谁都不说。顺序:不问,按下面的次序一个接一个说。
            </span>
          </label>

          <label class="field">
            <span class="field-label">同时发言上限</span>
            <input
              v-model.number="draft.maxConcurrentTurns"
              class="field-input"
              type="number"
              min="0"
              step="1"
            >
            <span class="field-hint">最多几个人同时说话。填 0 表示不限。智能/顺序模式下,
              一批之内的并行也受这一格约束。</span>
          </label>

          <template v-if="draft.responseMode !== 'parallel'">
            <div class="field">
              <span class="field-label">发言次序</span>
              <div
                v-for="(agent, index) in orderedSpeakers"
                :key="agent.id"
                class="member-line is-static"
              >
                <span class="order-index">{{ index + 1 }}</span>
                <AgentAvatar
                  class="member-avatar"
                  :avatar="agent.avatar"
                  :avatar-image="agent.avatarImage"
                  :size="18"
                />
                <span class="member-name">{{ agent.name }}</span>
                <span class="order-actions">
                  <button
                    type="button"
                    class="order-button"
                    :disabled="index === 0"
                    aria-label="上移"
                    @click="moveSpeaker(index, -1)"
                  >↑</button>
                  <button
                    type="button"
                    class="order-button"
                    :disabled="index === orderedSpeakers.length - 1"
                    aria-label="下移"
                    @click="moveSpeaker(index, 1)"
                  >↓</button>
                </span>
              </div>
              <span class="field-hint">
                顺序模式按这个次序依次发言;智能模式下它是**给协调器的建议**,
                协调器可以不听。转完一整轮没人开口就停。
              </span>
            </div>

            <label class="field">
              <span class="field-label">轮次</span>
              <input
                v-model.number="draft.relayLoops"
                class="field-input"
                type="number"
                min="0"
                step="1"
              >
              <span class="field-hint">一趟最多转几圈,到了就按住讨论。填 0 表示不限。</span>
            </label>
          </template>

          <label class="field">
            <span class="field-label">日预算(美元)</span>
            <input
              v-model.number="draft.dailyCostUSD"
              class="field-input"
              type="number"
              min="0"
              step="0.5"
            >
            <span class="field-hint">按真实 API 花费计;填 0 表示不限额。</span>
            <!-- W13.5: the same ledger the budget gate reads, taken once when
                 the panel opens. Shown even at 0 (不限额) — knowing what a room
                 costs is the point, capping it is a separate decision. -->
            <span
              v-if="spentTodayText"
              class="spend-line"
            >{{ spentTodayText }}</span>
          </label>

          <!-- 链长闸:无人类输入时,讨论连着走几条就按住。回合断路器管的是"一轮
               里干了多少",这一格管的是"没人说话时接力多久" —— 两件事,两格。
               0 = 不限,与上下两格同一套约定。 -->
          <label class="field">
            <span class="field-label">连续发言上限</span>
            <input
              v-model.number="draft.maxChain"
              class="field-input"
              type="number"
              min="0"
              step="1"
            >
            <span class="field-hint">
              没有人类插话时,成员之间最多连着说几条,超过就按住讨论——你说一句就继续。填 0 表示不限。
              被 @ 的、主动接话的都算同一个数;任务交付与评审不受这一格限制。
            </span>
          </label>

          <!-- W22 回合断路器: the structural bound on one turn's tool loop.
               Configurable because the defaults are a guess about the longest
               legitimate turn, and a backstop that trips on real work is a
               behaviour. 0 = 关闭, same convention as the budget above. -->
          <label class="field">
            <span class="field-label">单轮发言上限</span>
            <input
              v-model.number="draft.maxTurnSayCalls"
              class="field-input"
              type="number"
              min="0"
              step="1"
            >
            <span class="field-hint">一个回合内最多连发几条;超过则中止该回合。填 0 表示不限。</span>
          </label>

          <label class="field">
            <span class="field-label">单轮工具调用上限</span>
            <input
              v-model.number="draft.maxTurnToolCalls"
              class="field-input"
              type="number"
              min="0"
              step="1"
            >
            <span class="field-hint">防工具死循环的兜底(发言/看板读写都计入)。填 0 表示不限。</span>
          </label>

          <label class="field">
            <span class="field-label">权限模式</span>
            <select
              v-model="draft.permissionMode"
              class="field-input"
            >
              <option
                v-for="mode in ROOM_PERMISSION_MODES"
                :key="mode.value"
                :value="mode.value"
              >
                {{ mode.label }}
              </option>
            </select>
            <span class="field-hint">work 会话继承此模式。</span>
          </label>

          <div class="field">
            <button
              type="button"
              class="member-line"
              :class="{ 'is-on': draft.frozen }"
              :aria-pressed="draft.frozen"
              @click="draft.frozen = !draft.frozen"
            >
              <span class="member-name">暂停房间</span>
              <span class="member-title">冻结全部发言与执行</span>
            </button>
          </div>

          <!-- 危险区:清空聊天记录。与上面每一格的区别是它**立刻生效**、不进
               「保存」那一趟 —— 一个不可恢复的动作不该躲在批量保存里,更不该
               在用户按取消时留下已经删掉的东西。 -->
          <div class="field danger-zone">
            <span class="field-label">危险区</span>
            <button
              v-if="!confirmingClear"
              type="button"
              class="member-line is-danger"
              @click="confirmingClear = true"
            >
              <span class="member-name">清空聊天记录</span>
              <span class="member-title">不可恢复</span>
            </button>
            <template v-else>
              <p class="field-hint danger-note">
                这间房的对话会全部删除,每位成员在这间房的会话记忆(以及他们读到哪儿了)
                与看板卡片一并清空;房间设置与成员保留。<strong>不可恢复。</strong>
                <template v-if="hasLiveTurn">
                  将中止正在进行的发言。
                </template>
              </p>
              <!-- pair 私聊房跨群共享(Iris⇄Bram 只有一间),连带清空必须是显式
                   勾选 —— 2026-08-02 真机:狼人杀发牌全在私聊里,只清群房等于
                   没清干净,但默默连带又会误伤别的群的语境。 -->
              <label class="field-hint danger-note danger-opt">
                <input
                  v-model="clearMemberDms"
                  type="checkbox"
                  :disabled="clearing"
                >
                连带清空成员之间的私聊房(私聊房跨群共享,其他群也引用同一间)
              </label>
              <div class="danger-actions">
                <button
                  type="button"
                  class="text-action"
                  :disabled="clearing"
                  @click="confirmingClear = false"
                >
                  取消
                </button>
                <button
                  type="button"
                  class="text-action is-danger"
                  :disabled="clearing"
                  @click="clearHistory"
                >
                  {{ clearing ? '清空中…' : '确认清空' }}
                </button>
              </div>
            </template>
          </div>

          <p
            v-if="error"
            class="dialog-error"
          >
            {{ error }}
          </p>
        </div>

        <div class="dialog-footer">
          <button
            class="text-action"
            type="button"
            @click="close"
          >
            取消
          </button>
          <button
            class="text-action is-primary"
            type="button"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { platformApi } from '@/platform'
import { isActiveAgent, isColleague } from '@shared/ipc'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useSessionsStore } from '@/stores/sessions'
import {
  ROOM_PERMISSION_MODES,
  diffRoomSettings,
  hasRoomSettingsChanges,
  orderRoomSpeakers,
  readRoomSettings,
  validateRoomSettings,
  type RoomSettingsDraft,
} from './room-settings-form'

const props = defineProps<{ visible: boolean; sessionId: string }>()
const emit = defineEmits<{ close: [] }>()

const agentsStore = useAgentsStore()
const collabBoardStore = useCollabBoardStore()
const sessionsStore = useSessionsStore()

const draft = reactive<RoomSettingsDraft>(readRoomSettings(undefined))
let initial: RoomSettingsDraft = readRoomSettings(undefined)
const saving = ref(false)
const error = ref('')
/** 「今日已用 $X.XX」 — blank until the one-shot read lands (or if it fails:
 *  a spend line that cannot be trusted is worse than no line). */
const spentTodayText = ref('')
/** 危险区的二次确认:清空是不可恢复的,一次点击不算数。 */
const confirmingClear = ref(false)
const clearing = ref(false)
const clearMemberDms = ref(false)

const session = computed(() => sessionsStore.sessions.find(item => item.id === props.sessionId))

// The blank default persona is not a room role, and member candidates are a
// social surface (agent-domain-model.md M2): only active colleagues offer
// themselves. But a room that already holds an off-surface member (default
// persona, or an agent since turned service/retired) keeps it visible rather
// than silently losing the member on the next save.
const selectableAgents = computed(() =>
  agentsStore.agents.filter(agent =>
    (isColleague(agent) && isActiveAgent(agent) && !agent.isDefault) ||
    draft.memberAgentIds.includes(agent.id)))
const selectedAgents = computed(() =>
  selectableAgents.value.filter(agent => draft.memberAgentIds.includes(agent.id)))

/**
 * 私聊房(单成员 = 用户 ↔ agent,双成员 = agent ↔ agent)。名册在这张表里只读。
 *
 * 判定读 `room.dm` 标记本身而不是两个人数谓词的并集:这里问的正是"这间房是不是
 * 私聊",与人数无关 —— 将来真有三人 dm,这一格的答案也不该变。
 */
const isDmRoom = computed(() => session.value?.room?.dm === true)

/** 只读名册的显示行:成员表是归属真源,顺序照它。 */
const memberAgents = computed(() =>
  (session.value?.room?.memberAgentIds ?? []).map(id => agentsStore.displayAgent(id)))

/**
 * 有回合在跑吗 —— 确认文案里那句「将中止正在进行的发言」的依据。
 *
 * 拿不到快照(面板还没收到过协调器广播)时按**有**处理:多说一句总比让用户在
 * 不知情的情况下打断一位正在说话的同事好。
 */
const hasLiveTurn = computed(() => {
  const snapshot = collabBoardStore.coordinatorFor(props.sessionId)
  if (!snapshot) return true
  // 「有人在说」这一格与停止按钮读的是**同一个派生**(架构收敛 C4 §1):
  // 从前这里读快照的 `turns`、按钮读 `collab:turn-active` 的事件账,同一个问题
  // 两个答案。排队与判定在飞是这一格额外要提醒的(它们同样会被这次保存打断),
  // 按钮不管那些 —— 那不是"停得掉的东西"。
  return collabBoardStore.isRoomTurnActive(props.sessionId)
    || snapshot.queue.length > 0
    || snapshot.judging > 0
})

watch(() => props.visible, async visible => {
  if (!visible) return
  // 「拿不到快照按有处理」是兜底,不是常态:面板打开时补一次水,那句
  // 「将中止正在进行的发言」就不必在一间安静的房间里也说一遍(C4 §1)。
  collabBoardStore.ensureCoordinator(props.sessionId)
  error.value = ''
  spentTodayText.value = ''
  confirmingClear.value = false
  await agentsStore.loadAgents()
  reset()
  void loadSpentToday()
}, { immediate: true })

/** One shot, no live refresh (W13.5) — the panel is a form, not a dashboard. */
async function loadSpentToday(): Promise<void> {
  try {
    const response = await platformApi.getCollabRoomSpend?.(props.sessionId)
    if (!response?.success || typeof response.spentTodayUSD !== 'number') return
    spentTodayText.value = `今日已用 $${response.spentTodayUSD.toFixed(2)}`
  } catch {
    // A missing number is silence, never an error banner over a settings form.
  }
}

function reset(): void {
  const snapshot = readRoomSettings(session.value)
  // Members whose agent no longer exists cannot be re-saved (the app layer
  // rejects unknown ids) and the coordinator already skips them — drop them.
  snapshot.memberAgentIds = snapshot.memberAgentIds.filter(id =>
    agentsStore.agents.some(agent => agent.id === id))
  if (snapshot.pmAgentId && !snapshot.memberAgentIds.includes(snapshot.pmAgentId)) {
    snapshot.pmAgentId = ''
  }
  initial = { ...snapshot, memberAgentIds: [...snapshot.memberAgentIds] }
  Object.assign(draft, snapshot)
}

function toggleMember(agentId: string): void {
  const index = draft.memberAgentIds.indexOf(agentId)
  if (index >= 0) draft.memberAgentIds.splice(index, 1)
  else draft.memberAgentIds.push(agentId)
  if (draft.pmAgentId && !draft.memberAgentIds.includes(draft.pmAgentId)) draft.pmAgentId = ''
  // 次序表跟着名册走:新来的排到末尾,离开的摘掉。不同步的话,加完人再切到顺序
  // 模式会看到一份缺人的次序 —— 而它恰恰是那个人接下来会不会被叫到的依据。
  draft.speakOrder = orderRoomSpeakers(draft.speakOrder, draft.memberAgentIds)
}

/** 发言次序那一列 —— 次序是真源,头像和名字现查。 */
const orderedSpeakers = computed(() =>
  orderRoomSpeakers(draft.speakOrder, draft.memberAgentIds).map(id => agentsStore.displayAgent(id)))

function moveSpeaker(index: number, delta: number): void {
  const order = orderRoomSpeakers(draft.speakOrder, draft.memberAgentIds)
  const target = index + delta
  if (target < 0 || target >= order.length) return
  const [moved] = order.splice(index, 1)
  order.splice(target, 0, moved)
  draft.speakOrder = order
}

function close(): void {
  emit('close')
}

/**
 * 立刻执行,不进「保存」那一趟。清空成功后直接关掉对话框:留在原地会给人
 * "还有一步要按"的错觉,而这件事已经做完了。
 */
async function clearHistory(): Promise<void> {
  if (clearing.value) return
  clearing.value = true
  error.value = ''
  try {
    // 清空后那一次全量重拉在 action 里(架构收敛 C4 §4):清空动的不是房间配置
    // 而是**转录**,`session:collab-updated` 只带 room 快照盖不住它。
    const response = await sessionsStore.clearCollabRoomHistory(props.sessionId, clearMemberDms.value)
    if (!response?.success) {
      error.value = response?.error || '清空失败'
      return
    }
    close()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    clearing.value = false
    confirmingClear.value = false
  }
}

async function save(): Promise<void> {
  if (saving.value) return
  const invalid = validateRoomSettings(draft)
  if (invalid) {
    error.value = invalid
    return
  }
  const plan = diffRoomSettings(initial, draft)
  if (!hasRoomSettingsChanges(plan)) {
    close()
    return
  }
  saving.value = true
  error.value = ''
  try {
    // Each item goes to the channel that owns it; only changed items are sent
    // (membership posts 群公告, freezing aborts live streams). 三条都走 sessions
    // store 的 action(架构收敛 C4 §4),回填约定写在那里:各自播一条
    // `session:collab-updated`,会话列表就地合并,组件不碰镜像。
    if (plan.roomUpdate) {
      const response = await sessionsStore.updateCollabRoom(props.sessionId, plan.roomUpdate)
      if (!response?.success) {
        error.value = response?.error || '保存失败'
        return
      }
    }
    if (plan.budgets) {
      const response = await sessionsStore.setCollabRoomBudgets(props.sessionId, plan.budgets)
      if (!response?.success) {
        error.value = response?.error || '预算保存失败'
        return
      }
    }
    if (plan.frozen !== undefined) {
      const response = await sessionsStore.setCollabRoomFrozen(props.sessionId, plan.frozen)
      if (!response?.success) {
        error.value = response?.error || '暂停开关保存失败'
        return
      }
    }
    close()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.room-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-toast, 1000);
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 55%, transparent);
}

.room-dialog {
  width: 380px;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--ui-surface-app-bg, var(--bg));
  border: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  border-radius: 8px;
  box-shadow: var(--shadow-paper, 0 12px 32px rgb(0 0 0 / 0.14));
  padding: 16px 18px;
}

.dialog-header h3 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.field-label em {
  font-style: normal;
  opacity: 0.6;
}

.field-input {
  font: inherit;
  font-size: 13px;
  padding: 6px 8px;
  border: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  border-radius: 6px;
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text));
}

.field-hint {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* 痕迹级: a fact the room grew, not a control. Same register as the typing
   line — 11px 墨灰, no box, no colour. */
.spend-line {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-variant-numeric: tabular-nums;
}

/* Hanging-tick register (same language as the agent tool rows) — a member is
   on when its tick thickens, not when a box fills with colour. */
.member-line {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 3px 0 3px 14px;
  appearance: none;
  background: transparent;
  border: none;
  text-align: left;
  font: inherit;
  font-size: 13px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.member-line::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, height 0.12s ease, background-color 0.12s ease;
}

.member-line:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.member-line:hover::before {
  background: var(--ui-text-muted-fg, var(--text-muted));
}

/* 只读名册行:同一条画线,但不是按钮 —— 去掉指针与 hover 提亮,墨色直接给到
   正文档(它陈述的是事实,不是一个"选中"状态)。 */
.member-line.is-static {
  cursor: default;
  color: var(--ui-text-primary-fg, var(--text));
}

.member-line.is-static:hover::before {
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

.member-line.is-on {
  color: var(--ui-text-primary-fg, var(--text));
}

.member-line.is-on::before {
  width: 10px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

.member-line:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 1px;
}

.member-avatar {
  font-size: 15px;
}

/* 发言次序行:借同一条挂线画法,只多两样东西 —— 前面的序号和末尾的升降。
   序号用等宽数字,免得 9→10 时整列跟着抖。 */
.order-index {
  min-width: 1.4em;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.order-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
}

.order-button {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0 4px;
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.order-button:hover:not(:disabled) {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.order-button:disabled {
  opacity: 0.3;
  cursor: default;
}

.order-button:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 1px;
}

.member-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-title {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* 危险区:同一套画线语言,只把墨色换成告警色 —— 不加框、不填色,与整张表
   的register 保持一致(它靠位置和措辞变重,不靠视觉噪声)。 */
.danger-zone {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

.member-line.is-danger {
  color: var(--ui-status-danger-fg, var(--text-error));
}

.member-line.is-danger:hover::before {
  background: var(--ui-status-danger-fg, var(--text-error));
}

.danger-note {
  margin: 0;
}

.danger-note strong {
  font-weight: 600;
  color: var(--ui-status-danger-fg, var(--text-error));
}

.danger-opt {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.danger-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.text-action.is-danger {
  color: var(--ui-status-danger-fg, var(--text-error));
  font-weight: 600;
}

.dialog-error {
  margin: 0;
  font-size: 12px;
  color: var(--ui-status-danger-fg, var(--text-error));
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 14px;
}

.text-action {
  font: inherit;
  font-size: 13px;
  background: none;
  border: none;
  padding: 4px 6px;
  cursor: pointer;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.text-action.is-primary {
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 600;
}

.text-action:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
