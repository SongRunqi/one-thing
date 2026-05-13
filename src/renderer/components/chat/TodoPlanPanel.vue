<template>
  <section
    ref="panelRef"
    class="todo-plan-panel"
    :class="{ pinned, docked, collapsed, standalone, 'gutter-docked': canDockInRightGutter, searching: searchOpen, 'has-quick-add': mode === 'preview' }"
    :style="{ height: collapsed ? undefined : `${panelHeight}px` }"
    @mouseenter="expandFromEdge"
    @mouseleave="collapseToEdge"
  >
    <button
      v-if="collapsed"
      class="wake-button"
      type="button"
      title="Todo / Plan"
      @click="collapsed = false"
    />

    <template v-else>
      <header class="panel-header">
        <button
          class="panel-logo"
          ref="panelLogoRef"
          type="button"
          title="Switch todo"
          @click="deckOpen = !deckOpen"
        >
          <ListChecks :size="16" />
        </button>

        <div
          v-if="deckOpen"
          ref="deckPopoverRef"
          class="deck-popover"
        >
          <div class="deck-section-label">User Todo</div>
          <button
            v-for="doc in snapshot?.userNotes || []"
            :key="doc.id"
            :class="{ active: activeId === doc.id }"
            type="button"
            @click="selectDocument(doc.id); deckOpen = false"
          >
            <span>{{ doc.title }}</span>
            <strong>{{ doc.totalTasks }} tasks</strong>
          </button>

          <div class="deck-actions">
            <button
              type="button"
              @click.stop="createNote"
            >New</button>
            <button
              v-if="activeDocument?.scope === 'user-note'"
              type="button"
              @click.stop="renameNote"
            >Rename</button>
            <button
              v-if="activeDocument?.scope === 'user-note'"
              type="button"
              @click.stop="deleteNote"
            >Delete</button>
          </div>

          <div class="deck-section-label">Workspace</div>
          <button
            :class="{ active: activeId === snapshot?.workspaceAiTodo.id }"
            type="button"
            @click="selectDocument(snapshot?.workspaceAiTodo.id || 'workspace-ai-todo'); deckOpen = false"
          >
            <span>AI Todo</span>
            <strong>{{ snapshot?.workspaceAiTodo.totalTasks || 0 }} tasks</strong>
          </button>

        </div>

        <div class="panel-title">
          <strong>{{ activeDocument?.title || 'Todo' }}</strong>
          <span>{{ headerSummary }}</span>
        </div>

        <div class="panel-actions">
          <button
            class="icon-button"
            type="button"
            title="Search"
            @click="toggleSearch"
          >
            <Search :size="15" />
          </button>
          <button
            class="icon-button"
            type="button"
            title="Edit markdown"
            @click="mode = mode === 'edit' ? 'preview' : 'edit'"
          >
            <Pencil :size="15" />
          </button>
          <button
            class="icon-button"
            :class="{ active: pinned }"
            type="button"
            :title="pinned ? 'Unpin card' : 'Pin card'"
            @click="togglePinned"
          >
            <Pin :size="15" />
          </button>
          <button
            class="icon-button"
            :class="{ active: docked }"
            type="button"
            title="Dock"
            @click="toggleDocked"
          >
            <PanelRight :size="15" />
          </button>
          <button
            class="icon-button"
            type="button"
            title="Open window"
            @click="openWindow"
          >
            <ExternalLink :size="15" />
          </button>
        </div>
      </header>

      <div
        v-if="searchOpen"
        class="search-row"
      >
        <Search :size="14" />
        <input
          v-model="searchQuery"
          placeholder="Search tasks"
          spellcheck="false"
        >
      </div>

      <div class="panel-body">
        <TextEditor
          v-if="mode === 'edit'"
          v-model="draft"
          class="markdown-editor"
          profile="markdown-document"
          language="markdown"
          :min-height="120"
          :max-height="100000"
          :spellcheck="false"
          @update:model-value="scheduleSave"
        />

        <div
          v-else
          class="task-view"
        >
          <div
            v-if="filteredTaskSections.length > 0"
            class="task-sections"
          >
            <section
              v-for="section in filteredTaskSections"
              :key="section.title"
              class="task-section"
            >
              <h4>{{ section.title }}</h4>
              <div class="task-list">
                <label
                  v-for="task in section.tasks"
                  :key="task.lineIndex"
                  :class="['task-row', { done: task.done }]"
                >
                  <input
                    type="checkbox"
                    :checked="task.done"
                    @change="toggleTask(task.lineIndex)"
                  >
                  <span class="task-check">
                    <Check :size="14" />
                  </span>
                  <span class="task-text">{{ task.text }}</span>
                  <span
                    v-if="task.lineIndex === firstOpenTaskLine"
                    class="task-status"
                  >DOING</span>
                  <button
                    class="task-delete"
                    type="button"
                    title="Delete task"
                    aria-label="Delete task"
                    @click.stop.prevent="deleteTask(task.lineIndex)"
                  >
                    <Trash2 :size="13" />
                  </button>
                </label>
              </div>
            </section>
          </div>

          <span
            v-else
            class="empty-state"
          >No tasks</span>

          <div
            v-if="aiSuggestion && activeDocument?.scope === 'user-note'"
            class="ai-suggestion"
          >
            <Sparkles :size="15" />
            <span><strong>AI 建议下一步：</strong>{{ aiSuggestion }}</span>
            <button
              type="button"
              @click="addSuggestedTask"
            >
              添加
              <ArrowRight :size="13" />
            </button>
          </div>
        </div>

      </div>

      <footer
        v-if="mode === 'preview'"
        class="quick-add"
      >
        <Plus :size="16" />
        <input
          v-model="newTaskText"
          placeholder="添加任务，回车保存..."
          spellcheck="false"
          @keydown.enter.prevent="addTask"
        >
        <span>⌘ ↵</span>
      </footer>

      <div
        class="resize-handle"
        title="Resize"
        @pointerdown="startResize"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowRight,
  Check,
  ExternalLink,
  ListChecks,
  PanelRight,
  Pencil,
  Pin,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'
