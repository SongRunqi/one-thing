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
import { useSessionsStore } from '@/stores/sessions'
import {
  ROOM_PERMISSION_MODES,
  diffRoomSettings,
  hasRoomSettingsChanges,
  readRoomSettings,
  validateRoomSettings,
  type RoomSettingsDraft,
} from './room-settings-form'

const props = defineProps<{ visible: boolean; sessionId: string }>()
const emit = defineEmits<{ close: [] }>()

const agentsStore = useAgentsStore()
const sessionsStore = useSessionsStore()

const draft = reactive<RoomSettingsDraft>(readRoomSettings(undefined))
let initial: RoomSettingsDraft = readRoomSettings(undefined)
const saving = ref(false)
const error = ref('')
/** 「今日已用 $X.XX」 — blank until the one-shot read lands (or if it fails:
 *  a spend line that cannot be trusted is worse than no line). */
const spentTodayText = ref('')

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

watch(() => props.visible, async visible => {
  if (!visible) return
  error.value = ''
  spentTodayText.value = ''
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
}

function close(): void {
  emit('close')
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
    // (membership posts 群公告, freezing aborts live streams).
    if (plan.roomUpdate) {
      const response = await platformApi.updateCollabRoom(props.sessionId, plan.roomUpdate)
      if (!response?.success) {
        error.value = response?.error || '保存失败'
        return
      }
    }
    if (plan.budgets) {
      const response = await platformApi.setCollabRoomBudgets(props.sessionId, plan.budgets)
      if (!response?.success) {
        error.value = response?.error || '预算保存失败'
        return
      }
    }
    if (plan.frozen !== undefined) {
      const response = await platformApi.setCollabRoomFrozen(props.sessionId, plan.frozen)
      if (!response?.success) {
        error.value = response?.error || '暂停开关保存失败'
        return
      }
    }
    await sessionsStore.loadSessions()
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
