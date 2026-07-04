<template>
  <aside
    class="chat-side-panel"
    :class="{ collapsed: props.collapsed }"
    aria-label="Chat side panel"
  >
    <template v-if="!props.collapsed">
      <Splitter
        class="chat-side-splitter"
        layout="vertical"
        :gap="10"
        :resizer-size="2"
        :resizer-hit-size="12"
        :keyboard-step="4"
        :keyboard-large-step="12"
      >
        <SplitterPanel
          v-model:size="sidePanelSizes.outline"
          as="section"
          class="chat-side-section chat-side-outline-section"
          :min="SIDE_PANEL_MIN_SIZE"
        >
          <div class="chat-side-section-head">
            <span class="chat-side-section-title">Outline</span>
          </div>
          <div
            ref="outlineHostRef"
            class="chat-side-outline-host"
          />
        </SplitterPanel>

        <SplitterPanel
          v-model:size="sidePanelSizes.system"
          as="section"
          class="chat-side-section chat-side-system-section"
          :class="{ collapsed: systemPromptCollapsed }"
          :min="SIDE_PANEL_MIN_SIZE"
        >
          <div class="chat-side-section-toggle chat-side-section-header">
            <button
              type="button"
              class="chat-side-title-button"
              :aria-expanded="!systemPromptCollapsed"
              @click="toggleSystemPromptCollapsed"
            >
              <span class="chat-side-section-title">System prompt</span>
            </button>
            <button
              type="button"
              class="chat-side-icon-button"
              title="Refresh system prompt"
              :disabled="systemPromptRefreshing || !props.sessionId || isDraftSession"
              @click.stop="refreshSystemPromptPanel"
            >
              <RefreshCw
                :size="14"
                :class="{ spinning: systemPromptRefreshing }"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="chat-side-icon-button"
              :aria-label="systemPromptCollapsed ? 'Expand system prompt' : 'Collapse system prompt'"
              @click="toggleSystemPromptCollapsed"
            >
              <ChevronDown
                class="chat-side-chevron"
                :size="14"
                :stroke-width="2.2"
                aria-hidden="true"
              />
            </button>
          </div>

          <SystemPromptPanel
            v-if="!systemPromptCollapsed && !isDraftSession"
            ref="systemPromptPanelRef"
            :session-id="props.sessionId"
            :working-directory="props.workingDirectory"
            :agent-id="props.agentId"
            :last-provider="props.lastProvider"
            :last-model="props.lastModel"
          />
          <div
            v-else-if="!systemPromptCollapsed"
            class="chat-side-draft-state"
          >
            System prompt will appear after the chat starts.
          </div>
        </SplitterPanel>

        <SplitterPanel
          v-if="showTodoProgressPanel"
          v-model:size="sidePanelSizes.todo"
          as="section"
          class="chat-side-section chat-side-todo-section"
          :class="{ collapsed: todoCollapsed }"
          :min="SIDE_PANEL_MIN_SIZE"
        >
          <button
            type="button"
            class="chat-side-section-toggle"
            :aria-expanded="!todoCollapsed"
            @click="toggleTodoCollapsed"
          >
            <span class="chat-side-section-title">Todo progress</span>
            <ChevronDown
              class="chat-side-chevron"
              :size="14"
              :stroke-width="2.2"
              aria-hidden="true"
            />
          </button>

          <TodoProgressPanel
            v-if="!todoCollapsed"
            :session-id="props.sessionId"
            :working-directory="props.workingDirectory"
          />
        </SplitterPanel>
      </Splitter>

      <slot name="extra-panels" />
    </template>
  </aside>
</template>