import { useSessionsStore } from '@/stores/sessions'
import type { TodoPlanDocument, TodoPlanSnapshot } from '@/types'
import TextEditor from '@/editor/TextEditor.vue'

interface ParsedTask {
  lineIndex: number
  done: boolean
  text: string
  section: string
}

interface TaskSection {
  title: string
  tasks: ParsedTask[]
}

const props = defineProps<{
  sessionId?: string
  workingDirectory?: string
  standalone?: boolean
}>()

const sessionsStore = useSessionsStore()
const snapshot = ref<TodoPlanSnapshot | null>(null)
const activeId = ref(localStorage.getItem('todoPlanActiveId') || '')
const draft = ref('')
const mode = ref<'preview' | 'edit'>('preview')
const pinnedStorageKey = props.standalone ? 'todoPlanWindowPinned' : 'todoPlanPinned'
const pinned = ref(localStorage.getItem(pinnedStorageKey) === 'true')
const docked = ref(localStorage.getItem('todoPlanDocked') === 'true')
const collapsed = ref(props.standalone ? false : localStorage.getItem('todoPlanCollapsed') !== 'false')
const panelHeight = ref(Number(localStorage.getItem('todoPlanHeight') || 300))
const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const searchOpen = ref(false)
const searchQuery = ref('')
const newTaskText = ref('')
const deckOpen = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const panelLogoRef = ref<HTMLElement | null>(null)
const deckPopoverRef = ref<HTMLElement | null>(null)
const canDockInRightGutter = ref(false)
let cleanupChanged: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined
let resizing = false
let resizeStartY = 0
let resizeStartHeight = 0
const TODO_PANEL_WIDTH = 292
const TODO_PANEL_GAP = 16

