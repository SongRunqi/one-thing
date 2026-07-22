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
      aria-haspopup="listbox"
      :aria-expanded="open"
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
      <ComposerExtensionPanel
        floating
        class="agent-flyout"
        :style="menuStyle"
        :visible="open"
        :placement="placement"
        title="Agent"
        :count="agentsStore.agents.length"
        empty-text="No agents"
        empty-hint="Create one in Agents"
        :hints="HINTS"
        @mousedown.stop
        @click.stop
      >
        <div
          ref="listRef"
          class="composer-extension-list agent-list"
          role="listbox"
          aria-label="Agent"
          :aria-activedescendant="activeOptionId"
        >
          <div
            v-for="(agent, index) in agentsStore.agents"
            :id="getOptionId(index)"
            :key="agent.id"
            :class="['composer-extension-row', 'agent-row', { selected: index === highlightedIndex }]"
            :data-agent-index="index"
            role="option"
            :aria-selected="agent.id === currentAgentId"
            :title="getAgentTooltip(agent)"
            @mousedown.prevent
            @click="selectAgent(agent.id)"
            @mouseenter="highlightedIndex = index"
          >
            <!-- The mark says which agent is live, not which row the cursor is
                 on — selection is carried by the row fill, as everywhere else. -->
            <span
              class="composer-extension-row-icon agent-row-mark"
              aria-hidden="true"
            >
              <span
                v-if="agent.id === currentAgentId"
                class="agent-row-mark-dot"
              />
            </span>
            <div class="composer-extension-row-main">
              <div class="composer-extension-row-title">
                {{ agent.name }}
              </div>
              <div class="composer-extension-row-description">
                {{ describeAgent(agent) }}
              </div>
            </div>
            <span
              class="composer-extension-row-meta"
              aria-hidden="true"
            >{{ agent.isDefault ? 'default' : '' }}</span>
            <div
              class="composer-extension-row-kbd"
              aria-hidden="true"
            >
              ⏎
            </div>
          </div>
        </div>

        <ErrorNote
          v-if="selectionError"
          class="agent-error"
          :message="selectionError"
        />
      </ComposerExtensionPanel>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ComposerExtensionPanel from './ComposerExtensionPanel.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const listRef = ref<HTMLElement | null>(null)
const open = ref(false)
const selectionError = ref('')
const menuStyle = ref<Record<string, string>>({})
const placement = ref<'up' | 'down'>('down')
const highlightedIndex = ref(0)

const HINTS = ['↑↓ move', '⏎ switch', 'esc dismiss']

const MENU_WIDTH = 372
const MENU_MARGIN = 8
const MENU_GAP = 8
/** Below this much room the panel flips above the chip instead. */
const MENU_MIN_ROOM = 280

const session = computed(() =>
  sessionsStore.getSessionItem(props.sessionId) || null
)
const currentAgentId = computed(() => session.value?.agentId || DEFAULT_AGENT_ID)
const currentAgent = computed(() => agentsStore.getAgent(currentAgentId.value))
const isDisabled = computed(() => !!props.sessionId && chatStore.isSessionGenerating(props.sessionId))

const activeOptionId = computed(() =>
  agentsStore.agents[highlightedIndex.value] ? getOptionId(highlightedIndex.value) : undefined
)

function getOptionId(index: number) {
  return `agent-option-${index}`
}

/** The row's description slot: the system prompt's opening line, which is the
 *  shortest true thing about an agent. The default agent has none. */
function describeAgent(agent: { systemPrompt?: string, isDefault?: boolean }) {
  const prompt = agent.systemPrompt?.trim()
  if (!prompt) return agent.isDefault ? 'No extra system prompt' : ''
  return prompt.split('\n').find(line => line.trim())?.trim() || ''
}

function getAgentTooltip(agent: { name: string, systemPrompt?: string }) {
  const prompt = agent.systemPrompt?.trim()
  return prompt ? `${agent.name}\n${prompt}` : agent.name
}

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
  const openAbove = below < MENU_MIN_ROOM && above > below
  placement.value = openAbove ? 'up' : 'down'

  menuStyle.value = {
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    ...(openAbove
      ? { bottom: `${Math.round(window.innerHeight - rect.top + MENU_GAP)}px`, top: 'auto' }
      : { top: `${Math.round(rect.bottom + MENU_GAP)}px`, bottom: 'auto' }),
  }
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Element | null
  if (rootRef.value?.contains(target as Node)) return
  if (target?.closest?.('.agent-flyout')) return
  close()
}

function moveHighlight(delta: number) {
  const total = agentsStore.agents.length
  if (!total) return
  highlightedIndex.value = (highlightedIndex.value + delta + total) % total
  void nextTick(scrollHighlightIntoView)
}

function scrollHighlightIntoView() {
  listRef.value
    ?.querySelector<HTMLElement>(`[data-agent-index="${highlightedIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function handleKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveHighlight(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveHighlight(-1)
    return
  }
  if (event.key === 'Enter') {
    const agent = agentsStore.agents[highlightedIndex.value]
    if (!agent) return
    event.preventDefault()
    void selectAgent(agent.id)
  }
}

async function openMenu() {
  open.value = true
  selectionError.value = ''
  const current = agentsStore.agents.findIndex(agent => agent.id === currentAgentId.value)
  highlightedIndex.value = current >= 0 ? current : 0
  await nextTick()
  updateMenuPosition()
  scrollHighlightIntoView()
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

/* A stream starting mid-selection locks the agent — the menu should not linger
   over a choice that can no longer be made. */
watch(isDisabled, disabled => {
  if (disabled) close()
})

onMounted(() => {
  void agentsStore.loadAgents()
  document.addEventListener('click', handleDocumentClick)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
})
</script>

<style scoped>
.agent-selector {
  --agent-selector-accent: var(--ui-category-3-icon, var(--ui-status-success-fg, var(--color-success, var(--ui-accent-primary-fg, var(--accent)))));
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

/* The menu is the composer's picker shell, teleported to the header. Nothing
   here restyles a row — the frame, the tab stop and the ⏎ all come from
   ComposerExtensionPanel, so an agent row reads exactly like a command row. */
.agent-flyout {
  z-index: 1200;
  -webkit-app-region: no-drag;
}

/* Slot one carries the live agent, not the cursor: a filled square in the
   accent, the only ink in the list that isn't text. */
.agent-row-mark-dot {
  width: 6px;
  height: 6px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

/* positioning only — visuals come from ErrorNote */
.agent-error {
  margin: 8px 12px 2px;
}
</style>
