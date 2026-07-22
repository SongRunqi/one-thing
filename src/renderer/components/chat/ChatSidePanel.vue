<template>
  <aside
    class="chat-side-panel"
    :class="{ collapsed: props.collapsed }"
    aria-label="Chat side panel"
  >
    <template v-if="!props.collapsed">
      <!-- A draft has no session on disk and therefore no segments; an empty
           section here would be pure noise before the chat even starts. -->
      <section
        v-if="!isDraftSession"
        class="chat-side-esec chat-side-toc-section"
        :class="{ focus: focusedSection === 'toc' }"
        @mouseenter="scheduleFocus('toc')"
        @mouseleave="cancelScheduledFocus"
      >
        <div class="chat-side-esum">
          <button
            type="button"
            class="chat-side-esum-main"
            :aria-expanded="focusedSection === 'toc'"
            @click="setFocus('toc')"
          >
            <span class="chat-side-esum-title">Contents</span>
            <span
              class="chat-side-leader"
              aria-hidden="true"
            />
            <span class="chat-side-esum-live">{{ tocSummary }}</span>
          </button>
        </div>
        <div class="chat-side-ebody">
          <div
            v-if="tocSegments.length === 0"
            class="chat-side-toc-empty"
          >
            {{ tocLoading ? '…' : 'Nothing recorded yet' }}
          </div>
          <SessionSegmentList
            v-else
            :segments="tocSegments"
            clickable
            @jump="handleSegmentJump"
          />
        </div>
      </section>

      <section
        class="chat-side-esec chat-side-outline-section"
        :class="{ focus: focusedSection === 'outline' }"
        @mouseenter="scheduleFocus('outline')"
        @mouseleave="cancelScheduledFocus"
      >
        <div class="chat-side-esum">
          <button
            type="button"
            class="chat-side-esum-main"
            :aria-expanded="focusedSection === 'outline'"
            @click="setFocus('outline')"
          >
            <span class="chat-side-esum-title">Outline</span>
            <span
              class="chat-side-leader"
              aria-hidden="true"
            />
            <span class="chat-side-esum-live">{{ outlineSummary }}</span>
          </button>
        </div>
        <div class="chat-side-ebody">
          <div
            ref="outlineHostRef"
            class="chat-side-outline-host"
          />
        </div>
      </section>

      <section
        class="chat-side-esec chat-side-system-section"
        :class="{ focus: focusedSection === 'system' }"
        @mouseenter="scheduleFocus('system')"
        @mouseleave="cancelScheduledFocus"
      >
        <div class="chat-side-esum">
          <button
            type="button"
            class="chat-side-esum-main"
            :aria-expanded="focusedSection === 'system'"
            @click="setFocus('system')"
          >
            <span class="chat-side-esum-title">System prompt</span>
            <span
              class="chat-side-leader"
              aria-hidden="true"
            />
            <span class="chat-side-esum-live">{{ systemSummary }}</span>
          </button>
          <button
            v-if="focusedSection === 'system'"
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
        </div>
        <div class="chat-side-ebody">
          <SystemPromptPanel
            v-if="!isDraftSession"
            ref="systemPromptPanelRef"
            :session-id="props.sessionId"
            :working-directory="props.workingDirectory"
            :agent-id="props.agentId"
            :last-provider="props.lastProvider"
            :last-model="props.lastModel"
            @summary-change="systemSummary = $event"
          />
          <div
            v-else
            class="chat-side-draft-state"
          >
            System prompt will appear after the chat starts.
          </div>
        </div>
      </section>

      <section
        v-if="showTodoProgressPanel"
        class="chat-side-esec chat-side-todo-section"
        :class="{ focus: focusedSection === 'todo' }"
        @mouseenter="scheduleFocus('todo')"
        @mouseleave="cancelScheduledFocus"
      >
        <div class="chat-side-esum">
          <button
            type="button"
            class="chat-side-esum-main"
            :aria-expanded="focusedSection === 'todo'"
            @click="setFocus('todo')"
          >
            <span class="chat-side-esum-title">Todo</span>
            <span
              class="chat-side-leader"
              aria-hidden="true"
            />
            <span class="chat-side-esum-live">{{ todoSummary }}</span>
          </button>
        </div>
        <div class="chat-side-ebody">
          <TodoProgressPanel
            :session-id="props.sessionId"
            @progress-change="todoProgress = $event"
          />
        </div>
      </section>

      <section
        v-if="!isDraftSession"
        class="chat-side-esec chat-side-variables-section"
        :class="{ focus: focusedSection === 'variables' }"
        @mouseenter="scheduleFocus('variables')"
        @mouseleave="cancelScheduledFocus"
      >
        <div class="chat-side-esum">
          <button
            type="button"
            class="chat-side-esum-main"
            :aria-expanded="focusedSection === 'variables'"
            @click="setFocus('variables')"
          >
            <span class="chat-side-esum-title">Variables</span>
            <span
              class="chat-side-leader"
              aria-hidden="true"
            />
            <span class="chat-side-esum-live">{{ variablesSummary }}</span>
          </button>
        </div>
        <div class="chat-side-ebody">
          <VariablesPanel
            :session-id="props.sessionId"
            @summary-change="variablesSummary = $event"
          />
        </div>
      </section>

      <slot name="extra-panels" />
    </template>
  </aside>