const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId || undefined)
const effectiveWorkingDirectory = computed(() => {
  if (props.workingDirectory !== undefined) return props.workingDirectory || undefined
  const session = sessionsStore.sessions.find(item => item.id === effectiveSessionId.value)
  return session?.workingDirectory || undefined
})
const allDocuments = computed(() => {
  if (!snapshot.value) return []
  return [
    ...snapshot.value.userNotes,
    snapshot.value.workspaceAiTodo,
  ]
})
const activeDocument = computed(() => allDocuments.value.find(doc => doc.id === activeId.value) || allDocuments.value[0])
const tasks = computed(() => parseTasks(draft.value))
const headerSummary = computed(() => `${tasks.value.length} tasks`)
const firstOpenTaskLine = computed(() => tasks.value.find(task => !task.done)?.lineIndex ?? -1)
const filteredTasks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return tasks.value
  return tasks.value.filter(task => task.text.toLowerCase().includes(query))
})
const filteredTaskSections = computed(() => groupTasksBySection(filteredTasks.value))
const aiSuggestion = computed(() => {
  const suggestion = parseTasks(snapshot.value?.workspaceAiTodo.content || '').find(task => !task.done)?.text
  return suggestion || ''
})

watch(activeDocument, (doc) => {
  draft.value = doc?.content || ''
}, { immediate: true })

watch([mode, pinned, docked, collapsed], () => {
  localStorage.setItem(pinnedStorageKey, String(pinned.value))
  localStorage.setItem('todoPlanDocked', String(docked.value))
  if (!props.standalone) {
    localStorage.setItem('todoPlanCollapsed', String(collapsed.value))
  }
})

watch([effectiveSessionId, effectiveWorkingDirectory], () => {
  loadSnapshot()
})

function parseTasks(content: string): ParsedTask[] {
  let section = 'Tasks'
  return content.split('\n').flatMap((line, lineIndex) => {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      section = heading[1].trim() || 'Tasks'
      return []
    }
    const match = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.*)$/)
    if (!match) return []
    return [{
      lineIndex,
      done: match[1].toLowerCase() === 'x',
      text: match[2].trim(),
      section,
    }]
  })
}

function groupTasksBySection(sourceTasks: ParsedTask[]): TaskSection[] {
  const sections: TaskSection[] = []
  for (const task of sourceTasks) {
    let section = sections.find(item => item.title === task.section)
    if (!section) {
      section = { title: task.section, tasks: [] }
      sections.push(section)
    }
    section.tasks.push(task)
  }
  return sections
}

async function loadSnapshot() {
  const response = await window.electronAPI.getTodoPlan({
    sessionId: effectiveSessionId.value,
    workingDirectory: effectiveWorkingDirectory.value,
  })
  if (!response.success || !response.snapshot) return
  snapshot.value = response.snapshot
  if (!allDocuments.value.some(doc => doc.id === activeId.value)) {
    activeId.value = response.snapshot.userNotes[0]?.id || response.snapshot.workspaceAiTodo.id
  }
}

function selectDocument(id: string) {
  activeId.value = id
  localStorage.setItem('todoPlanActiveId', id)
}

watch(activeId, () => {
  deckOpen.value = false
  searchQuery.value = ''
})

function scheduleSave() {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  saveTimer.value = setTimeout(saveDraft, 260)
}

async function saveDraft() {
  const document = activeDocument.value
  if (!document) return
  const response = await window.electronAPI.updateTodoPlan({
    scope: document.scope,
    id: document.scope === 'user-note' ? document.id : undefined,
    sessionId: effectiveSessionId.value,
    workingDirectory: effectiveWorkingDirectory.value,
    content: draft.value,
  })
  if (response.success && response.document) {
    applyDocument(response.document)
  }
}

function applyDocument(document: TodoPlanDocument) {
  if (!snapshot.value) return
  if (document.scope === 'user-note') {
    const nextNotes = snapshot.value.userNotes.some(note => note.id === document.id)
      ? snapshot.value.userNotes.map(note => note.id === document.id ? document : note)
      : [...snapshot.value.userNotes, document]
    snapshot.value = { ...snapshot.value, userNotes: nextNotes }
  } else if (document.scope === 'workspace-ai-todo') {
    snapshot.value = { ...snapshot.value, workspaceAiTodo: document }
  }
  if (document.id === activeId.value && mode.value === 'preview') {
    draft.value = document.content
  }
}

