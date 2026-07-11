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
            <span
              class="agent-row-dot"
              aria-hidden="true"
            />
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
import { Bot, ChevronDown } from 'lucide-vue-next'
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

/* 座标底线(案 A):裸文字落在 header 基线上,无胶囊无底色。
   悬停浮现点线段,展开描实 —— 与页签同一句法。 */
.agent-chip {
  --app-button-fill: transparent;
  --app-button-hover-fill: transparent;
  --app-button-border: transparent;
  --app-button-hover-border: transparent;
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;
  position: relative;
  height: 28px;
  max-width: clamp(150px, 26vw, 260px);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s ease;
}

/* 底部墨段:落在 40px 栏的基线上(28px 控件下方留 6px) */
.agent-chip::after {
  content: "";
  position: absolute;
  right: 6px;
  bottom: -6px;
  left: 6px;
  height: 0;
  border-bottom: 1.5px dotted transparent;
  transition: border-color 0.2s ease;
  pointer-events: none;
}

.agent-chip:hover:not(:disabled)::after {
  border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 75%, transparent);
}

.agent-chip.open::after {
  border-bottom-style: solid;
  border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 90%, transparent);
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
  color: var(--ui-text-primary-fg, var(--text));
}

.agent-chip.open {
  color: var(--ui-text-primary-fg, var(--text));
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
  padding: 6px 12px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 0;
  background: var(--ui-surface-floating-bg, var(--bg-floating, var(--bg-panel)));
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  z-index: 1200;
  -webkit-app-region: no-drag;
}

/* 书目目录页:行与行之间一道极淡点线,无底色无圆角。
   行首圈点:hover 空心浮现,当前填实朱砂 —— 与 side panel 节头同记号。 */
.agent-list {
  display: grid;
}

.agent-row,
.agent-row-side {
  display: flex;
  align-items: center;
}

.agent-menu .agent-row {
  --app-button-fill: transparent;
  --app-button-hover-fill: transparent;
  --app-button-border: transparent;
  --app-button-hover-border: transparent;
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;
  border: 0;
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
  gap: 9px;
  padding: 8px 2px;
  border-radius: 0;
  text-align: left;
}

.agent-row + .agent-row {
  border-top: 1px dotted color-mix(in srgb, var(--ui-border-default-border, var(--border)) 62%, transparent);
}

.agent-row-dot {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border: 1.5px solid var(--ui-accent-primary-fg, var(--accent));
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.agent-menu .agent-row:hover,
.agent-menu .agent-row.app-button.is-unstyled:hover {
  background: transparent;
  border-color: transparent;
  color: var(--ui-text-primary-fg, var(--text));
}

.agent-row:hover .agent-row-dot {
  opacity: 0.45;
}

.agent-menu .agent-row.active,
.agent-menu .agent-row.app-button.is-unstyled.active {
  background: transparent;
  border-color: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 600;
}

.agent-row.active .agent-row-dot {
  background: var(--ui-accent-primary-fg, var(--accent));
  opacity: 1;
}

.agent-row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.agent-row-name {
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.25;
}

.agent-row.active .agent-row-name {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.agent-row-prompt {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 400;
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
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-error {
  margin: 8px 2px 2px;
  padding-left: 9px;
  border-left: 2px solid var(--ui-status-danger-fg, var(--error, #ef4444));
  color: var(--ui-status-danger-fg, var(--error, #ef4444));
  font-size: 12px;
}
</style>
