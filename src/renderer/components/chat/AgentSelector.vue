<template>
  <div
    ref="rootRef"
    class="agent-selector"
  >
    <button
      ref="chipRef"
      class="agent-chip"
      type="button"
      :disabled="isDisabled"
      :title="isDisabled ? 'Agent can be changed after the current response finishes' : 'Change agent for this chat'"
      @click.stop="toggleOpen"
    >
      <Bot :size="14" />
      <span>{{ currentAgent?.name || 'Default Agent' }}</span>
      <ChevronDown :size="13" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="agent-menu"
        :style="menuStyle"
        @click.stop
      >
        <div class="agent-list">
          <button
            v-for="agent in agentsStore.agents"
            :key="agent.id"
            :class="['agent-row', { active: agent.id === currentAgentId }]"
            type="button"
            :title="agent.name"
            @click="selectAgent(agent.id)"
          >
            <span class="agent-row-main">
              <span class="agent-row-name">{{ agent.name }}</span>
              <span
                v-if="agent.systemPrompt"
                class="agent-row-prompt"
              >
                {{ agent.systemPrompt }}
              </span>
            </span>
            <span class="agent-row-side">
              <span
                v-if="agent.isDefault"
                class="agent-row-meta"
              >Default</span>
              <Check
                v-if="agent.id === currentAgentId"
                :size="14"
                :stroke-width="2.2"
              />
            </span>
          </button>
        </div>

        <p
          v-if="selectionError"
          class="agent-error"
        >
          {{ selectionError }}
        </p>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Bot, Check, ChevronDown } from 'lucide-vue-next'
import { useAgentsStore, DEFAULT_AGENT_ID } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'

const props = defineProps<{
  sessionId?: string
}>()

const agentsStore = useAgentsStore()
const chatStore = useChatStore()
const sessionsStore = useSessionsStore()

const rootRef = ref<HTMLElement | null>(null)
const chipRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const open = ref(false)
const selectionError = ref('')
const menuStyle = ref<Record<string, string>>({})

const MENU_WIDTH = 340
const MENU_MARGIN = 8
const MENU_GAP = 8

const session = computed(() =>
  sessionsStore.getSessionItem(props.sessionId) || null
)
const currentAgentId = computed(() => session.value?.agentId || DEFAULT_AGENT_ID)
const currentAgent = computed(() => agentsStore.getAgent(currentAgentId.value))
const isDisabled = computed(() => !!props.sessionId && chatStore.isSessionGenerating(props.sessionId))

function close() {
  open.value = false
  selectionError.value = ''
}

function updateMenuPosition() {
  if (!open.value) return
  const chip = chipRef.value
  if (!chip) return

  const rect = chip.getBoundingClientRect()
  const width = Math.min(MENU_WIDTH, Math.max(240, window.innerWidth - MENU_MARGIN * 2))
  let left = rect.left
  if (left + width > window.innerWidth - MENU_MARGIN) {
    left = window.innerWidth - width - MENU_MARGIN
  }
  left = Math.max(MENU_MARGIN, left)

  const below = window.innerHeight - rect.bottom - MENU_GAP - MENU_MARGIN
  const above = rect.top - MENU_GAP - MENU_MARGIN
  const openAbove = below < 280 && above > below
  const maxHeight = Math.max(180, Math.min(520, openAbove ? above : below))

  menuStyle.value = {
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
    ...(openAbove
      ? { bottom: `${Math.round(window.innerHeight - rect.top + MENU_GAP)}px`, top: 'auto' }
      : { top: `${Math.round(rect.bottom + MENU_GAP)}px`, bottom: 'auto' }),
  }
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node
  if (!rootRef.value?.contains(target) && !menuRef.value?.contains(target)) {
    close()
  }
}

async function openMenu() {
  open.value = true
  selectionError.value = ''
  await nextTick()
  updateMenuPosition()
}

function toggleOpen() {
  if (isDisabled.value) return
  if (open.value) {
    close()
    return
  }
  void openMenu()
}

async function selectAgent(agentId: string) {
  if (!props.sessionId || agentId === currentAgentId.value) {
    open.value = false
    return
  }
  const response = await sessionsStore.updateSessionAgent(props.sessionId, agentId)
  if (!response.success) {
    selectionError.value = response.error || 'Failed to switch agent'
    return
  }
  open.value = false
}

onMounted(() => {
  void agentsStore.loadAgents()
  document.addEventListener('click', handleDocumentClick)
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
})
</script>

<style scoped>
.agent-selector {
  position: relative;
  flex: 0 0 auto;
  align-self: center;
  -webkit-app-region: no-drag;
}

.agent-chip {
  height: 28px;
  max-width: clamp(150px, 26vw, 260px);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 70%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 42%, transparent);
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  cursor: pointer;
}

.agent-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-chip:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-border-default-border, var(--border));
}

.agent-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.agent-menu {
  position: fixed;
  box-sizing: border-box;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-floating-bg, var(--bg-floating, var(--bg-panel)));
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  z-index: 1200;
  -webkit-app-region: no-drag;
}

.agent-list {
  display: grid;
  gap: 4px;
}

.agent-row,
.agent-row-side {
  display: flex;
  align-items: center;
}

.agent-row {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
}

.agent-row {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-radius: 7px;
  text-align: left;
}

.agent-row:hover,
.agent-row.active {
  background: var(--ui-state-hover-bg, var(--bg-hover));
  border-color: var(--ui-border-subtle-border, var(--border-subtle));
}

.agent-row-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.agent-row-name {
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.25;
}

.agent-row-prompt {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.agent-row-side {
  flex: 0 0 auto;
  gap: 7px;
  padding-top: 1px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.agent-row-meta {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.agent-error {
  margin: 8px 2px 0;
  color: var(--ui-status-danger-fg, var(--error, #ef4444));
  font-size: 12px;
}
</style>
