<template>
  <Dialog
    :open="visible"
    title="新建群聊"
    :width="380"
    variant="paper"
    dividers="header"
    @update:open="value => { if (!value) emit('close') }"
  >
    <div class="room-form">
      <label class="field">
        <span class="field-label">房间名</span>
        <input
          v-model="name"
          class="field-input"
          type="text"
          placeholder="例如:官网改版项目组"
          @keydown.enter="create"
        >
      </label>

      <div class="field field-members">
        <span class="field-label">成员</span>
        <p
          v-if="selectableAgents.length === 0"
          class="field-hint"
        >
          还没有可用的 Agent——先在「Agents」面板创建几个角色(如产品经理、工程师)。
        </p>
        <Checkbox
          v-for="agent in selectableAgents"
          :key="agent.id"
          class="member-row"
          :model-value="memberIds.includes(agent.id)"
          @update:model-value="toggleMember(agent.id)"
        >
          <span class="member-line">
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
          </span>
        </Checkbox>
      </div>

      <div class="field">
        <span class="field-label">负责人(PM) <em>可选</em></span>
        <Select
          v-model="pmAgentId"
          variant="underline"
          size="small"
          teleported
          fit-input-width
          z-layer="modal"
          :options="pmOptions"
          aria-label="负责人"
        />
        <span class="field-hint">负责评审与任务分派;群聊中更倾向主动接话(不再是唯一应答人)。</span>
      </div>

      <label class="field">
        <span class="field-label">日预算(美元)</span>
        <input
          v-model.number="dailyBudget"
          class="field-input"
          type="number"
          min="0"
          step="0.5"
        >
        <span class="field-hint">按真实 API 花费计;填 0 表示不限额。默认 $5/天。</span>
      </label>

      <p
        v-if="error"
        class="room-error"
      >
        {{ error }}
      </p>
    </div>

    <template #actions>
      <button
        class="app-dialog-text-btn"
        type="button"
        @click="emit('close')"
      >
        取消
      </button>
      <button
        class="app-dialog-text-btn is-primary"
        type="button"
        :disabled="creating || !canCreate"
        @click="create"
      >
        {{ creating ? '创建中…' : '创建' }}
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import Checkbox from '@/components/common/Checkbox.vue'
import Dialog from '@/components/common/Dialog.vue'
import Select from '@/components/common/Select.vue'
import type { SelectOptionLike } from '@/components/common/select'
import { useAgentsStore } from '@/stores/agents'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

// No `--app-dialog-*` overrides on purpose: the room sheets are settings-area
// forms, so they take `variant="paper"`'s own metrics (square corners, hairline
// frame, serif title over a header rule) exactly like `settings/mcp/
// MCPServerDialog`. The 8px-radius card the two dialogs used to hand-roll was
// the one thing keeping them in a different visual language.

const agentsStore = useAgentsStore()
const sessionsStore = useSessionsStore()
const workspaceStore = useWorkspaceStore()

const name = ref('')
const memberIds = ref<string[]>([])
const pmAgentId = ref('')
const dailyBudget = ref(5)
const creating = ref(false)
const error = ref('')

// The default agent is a blank persona — rooms are about distinct roles.
// Member candidates are a social surface (agent-domain-model.md M2): only
// active colleagues — service agents (radio-dj) never appear here.
const selectableAgents = computed(() =>
  agentsStore.colleagues.filter(agent => !agent.isDefault))
const selectedAgents = computed(() =>
  selectableAgents.value.filter(agent => memberIds.value.includes(agent.id)))
const canCreate = computed(() =>
  name.value.trim().length > 0 && memberIds.value.length > 0)
const pmOptions = computed<SelectOptionLike[]>(() => [
  { value: '', label: '无' },
  ...selectedAgents.value.map(agent => ({
    value: agent.id,
    label: `${agent.name}${agent.title ? ` · ${agent.title}` : ''}`,
  })),
])

watch(() => props.visible, visible => {
  if (!visible) return
  error.value = ''
  void agentsStore.loadAgents()
})

