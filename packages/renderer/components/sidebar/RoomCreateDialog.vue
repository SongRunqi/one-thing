<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="room-dialog-overlay"
      @click.self="emit('close')"
    >
      <div
        class="room-dialog"
        role="dialog"
        aria-label="新建群聊"
      >
        <div class="dialog-header">
          <h3>新建群聊</h3>
        </div>

        <div class="dialog-body">
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

          <div class="field">
            <span class="field-label">成员</span>
            <p
              v-if="selectableAgents.length === 0"
              class="field-hint"
            >
              还没有可用的 Agent——先在「Agents」面板创建几个角色(如产品经理、工程师)。
            </p>
            <label
              v-for="agent in selectableAgents"
              :key="agent.id"
              class="member-row"
            >
              <input
                type="checkbox"
                :checked="memberIds.includes(agent.id)"
                @change="toggleMember(agent.id)"
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
            </label>
          </div>

          <label class="field">
            <span class="field-label">负责人(PM) <em>可选</em></span>
            <select
              v-model="pmAgentId"
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
            class="dialog-error"
          >
            {{ error }}
          </p>
        </div>

        <div class="dialog-footer">
          <button
            class="text-action"
            type="button"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            class="text-action is-primary"
            type="button"
            :disabled="creating || !canCreate"
            @click="create"
          >
            {{ creating ? '创建中…' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { platformApi } from '@/platform'
import { useAgentsStore } from '@/stores/agents'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

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
    const response = await platformApi.createSession(name.value.trim(), {
      kind: 'room',
      room: {
        memberAgentIds: [...memberIds.value],
        ...(pmAgentId.value ? { pmAgentId: pmAgentId.value } : {}),
        budgets: { dailyCostUSD: budget },
      },
    })
    if (!response.success || !response.session) {
      error.value = response.error || '创建失败'
      return
    }
    // 这一处**留着**(架构收敛 C4 §3):`session:collab-updated` 是"改一行",
    // 而这里要的是"加一行" —— 刚出生的房还不在列表里,`openSession` 下一行就
    // 要它在。事件驱动的补拉是异步的,盖不住这个同一拍的顺序要求。
    await sessionsStore.loadSessions()
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

.member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
  font-size: 13px;
  cursor: pointer;
}

.member-avatar {
  font-size: 15px;
}

.member-title {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
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
