<template>
  <div
    ref="rootRef"
    class="agent-selector"
  >
    <Button
      ref="chipRef"
      unstyled
      class="agent-chip"
      :class="{ open }"
      native-type="button"
      :disabled="isDisabled"
      :title="isDisabled ? 'Agent can be changed after the current response finishes' : 'Change agent for this chat'"
      @click.stop="toggleOpen"
    >
      <Bot
        class="agent-chip-icon"
        :size="14"
        :stroke-width="2"
      />
      <span>{{ currentAgent?.name || 'Default Agent' }}</span>
      <ChevronDown
        class="agent-chip-chevron"
        :size="13"
      />
    </Button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="agent-menu"
        :style="menuStyle"
        @click.stop
      >
        <div class="agent-list">
          <Button
            v-for="agent in agentsStore.agents"
            :key="agent.id"
            unstyled
            :class="['agent-row', { active: agent.id === currentAgentId }]"
            native-type="button"
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
                class="agent-row-check"
                :size="14"
                :stroke-width="2.2"
              />
            </span>
          </Button>
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
import Button from '@/components/common/Button.vue'
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
  --agent-selector-accent: var(--ui-category-3-icon, var(--ui-status-success-fg, var(--color-success, var(--ui-accent-primary-fg, var(--accent)))));
  --agent-selector-hover-bg: color-mix(in srgb, var(--agent-selector-accent) 10%, transparent);
  --agent-selector-selected-bg: color-mix(in srgb, var(--agent-selector-accent) 13%, transparent);
  --agent-selector-hover-border: color-mix(in srgb, var(--agent-selector-accent) 24%, transparent);
  --agent-selector-selected-border: color-mix(in srgb, var(--agent-selector-accent) 32%, transparent);
  position: relative;
  flex: 0 0 auto;
  align-self: center;
  -webkit-app-region: no-drag;
}

.agent-chip {
  --app-button-fill: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 42%, transparent);
  --app-button-hover-fill: var(--agent-selector-hover-bg);
  --app-button-border: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 70%, transparent);
  --app-button-hover-border: var(--agent-selector-hover-border);
  --app-button-hover-fg: var(--ui-text-secondary-fg, var(--ui-sidebar-item-hover-fg, var(--text-sidebar-item)));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;
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
  transition:
    background 0.25s cubic-bezier(0.25, 0.8, 0.25, 1),
    border-color 0.25s cubic-bezier(0.25, 0.8, 0.25, 1),
    color 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.agent-chip-icon {
  flex: 0 0 auto;
  color: var(--agent-selector-accent);
  opacity: 0.9;
  transition:
    color 0.25s ease,
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.agent-chip-chevron {
  flex: 0 0 auto;
  color: currentColor;
  opacity: 0.78;
  transition:
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.agent-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-chip:hover:not(:disabled) {
  background: var(--agent-selector-hover-bg);
  color: var(--ui-text-secondary-fg, var(--ui-sidebar-item-hover-fg, var(--text-sidebar-item)));
  border-color: var(--agent-selector-hover-border);
}

.agent-chip.open {
  --app-button-fill: var(--agent-selector-selected-bg);
  --app-button-hover-fill: var(--agent-selector-selected-bg);
  --app-button-border: var(--agent-selector-selected-border);
  --app-button-hover-border: var(--agent-selector-selected-border);
  background: var(--agent-selector-selected-bg);
  border-color: var(--agent-selector-selected-border);
  color: var(--ui-text-secondary-fg, var(--ui-sidebar-item-active-fg, var(--text-sidebar-item)));
}

.agent-chip:hover:not(:disabled) .agent-chip-icon,
.agent-chip.open .agent-chip-icon {
  color: var(--agent-selector-accent);
  opacity: 1;
  transform: scale(1.1);
}

.agent-chip.open .agent-chip-chevron {
  opacity: 1;
  transform: rotate(180deg);
}

.agent-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.agent-menu {
  --agent-selector-accent: var(--ui-category-3-icon, var(--ui-status-success-fg, var(--color-success, var(--ui-accent-primary-fg, var(--accent)))));
  --agent-selector-hover-bg: color-mix(in srgb, var(--agent-selector-accent) 10%, transparent);
  --agent-selector-selected-bg: color-mix(in srgb, var(--agent-selector-accent) 13%, transparent);
  --agent-selector-hover-border: color-mix(in srgb, var(--agent-selector-accent) 24%, transparent);
  --agent-selector-selected-border: color-mix(in srgb, var(--agent-selector-accent) 32%, transparent);
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

.agent-menu .agent-row {
  --app-button-fill: transparent;
  --app-button-hover-fill: var(--agent-selector-hover-bg);
  --app-button-border: transparent;
  --app-button-hover-border: var(--agent-selector-hover-border);
  --app-button-hover-fg: var(--ui-text-secondary-fg, var(--ui-sidebar-item-hover-fg, var(--text-sidebar-item)));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text-secondary-fg, var(--ui-sidebar-item-fg, var(--text-sidebar-item)));
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

.agent-menu .agent-row:hover,
.agent-menu .agent-row.app-button.is-unstyled:hover {
  --app-button-hover-fill: var(--agent-selector-hover-bg);
  --app-button-hover-border: var(--agent-selector-hover-border);
  background: var(--agent-selector-hover-bg);
  border-color: var(--agent-selector-hover-border);
  color: var(--ui-text-secondary-fg, var(--ui-sidebar-item-hover-fg, var(--text-sidebar-item)));
}

.agent-menu .agent-row.active,
.agent-menu .agent-row.app-button.is-unstyled.active {
  --app-button-fill: var(--agent-selector-selected-bg);
  --app-button-hover-fill: var(--agent-selector-selected-bg);
  --app-button-border: var(--agent-selector-selected-border);
  --app-button-hover-border: var(--agent-selector-selected-border);
  background: var(--agent-selector-selected-bg);
  border-color: var(--agent-selector-selected-border);
  color: var(--ui-text-secondary-fg, var(--ui-sidebar-item-active-fg, var(--text-sidebar-item)));
  font-weight: 600;
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

.agent-row.active .agent-row-side,
.agent-row.active .agent-row-check {
  color: var(--agent-selector-accent);
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
.agent-menu .agent-row.active:hover,
.agent-menu .agent-row.app-button.is-unstyled.active:hover {
  --app-button-hover-fill: var(--agent-selector-selected-bg);
  --app-button-hover-border: var(--agent-selector-selected-border);
  background: var(--agent-selector-selected-bg);
  border-color: var(--agent-selector-selected-border);
}