async function createNote() {
  const title = window.prompt('Todo title', 'New Todo')
  if (!title?.trim()) return
  const response = await window.electronAPI.createTodoPlanNote({ title })
  if (response.success && response.document) {
    applyDocument(response.document)
    selectDocument(response.document.id)
  }
}

async function renameNote() {
  const document = activeDocument.value
  if (!document || document.scope !== 'user-note') return
  const title = window.prompt('Rename todo', document.title)
  if (!title?.trim()) return
  const response = await window.electronAPI.renameTodoPlanNote({ id: document.id, title })
  if (response.success && response.document) {
    await loadSnapshot()
    selectDocument(response.document.id)
  }
}

async function deleteNote() {
  const document = activeDocument.value
  if (!document || document.scope !== 'user-note') return
  if (!window.confirm(`Delete "${document.title}"?`)) return
  const response = await window.electronAPI.deleteTodoPlanNote({ id: document.id })
  if (response.success) {
    await loadSnapshot()
  }
}

function replaceDraftLine(lineIndex: number, nextLine: string) {
  const lines = draft.value.split('\n')
  lines[lineIndex] = nextLine
  draft.value = lines.join('\n')
}

function toggleTask(lineIndex: number) {
  const lines = draft.value.split('\n')
  const current = lines[lineIndex]
  const match = current?.match(/^(\s*[-*]\s+\[)([ xX])(]\s+.*)$/)
  if (!match) return
  replaceDraftLine(lineIndex, `${match[1]}${match[2].toLowerCase() === 'x' ? ' ' : 'x'}${match[3]}`)
  saveDraft()
}

function deleteTask(lineIndex: number) {
  const lines = draft.value.split('\n')
  if (!lines[lineIndex]?.match(/^\s*[-*]\s+\[[ xX]]\s+/)) return
  lines.splice(lineIndex, 1)
  draft.value = lines.join('\n').replace(/\n*$/, '\n')
  saveDraft()
}

function addTask() {
  const text = newTaskText.value.trim()
  if (!text) return
  const nextTask = `- [ ] ${text}`
  if (activeDocument.value?.scope === 'workspace-ai-todo') {
    draft.value = addTaskToSection(draft.value, 'Now', nextTask)
  } else {
    const separator = draft.value.endsWith('\n') || draft.value.length === 0 ? '' : '\n'
    draft.value = `${draft.value}${separator}${nextTask}\n`
  }
  newTaskText.value = ''
  saveDraft()
}

function addTaskToSection(content: string, sectionTitle: string, taskLine: string): string {
  const lines = content.split('\n')
  const sectionIndex = lines.findIndex(line => line.trim().toLowerCase() === `## ${sectionTitle.toLowerCase()}`)
  if (sectionIndex === -1) {
    const separator = content.endsWith('\n') || content.length === 0 ? '' : '\n'
    return `${content}${separator}## ${sectionTitle}\n${taskLine}\n`
  }

  let insertIndex = lines.length
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      insertIndex = index
      break
    }
  }

  while (insertIndex > sectionIndex + 1 && lines[insertIndex - 1]?.trim() === '') {
    insertIndex -= 1
  }
  lines.splice(insertIndex, 0, taskLine)
  return lines.join('\n').replace(/\n*$/, '\n')
}

function addSuggestedTask() {
  if (!aiSuggestion.value) return
  newTaskText.value = aiSuggestion.value
  addTask()
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) searchQuery.value = ''
}

function togglePinned() {
  pinned.value = !pinned.value
  if (pinned.value) collapsed.value = false
  if (props.standalone) {
    window.electronAPI.setTodoPlanWindowPinned(pinned.value)
  }
}

function toggleDocked() {
  docked.value = !docked.value
  if (docked.value) collapsed.value = false
}

function openWindow() {
  window.electronAPI.openTodoPlanWindow()
}

function startResize(event: PointerEvent) {
  resizing = true
  resizeStartY = event.clientY
  resizeStartHeight = panelHeight.value
  window.addEventListener('pointermove', handleResize)
  window.addEventListener('pointerup', stopResize, { once: true })
}

function handleResize(event: PointerEvent) {
  if (!resizing) return
  const nextHeight = Math.min(620, Math.max(220, resizeStartHeight + event.clientY - resizeStartY))
  panelHeight.value = nextHeight
  localStorage.setItem('todoPlanHeight', String(nextHeight))
}