<script setup lang="ts">
import { ChevronDown, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import Splitter from '@/components/common/Splitter.vue'
import SplitterPanel from '@/components/common/SplitterPanel.vue'
import SystemPromptPanel from './SystemPromptPanel.vue'
import TodoProgressPanel from './TodoProgressPanel.vue'

const props = withDefaults(defineProps<{
  sessionId?: string
  workingDirectory?: string
  agentId?: string
  lastProvider?: string
  lastModel?: string
  collapsed?: boolean
}>(), {
  sessionId: undefined,
  workingDirectory: undefined,
  agentId: undefined,
  lastProvider: undefined,
  lastModel: undefined,
  collapsed: false,
})

const emit = defineEmits<{
  outlineTargetChange: [target: HTMLElement | null]
  toggleCollapsed: []
}>()

const TODO_COLLAPSED_STORAGE_KEY = 'chatSideTodoProgressCollapsed'
const SYSTEM_PROMPT_COLLAPSED_STORAGE_KEY = 'chatSideSystemPromptCollapsed'
const SIDE_PANEL_MIN_SIZE = 12
const EQUAL_THREE_PANEL_SIZE = 100 / 3

const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()
const outlineHostRef = ref<HTMLElement | null>(null)
const todoCollapsed = ref(localStorage.getItem(TODO_COLLAPSED_STORAGE_KEY) === 'true')
const systemPromptCollapsed = ref(localStorage.getItem(SYSTEM_PROMPT_COLLAPSED_STORAGE_KEY) === 'true')
const systemPromptPanelRef = ref<InstanceType<typeof SystemPromptPanel> | null>(null)
const systemPromptRefreshing = ref(false)
const todoEnabled = computed(() => settingsStore.settings.general?.todoPlan?.enabled !== false)
const isDraftSession = computed(() => props.sessionId ? sessionsStore.isNewChatDraftId(props.sessionId) : false)
const showTodoProgressPanel = computed(() => todoEnabled.value && !isDraftSession.value)
const sidePanelSizes = reactive({
  outline: EQUAL_THREE_PANEL_SIZE,
  system: EQUAL_THREE_PANEL_SIZE,
  todo: EQUAL_THREE_PANEL_SIZE,
})

function emitOutlineTarget() {
  emit('outlineTargetChange', props.collapsed ? null : outlineHostRef.value)
}

function toggleTodoCollapsed() {
  todoCollapsed.value = !todoCollapsed.value
  localStorage.setItem(TODO_COLLAPSED_STORAGE_KEY, String(todoCollapsed.value))
}

function toggleSystemPromptCollapsed() {
  systemPromptCollapsed.value = !systemPromptCollapsed.value
  localStorage.setItem(SYSTEM_PROMPT_COLLAPSED_STORAGE_KEY, String(systemPromptCollapsed.value))
}

async function refreshSystemPromptPanel() {
  if (systemPromptRefreshing.value || !props.sessionId || isDraftSession.value) return
  systemPromptRefreshing.value = true
  try {
    if (systemPromptCollapsed.value) {
      systemPromptCollapsed.value = false
      localStorage.setItem(SYSTEM_PROMPT_COLLAPSED_STORAGE_KEY, 'false')
      await nextTick()
    }
    await systemPromptPanelRef.value?.refreshSnapshot()
  } finally {
    systemPromptRefreshing.value = false
  }
}

function handleTodoToggleCard() {
  if (!showTodoProgressPanel.value) return
  if (props.collapsed) {
    todoCollapsed.value = false
    localStorage.setItem(TODO_COLLAPSED_STORAGE_KEY, 'false')
    emit('toggleCollapsed')
    return
  }
  toggleTodoCollapsed()
}

function equalizeSidePanelHeights(panelCount: 2 | 3) {
  const size = 100 / panelCount
  sidePanelSizes.outline = size
  sidePanelSizes.system = size
  sidePanelSizes.todo = panelCount === 3 ? 100 - (size * 2) : EQUAL_THREE_PANEL_SIZE
}

watch(
  [outlineHostRef, () => props.collapsed],
  () => nextTick(emitOutlineTarget),
  { flush: 'post' },
)

watch(
  showTodoProgressPanel,
  visible => equalizeSidePanelHeights(visible ? 3 : 2),
  { immediate: true },
)

onMounted(() => {
  nextTick(emitOutlineTarget)
  window.addEventListener('todo-plan:toggle-card', handleTodoToggleCard)
})

onUnmounted(() => {
  emit('outlineTargetChange', null)
  window.removeEventListener('todo-plan:toggle-card', handleTodoToggleCard)
})
</script>

<style scoped>
.chat-side-panel {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
  color: var(--ui-text-primary-fg, var(--text));
  background: transparent;
}

.chat-side-panel.collapsed {
  align-items: center;
  gap: 0;
  padding: 0;
}

.chat-side-section {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 48%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg))) 48%, transparent);
}

.chat-side-splitter {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chat-side-splitter :deep(.splitter-resizer) {
  color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 72%, var(--ui-border-default-border, var(--border)));
}

.chat-side-outline-section,
.chat-side-system-section,
.chat-side-todo-section {
  min-height: 0;
}

.chat-side-section-head,
.chat-side-section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 36%, transparent);
  background: transparent;
  color: inherit;
  font: inherit;
}

.chat-side-section-toggle {
  width: 100%;
  cursor: pointer;
}

.chat-side-section-header {
  padding: 6px 6px 6px 10px;
  cursor: default;
}

.chat-side-title-button {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.chat-side-icon-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.chat-side-icon-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-surface-hover-bg, var(--bg-hover, var(--bg-secondary))) 68%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.chat-side-icon-button:disabled {
  cursor: default;
  opacity: 0.5;
}

.chat-side-draft-state {
  display: flex;
  align-items: center;
  min-height: 42px;
  padding: 9px 10px 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  line-height: 1.35;
}

.chat-side-chevron {
  color: var(--ui-text-muted-fg, var(--muted));
  transition: transform 0.14s ease;
}

.chat-side-section.collapsed .chat-side-section-toggle {
  border-bottom: 0;
}

.chat-side-section.collapsed .chat-side-chevron {
  transform: rotate(-90deg);
}

.spinning {
  animation: chat-side-spin 0.8s linear infinite;
}

.chat-side-section-title {
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 82%, var(--ui-text-muted-fg, var(--muted)));
  font-size: 11.5px;
  font-weight: 700;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.chat-side-outline-host {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 8px;
}

.chat-side-todo-section :deep(.todo-progress-panel) {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
}

.chat-side-system-section :deep(.system-prompt-panel) {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .chat-side-chevron {
    transition: none;
  }

  .spinning {
    animation: none;
  }
}

@keyframes chat-side-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
