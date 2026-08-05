<template>
  <div
    ref="rootRef"
    class="agent-selector"
  >
    <Tooltip :text="isDisabled ? 'Agent can be changed after the current response finishes' : 'Change agent for this chat'">
      <Button
        ref="chipRef"
        unstyled
        class="agent-chip"
        :class="{ open }"
        native-type="button"
        :disabled="isDisabled"
        aria-haspopup="listbox"
        :aria-expanded="open"
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
    </Tooltip>

    <!-- The kernel only *asks* to close (outside click); this component owns the
         flag. Without the handler the flyout would hide while `open` stayed
         true, and the next chip click would toggle it to false — a dead tap. -->
    <Popover
      :open="open"
      v-bind="flyoutPopover"
      @update:open="value => value || close()"
    >
      <ComposerExtensionPanel
        floating
        class="agent-flyout"
        title="Agent"
        :visible="open"
        :placement="placement"
        :count="selectableAgents.length"
        empty-text="No agents"
        empty-hint="Create one in Agents"
        :hints="HINTS"
      >
        <div
          ref="listRef"
          class="composer-extension-list agent-list"
          role="listbox"
          aria-label="Agent"
          :aria-activedescendant="activeOptionId"
        >
          <div
            v-for="(agent, index) in selectableAgents"
            :id="getOptionId(index)"
            :key="agent.id"
            :class="['composer-extension-row', 'agent-row', { selected: index === highlightedIndex }]"
            :data-agent-index="index"
            role="option"
            :aria-selected="agent.id === currentAgentId"
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
    </Popover>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ComposerExtensionPanel from './ComposerExtensionPanel.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Popover from '@/components/common/Popover.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import type { ComputedPosition } from '@/composables/floating/compute-position'
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
const placement = ref<'up' | 'down'>('down')
const highlightedIndex = ref(0)
const viewportWidth = ref(typeof window === 'undefined' ? 1024 : window.innerWidth)

const HINTS = ['↑↓ move', '⏎ switch', 'esc dismiss']

const MENU_WIDTH = 372
const MENU_MARGIN = 8
const MENU_GAP = 8

/**
 * Positioning, viewport clamping, flipping and outside-click all come from the
 * floating kernel now (P1). What stays local is the *width* — the panel is a
 * fixed-width picker, and the kernel measures whatever box it is handed.
 */
const menuWidth = computed(() =>
  Math.min(MENU_WIDTH, Math.max(240, viewportWidth.value - MENU_MARGIN * 2)),
)

const flyoutPopover = computed(() => ({
  anchor: chipRef.value,
  placement: 'bottom-start' as const,
  offset: MENU_GAP,
  margin: MENU_MARGIN,
  width: menuWidth.value,
  // The panel draws its own notched frame; a second surface under it would
  // double the border and the shadow.
  surface: false,
  // 复合器浮层三兄弟的最上一层:ComposerExtensionPanel +1 / InputBox +2 / 本层 +3。
  zOffset: 3,
  // Esc and the arrows are handled by this component's own key handler.
  closeOn: { esc: false, outside: true, scroll: false },
  onPositioned: onFlyoutPositioned,
}))

/** Fires on every (re)placement — open, scroll, resize, content resize. */
function onFlyoutPositioned(position: ComputedPosition): void {
  viewportWidth.value = window.innerWidth
  // The panel grows out of its trigger, so it needs to know which way it went.
  placement.value = position.side === 'top' ? 'up' : 'down'
}

const session = computed(() =>
  sessionsStore.getSessionItem(props.sessionId) || null
)
const currentAgentId = computed(() => session.value?.agentId || DEFAULT_AGENT_ID)
// 功能兜底,不是署名(域模型 M4):chip 显示的是「这条会话现在跑谁的人格」,
// 无 agentId / 查无此人时跑的确实是 default。署名/头像类走 displayAgent。
const currentAgent = computed(() => agentsStore.getAgent(currentAgentId.value))
const isDisabled = computed(() => !!props.sessionId && chatStore.isSessionGenerating(props.sessionId))

// Social surface (agent-domain-model.md M2): only active colleagues are
// switch targets — service agents (radio-dj) and retired ones never list here.
// The management panel (AgentsPanelContent) keeps showing everything.
const selectableAgents = computed(() => agentsStore.colleagues)

const activeOptionId = computed(() =>
  selectableAgents.value[highlightedIndex.value] ? getOptionId(highlightedIndex.value) : undefined
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

function close() {
  open.value = false
  selectionError.value = ''
}

function moveHighlight(delta: number) {
  const total = selectableAgents.value.length
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
    const agent = selectableAgents.value[highlightedIndex.value]
    if (!agent) return
    event.preventDefault()
    void selectAgent(agent.id)
  }
}

async function openMenu() {
  open.value = true
  selectionError.value = ''
  const current = selectableAgents.value.findIndex(agent => agent.id === currentAgentId.value)
  highlightedIndex.value = current >= 0 ? current : 0
  await nextTick()
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
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.agent-selector {
  --agent-selector-accent: var(--ui-category-3-icon, var(--ui-status-success-fg));
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
  --app-button-hover-fg: var(--ui-text-primary-fg);
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
  color: var(--ui-text-muted-fg);
  font-size: 12px;
  cursor: pointer;
  transition: color var(--duration-normal) var(--ease-default);
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
  transition: border-color var(--duration-normal) var(--ease-default);
  pointer-events: none;
}

.agent-chip:hover:not(:disabled)::after {
  border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg) 75%, transparent);
}

.agent-chip.open::after {
  border-bottom-style: solid;
  border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg) 90%, transparent);
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
  color: var(--ui-text-primary-fg);
}

.agent-chip.open {
  color: var(--ui-text-primary-fg);
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
  /* 层级与坐标都由 Popover 内核给(zOffset: 3 = 复合器浮层三兄弟的最上一层);
     这里只剩「面板本体不参与窗口拖拽区」这一条。 */
  -webkit-app-region: no-drag;
}

/* Slot one carries the live agent, not the cursor: a filled square in the
   accent, the only ink in the list that isn't text. */
.agent-row-mark-dot {
  width: 6px;
  height: 6px;
  background: var(--ui-accent-primary-fg);
}

/* positioning only — visuals come from ErrorNote */
.agent-error {
  margin: 8px 12px 2px;
}
</style>