function stopResize() {
  resizing = false
  window.removeEventListener('pointermove', handleResize)
}

function handleShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 't') {
    event.preventDefault()
    toggleCollapsed()
  }
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (!deckOpen.value) return
  const target = event.target as Node | null
  if (!target) return
  if (panelLogoRef.value?.contains(target) || deckPopoverRef.value?.contains(target)) return
  deckOpen.value = false
}

function toggleCollapsed() {
  if (props.standalone) return
  collapsed.value = !collapsed.value
}

function expandFromEdge() {
  if (props.standalone) return
  collapsed.value = false
}

function collapseToEdge() {
  if (props.standalone) return
  if (pinned.value || docked.value || canDockInRightGutter.value) return
  collapsed.value = true
}

function updateRightGutterDocking() {
  if (props.standalone) {
    canDockInRightGutter.value = false
    return
  }
  const chatPanel = panelRef.value?.closest('.chat-panel') as HTMLElement | null
  if (!chatPanel) return
  const messageContent = chatPanel.querySelector('.message-list-content') as HTMLElement | null
  const panelRect = chatPanel.getBoundingClientRect()
  const contentRect = messageContent?.getBoundingClientRect()
  const rightGutter = contentRect
    ? Math.max(0, panelRect.right - contentRect.right)
    : 0
  canDockInRightGutter.value = rightGutter >= TODO_PANEL_WIDTH + TODO_PANEL_GAP
}

function shouldRefreshChanged(data: { scope: string; sessionId?: string; workingDirectory?: string }) {
  if (data.scope === 'global-user' || data.scope === 'all') return true
  if (data.scope === 'workspace-ai-todo') return (data.workingDirectory || '') === (effectiveWorkingDirectory.value || '')
  return false
}

onMounted(() => {
  loadSnapshot()
  if (props.standalone) {
    window.electronAPI.setTodoPlanWindowPinned(pinned.value)
  }
  updateRightGutterDocking()
  const chatPanel = panelRef.value?.closest('.chat-panel') as HTMLElement | null
  if (chatPanel) {
    resizeObserver = new ResizeObserver(updateRightGutterDocking)
    resizeObserver.observe(chatPanel)
  }
  cleanupChanged = window.electronAPI.onTodoPlanChanged((data) => {
    if (!shouldRefreshChanged(data)) return
    if (data.document) {
      applyDocument(data.document)
    } else {
      loadSnapshot()
    }
  })
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('pointerdown', handleOutsidePointerDown, true)
  window.addEventListener('todo-plan:toggle-card', toggleCollapsed)
})

onUnmounted(() => {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  resizeObserver?.disconnect()
  cleanupChanged?.()
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('pointerdown', handleOutsidePointerDown, true)
  window.removeEventListener('todo-plan:toggle-card', toggleCollapsed)
  window.removeEventListener('pointermove', handleResize)
})
</script>

<style scoped>
.todo-plan-panel {
  --todo-plan-nav-gutter: 52px;
  --todo-card-bg: var(--bg-elevated, var(--panel));
  --todo-card-bg-soft: color-mix(in srgb, var(--bg-elevated, var(--panel)) 92%, var(--bg) 8%);
  --todo-rule: var(--border, rgba(128, 128, 128, 0.24));
  --todo-rule-soft: color-mix(in srgb, var(--border, rgba(128, 128, 128, 0.24)) 58%, transparent);
  --todo-text: var(--text);
  --todo-muted: var(--muted);
  --todo-accent: var(--accent);
  --todo-accent-soft: rgba(var(--accent-rgb, 59, 130, 246), 0.14);
  --todo-accent-border: rgba(var(--accent-rgb, 59, 130, 246), 0.36);
  --todo-plan-width: 292px;
  --todo-plan-gap: 16px;

  position: absolute;
  top: 52px;
  right: 12px;
  z-index: calc(var(--z-dropdown, 100) + 2);
  width: min(var(--todo-plan-width), calc(100vw - var(--todo-plan-nav-gutter) - 18px));
  min-height: 200px;
  border: 1px solid var(--todo-rule);
  border-radius: 12px;
  background: var(--todo-card-bg);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
  color: var(--todo-text);
  overflow: hidden;
}