</template>

<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import SystemPromptPanel from './SystemPromptPanel.vue'
import TodoProgressPanel from './TodoProgressPanel.vue'
import VariablesPanel from './VariablesPanel.vue'
import SessionSegmentList from '@/components/common/SessionSegmentList.vue'
import { platformApi } from '@/platform'
import type { SessionSegment } from '@/types'

type SectionId = 'toc' | 'outline' | 'system' | 'todo' | 'variables'

/**
 * Sections that may be restored from storage; 'outline' is the fallback.
 * Declared here rather than beside readStoredFocus because that runs during
 * setup, before a const further down the file has initialised.
 */
const RESTORABLE_SECTIONS: readonly SectionId[] = ['toc', 'system', 'todo', 'variables']

interface TodoProgressSummary {
  done: number
  total: number
  currentText: string
}

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
  jumpToMessage: [sessionId: string, messageId: string]
}>()

const FOCUS_STORAGE_KEY = 'chatSideFocusedSection'
const HOVER_FOCUS_DELAY_MS = 140
const OUTLINE_CURRENT_CHANGED_EVENT = 'assistant-outline:current-changed'

const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()
const outlineHostRef = ref<HTMLElement | null>(null)
const systemPromptPanelRef = ref<InstanceType<typeof SystemPromptPanel> | null>(null)
const systemPromptRefreshing = ref(false)
const focusedSection = ref<SectionId>(readStoredFocus())
const outlineSummary = ref('')

// —— 会话目录 ——
const tocSegments = ref<SessionSegment[]>([])
const tocLoading = ref(false)

const tocSummary = computed(() => {
  if (tocLoading.value) return ''
  const count = tocSegments.value.length
  return count ? `${count}` : ''
})

/**
 * Segments are written after the session goes quiet, so the list is stale by
 * construction. Reloading when this section takes focus is the cheapest way to
 * stay current without polling a file on a timer.
 */
async function loadToc(): Promise<void> {
  const sessionId = props.sessionId
  if (!sessionId) {
    tocSegments.value = []
    return
  }
  tocLoading.value = true
  try {
    const response = await platformApi.getSessionSegments(sessionId)
    if (props.sessionId !== sessionId) return
    tocSegments.value = response.success ? response.segments : []
  } catch {
    tocSegments.value = []
  } finally {
    tocLoading.value = false
  }
}

function handleSegmentJump(segment: SessionSegment): void {
  if (!props.sessionId || !segment.startMessageId) return
  emit('jumpToMessage', props.sessionId, segment.startMessageId)
}
const systemSummary = ref('')
const todoProgress = ref<TodoProgressSummary | null>(null)
const variablesSummary = ref('')
let hoverFocusTimer: ReturnType<typeof setTimeout> | null = null

const todoEnabled = computed(() => settingsStore.settings.general?.todoPlan?.enabled !== false)
const isDraftSession = computed(() => props.sessionId ? sessionsStore.isNewChatDraftId(props.sessionId) : false)
const showTodoProgressPanel = computed(() => todoEnabled.value && !isDraftSession.value)

const todoSummary = computed(() => {
  const progress = todoProgress.value
  if (!progress || progress.total === 0) return ''
  if (progress.done >= progress.total) return `${progress.done}/${progress.total} · complete`
  if (!progress.currentText) return `${progress.done}/${progress.total}`
  return `${progress.done}/${progress.total} · ${progress.currentText}`
})

function readStoredFocus(): SectionId {
  const stored = localStorage.getItem(FOCUS_STORAGE_KEY)
  // Derived from SectionId rather than listed inline: the previous hand-written
  // chain silently dropped any section added later, sending focus back to
  // 'outline' on every reload.
  return RESTORABLE_SECTIONS.includes(stored as SectionId) ? (stored as SectionId) : 'outline'
}

function setFocus(section: SectionId) {
  cancelScheduledFocus()
  if (focusedSection.value === section) return
  focusedSection.value = section
  localStorage.setItem(FOCUS_STORAGE_KEY, section)
}