watch(selectedAgents, agents => {
  if (pmAgentId.value && !agents.some(agent => agent.id === pmAgentId.value)) {
    pmAgentId.value = ''
  }
})

function toggleMember(agentId: string): void {
  const index = memberIds.value.indexOf(agentId)
  if (index >= 0) memberIds.value.splice(index, 1)
  else memberIds.value.push(agentId)
}

async function create(): Promise<void> {
  if (!canCreate.value || creating.value) return
  creating.value = true
  error.value = ''
  try {
    const budget = Number.isFinite(dailyBudget.value) && dailyBudget.value >= 0 ? dailyBudget.value : 5
    // 建房后那一次全量重拉在 action 里(架构收敛 C4 §4):`session:collab-updated`
    // 是"改一行",而这里要的是"加一行" —— 刚出生的房还不在列表里,下一句
    // `openSession` 就要它在。契约因此从"组件记得刷"变成"action 保证可见"。
    const response = await sessionsStore.createCollabRoom(name.value.trim(), {
      memberAgentIds: [...memberIds.value],
      ...(pmAgentId.value ? { pmAgentId: pmAgentId.value } : {}),
      budgets: { dailyCostUSD: budget },
    })
    if (!response.success || !response.session) {
      error.value = response.error || '创建失败'
      return
    }
    workspaceStore.openSession(response.session.id)
    name.value = ''
    memberIds.value = []
    pmAgentId.value = ''
    emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
/* Overlay / panel / shadow / header rule are Dialog's (variant="paper"); only
   the content inside the slots is styled here, in the settings-area ledger
   language — 11px spaced labels over underline controls, same recipe as
   `settings/mcp/MCPServerDialog`. */
.room-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.field-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg);
}

.field-label em {
  font-style: normal;
  opacity: 0.6;
}

/* Underline controls: the line is the control (ui-system.md §设置区画线风). */
.field-input {
  width: 100%;
  min-width: 0;
  appearance: none;
  font: inherit;
  font-size: 13px;
  padding: 4px 0 5px;
  border: none;
  border-bottom: 1px solid var(--ui-border-default-border);
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-primary-fg);
  transition: border-color var(--duration-fast) var(--ease-default);
}

/* Element-qualified so the underline reads as a caret surface, not a box. */
input.field-input:focus {
  outline: none;
  border-bottom-color: var(--ui-accent-primary-fg);
  box-shadow: none;
}

.field-input::placeholder {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

/* P3: the PM picker is `<Select variant="underline">`. The hand-drawn chevron
   that used to live here (a data-URI copy of SettingsPage's `:deep(select)`
   glyph, repeated because a teleported dialog is outside that subtree) went
   with the native `<select>` — Select ships its own. It also needs
   `z-layer="modal"`: the default dropdown+20 is 120 and this dialog sits at
   600 (ui-system.md §3). */

.field-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

/* The roster is the only unbounded repeater in this sheet: without a cap the
   panel grows with the number of colleagues until it hits Dialog's max-height and
   fills the window. Scrolling the LIST instead keeps the name field, the budget
   field and the footer on screen no matter how many agents exist. */
.field-members {
  min-height: 0;
  max-height: 34vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* `.member-row` is a `Checkbox` root — the class lands on someone else's
   component, so it only ever sets layout (ui-system.md §1: never contest paint
   properties from out there). The row's content lives in the default slot and
   therefore still resolves in this file's scope. */
.member-row {
  align-items: center;
  padding: 4px 2px;
  font-size: 13px;
}

.member-line {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
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
  color: var(--ui-text-muted-fg);
  font-size: 12px;
}

.room-error {
  margin: 0;
  font-size: 12px;
  color: var(--ui-status-danger-fg);
}

/* Footer buttons are `.app-dialog-text-btn` — the mono text button published by
   Dialog.vue's non-scoped block. A scoped `.text-action` used to live here; it
   was a second spelling of the same recipe, one that drifted (13px sans, bold
   primary) from every other paper dialog's footer. */
</style>