.todo-plan-panel.collapsed {
  top: 74px;
  right: 5px;
  width: 6px;
  height: 52px !important;
  min-height: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.todo-plan-panel.collapsed:hover {
  width: 8px;
  transform: translateX(-1px);
}

.todo-plan-panel.docked {
  top: 44px;
  right: 12px;
  bottom: 0;
  height: auto !important;
  border-radius: 12px 0 0 0;
}

.todo-plan-panel.gutter-docked:not(.collapsed) {
  right: max(
    12px,
    calc((100% - var(--chat-content-width, min(70%, 800px))) / 2 - var(--todo-plan-width) - var(--todo-plan-gap))
  );
  width: var(--todo-plan-width);
}

.todo-plan-panel.gutter-docked.docked:not(.collapsed) {
  right: max(
    12px,
    calc((100% - var(--chat-content-width, min(70%, 800px))) / 2 - var(--todo-plan-width) - var(--todo-plan-gap))
  );
}

.wake-button,
.icon-button,
.panel-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--todo-muted);
  background: transparent;
  cursor: pointer;
}

.wake-button {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--todo-muted) 26%, transparent);
  opacity: 0.7;
}

.wake-button::before {
  content: '';
  position: absolute;
  inset: -10px -6px;
  border-radius: 999px;
}

.wake-button:hover {
  background: color-mix(in srgb, var(--todo-accent) 46%, transparent);
  opacity: 1;
}

.panel-logo {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 8px;
  color: var(--todo-accent);
  background: var(--todo-accent-soft);
}

.icon-button {
  width: 23px;
  height: 23px;
  border-radius: 6px;
}

.icon-button:hover,
.wake-button:hover {
  color: var(--todo-text);
  background: var(--hover, color-mix(in srgb, var(--text) 8%, transparent));
}

.icon-button.active {
  color: var(--todo-accent);
  background: var(--todo-accent-soft);
}

.icon-button:focus,
.wake-button:focus,
.panel-logo:focus,
.deck-popover button:focus,
.ai-suggestion button:focus {
  outline: none;
}

.icon-button:focus-visible,
.wake-button:focus-visible,
.panel-logo:focus-visible,
.deck-popover button:focus-visible,
.ai-suggestion button:focus-visible {
  outline: 2px solid var(--todo-accent-border);
  outline-offset: 2px;
}

.panel-header {
  height: 50px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--todo-rule-soft);
  background: var(--todo-card-bg);
}

.todo-plan-panel.standalone .panel-header {
  padding-left: 96px;
  -webkit-app-region: drag;
}

.todo-plan-panel.standalone .panel-logo,
.todo-plan-panel.standalone .panel-actions,
.todo-plan-panel.standalone .deck-popover,
.todo-plan-panel.standalone .search-row,
.todo-plan-panel.standalone .panel-body,
.todo-plan-panel.standalone .quick-add,
.todo-plan-panel.standalone .resize-handle {
  -webkit-app-region: no-drag;
}

.panel-title {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  line-height: 1.18;
}

.panel-title strong {
  overflow: hidden;
  color: var(--todo-text);
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-title span {
  margin-top: 3px;
  overflow: hidden;
  color: var(--todo-muted);
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-actions {
  display: flex;
  gap: 3px;
}

.search-row {
  height: 30px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--todo-rule-soft);
  color: var(--todo-muted);
  background: var(--todo-card-bg-soft);
}

.search-row input,
.quick-add input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--todo-text);
  font: inherit;
}

.deck-popover {
  position: absolute;
  top: 42px;
  left: 10px;
  z-index: 3;
  width: 218px;
  max-height: min(360px, calc(100vh - 96px));
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--todo-rule);
  border-radius: 10px;
  background: var(--todo-card-bg);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.18);
}

.deck-popover button {
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  color: var(--todo-muted);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}

.deck-popover button.active,
.deck-popover button:hover {
  color: var(--todo-text);
  background: var(--todo-accent-soft);
}