function scheduleFocus(section: SectionId) {
  if (focusedSection.value === section) return
  cancelScheduledFocus()
  hoverFocusTimer = setTimeout(() => {
    hoverFocusTimer = null
    setFocus(section)
  }, HOVER_FOCUS_DELAY_MS)
}

function cancelScheduledFocus() {
  if (!hoverFocusTimer) return
  clearTimeout(hoverFocusTimer)
  hoverFocusTimer = null
}

function emitOutlineTarget() {
  emit('outlineTargetChange', props.collapsed ? null : outlineHostRef.value)
}

async function refreshSystemPromptPanel() {
  if (systemPromptRefreshing.value || !props.sessionId || isDraftSession.value) return
  systemPromptRefreshing.value = true
  try {
    await systemPromptPanelRef.value?.refreshSnapshot()
  } finally {
    systemPromptRefreshing.value = false
  }
}

function handleTodoToggleCard() {
  if (!showTodoProgressPanel.value) return
  if (props.collapsed) emit('toggleCollapsed')
  setFocus('todo')
}

function handleOutlineCurrentChanged(event: Event) {
  const detail = (event as CustomEvent<{ sessionId?: string, label?: string, count?: number }>).detail
  if (!detail) return
  if (props.sessionId && detail.sessionId && detail.sessionId !== props.sessionId) return
  outlineSummary.value = detail.count ? detail.label || '' : ''
}

watch(
  [outlineHostRef, () => props.collapsed],
  () => nextTick(emitOutlineTarget),
  { flush: 'post' },
)

watch(showTodoProgressPanel, (visible) => {
  if (!visible && focusedSection.value === 'todo') setFocus('outline')
}, { immediate: true })

watch(isDraftSession, (draft) => {
  if (draft && focusedSection.value === 'variables') setFocus('outline')
}, { immediate: true })

watch([() => props.sessionId, focusedSection], ([, section]) => {
  if (section === 'toc') void loadToc()
}, { immediate: true })

watch(() => props.sessionId, () => {
  outlineSummary.value = ''
  systemSummary.value = ''
  todoProgress.value = null
  variablesSummary.value = ''
})

onMounted(() => {
  nextTick(emitOutlineTarget)
  window.addEventListener('todo-plan:toggle-card', handleTodoToggleCard)
  window.addEventListener(OUTLINE_CURRENT_CHANGED_EVENT, handleOutlineCurrentChanged)
})

onUnmounted(() => {
  cancelScheduledFocus()
  emit('outlineTargetChange', null)
  window.removeEventListener('todo-plan:toggle-card', handleTodoToggleCard)
  window.removeEventListener(OUTLINE_CURRENT_CHANGED_EVENT, handleOutlineCurrentChanged)
})
</script>

<style scoped>
.chat-side-panel {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
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
  padding: 0;
}

/* 呼吸:三段同显,聚焦段长开,其余压成一行活摘要。 */
.chat-side-esec {
  box-sizing: border-box;
  display: flex;
  flex: 0.0001 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 36px;
  overflow: hidden;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 38%, transparent);
  transition: flex-grow 0.26s ease;
}

.chat-side-esec:last-of-type {
  border-bottom: 0;
}

.chat-side-esec.focus {
  flex-grow: 1;
}

.chat-side-esum {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 34px;
  padding: 8px 4px 8px 2px;
}

.chat-side-esum-main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.chat-side-esum-title {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 82%, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* 活摘要:未聚焦时是该段最要紧的一句话 */
.chat-side-esum-live {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-side-esec.focus .chat-side-esum-live {
  visibility: hidden;
}

/* 点线:题名与摘要之间的引导线 */
.chat-side-leader {
  flex: 1 1 auto;
  align-self: center;
  height: 0;
  min-width: 12px;
  border-bottom: 1.5px dotted color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 85%, transparent);
  transform: translateY(1px);
}

.chat-side-ebody {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease 0.08s;
}

.chat-side-esec.focus .chat-side-ebody {
  opacity: 1;
  pointer-events: auto;
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
  align-items: flex-start;
  min-height: 42px;
  padding: 9px 10px 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  line-height: 1.35;
}

.spinning {
  animation: chat-side-spin 0.8s linear infinite;
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

.chat-side-variables-section :deep(.variables-panel) {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
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
  .chat-side-esec {
    transition: none;
  }

  .chat-side-ebody {
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

/* 目录空态:与 leader 线同一淡墨,不喧宾夺主 */
.chat-side-toc-empty {
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-style: italic;
}
</style>