.deck-popover span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deck-popover strong {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--todo-muted);
}

.deck-section-label {
  padding: 8px 8px 4px;
  color: var(--todo-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.deck-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 6px 0 2px;
}

.deck-actions button {
  justify-content: center;
  min-height: 26px;
  border: 1px solid var(--todo-rule-soft);
  font-size: 11px;
}

.panel-body {
  height: calc(100% - 50px);
  min-height: 120px;
  overflow: auto;
  background: var(--todo-card-bg);
}

.todo-plan-panel.searching .panel-body {
  height: calc(100% - 80px);
}

.todo-plan-panel.has-quick-add .panel-body {
  height: calc(100% - 90px);
}

.todo-plan-panel.searching.has-quick-add .panel-body {
  height: calc(100% - 120px);
}

.quick-add + .resize-handle,
.quick-add {
  border-top: 1px solid var(--todo-rule-soft);
}

.task-view {
  padding: 10px 12px 8px;
}

.task-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-section {
  min-width: 0;
}

.task-section h4 {
  margin: 0 0 6px;
  color: var(--todo-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.04em;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.task-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto 24px;
  align-items: center;
  column-gap: 9px;
  min-height: 28px;
  color: var(--todo-text);
  font-size: 12px;
  line-height: 1.45;
  cursor: pointer;
}

.task-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.task-check {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--todo-rule);
  border-radius: 7px;
  color: transparent;
  background: var(--todo-card-bg);
}

.task-row input:checked + .task-check {
  border-color: var(--todo-accent);
  color: var(--text-btn-primary, #fff);
  background: var(--todo-accent);
}

.task-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.task-row.done .task-text {
  color: var(--todo-muted);
  text-decoration: line-through;
}

.task-status {
  padding: 3px 7px;
  border: 1px solid var(--todo-accent-border);
  border-radius: 999px;
  color: var(--todo-accent);
  background: var(--todo-accent-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.task-delete {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  color: var(--todo-muted);
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.12s ease,
    color 0.12s ease,
    background-color 0.12s ease;
}

.task-row:hover .task-delete,
.task-delete:focus-visible {
  opacity: 0.72;
}

.task-delete:hover,
.task-delete:focus-visible {
  color: var(--todo-text);
  background: var(--hover, color-mix(in srgb, var(--text) 8%, transparent));
  opacity: 1;
  outline: none;
}

.ai-suggestion {
  margin-top: 10px;
  padding: 9px 10px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  border: 1px dashed var(--todo-rule);
  border-radius: 8px;
  color: var(--todo-muted);
  background: color-mix(in srgb, var(--todo-card-bg-soft) 82%, transparent);
  font-size: 11px;
  line-height: 1.4;
}

.ai-suggestion strong {
  color: var(--todo-text);
}

.ai-suggestion button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--todo-rule);
  border-radius: 999px;
  color: var(--todo-text);
  background: var(--todo-card-bg);
  cursor: pointer;
}

.quick-add {
  height: 40px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--todo-muted);
  background: var(--todo-card-bg-soft);
  font-size: 12px;
}

.quick-add span {
  flex: 0 0 auto;
  color: var(--todo-muted);
  font-size: 12px;
}

.markdown-editor {
  width: 100%;
  height: 100%;
  --editor-font-size: 13px;
  min-height: 120px;
  padding: 14px;
}

.markdown-editor :deep(.cm-editor),
.markdown-editor :deep(.cm-scroller) {
  height: 100%;
}

.empty-state {
  color: var(--todo-muted);
}

.resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 8px;
  cursor: ns-resize;
}

@media (max-width: 720px) {
  .todo-plan-panel {
    right: 8px;
    top: 46px;
    width: min(292px, calc(100vw - 16px));
    border-right: 0;
  }

  .todo-plan-panel.collapsed {
    right: 5px;
  }
}

@media (max-width: 520px) {
  .todo-plan-panel {
    left: auto;
    right: 6px;
    width: min(292px, calc(100vw - 12px));
    border-radius: 10px;
  }

  .panel-actions {
    gap: 2px;
  }
}
</style>
