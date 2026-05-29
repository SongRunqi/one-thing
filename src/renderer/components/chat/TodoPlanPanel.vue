<template>
  <section
    ref="panelRef"
    class="todo-plan-panel"
    :class="[
      `surface-${surface}`,
      {
        pinned,
        docked,
        collapsed,
        standalone: isStandalone,
        'find-open': findOpen,
        'switcher-open': switcherOpen,
        'action-panel-open': actionPanelOpen,
        'format-buffer-open': formatBufferOpen,
      },
    ]"
    :style="panelStyle"
    @mouseenter="handlePanelMouseEnter"
    @mouseleave="handlePanelMouseLeave"
    @keydown="handleShortcut"
  >
    <button
      v-if="collapsed"
      class="wake-button"
      type="button"
      title="Todo / Notes"
      aria-label="Show Todo / Notes"
      @click="collapsed = false"
    />

    <template v-else>
      <header class="panel-header">
        <div
          v-if="isStandalone"
          class="window-traffic-spacer"
          aria-hidden="true"
        />

        <div
          v-if="!isStandalone"
          class="title-display"
        >
          <span class="panel-title">
            <strong>{{ panelChromeTitle }}</strong>
            <span>{{ headerSummary }}</span>
          </span>
        </div>

        <div
          v-else
          class="window-title"
        >
          {{ displayTitle }}
        </div>

        <div class="panel-actions">
          <button
            class="icon-button"
            type="button"
            title="Command Panel"
            aria-label="Command Panel"
            @click="openActionPanel"
          >
            <Command :size="isStandalone ? 14 : 15" />
          </button>
          <button
            ref="titleButtonRef"
            class="icon-button"
            type="button"
            title="Browse notes"
            aria-label="Browse notes"
            @click="openSwitcher"
          >
            <FileText :size="isStandalone ? 14 : 15" />
          </button>
          <button
            class="icon-button"
            type="button"
            title="New note"
            aria-label="New note"
            @click="createNote"
          >
            <Plus :size="isStandalone ? 14 : 15" />
          </button>
          <button
            class="icon-button"
            :class="{ active: pinned }"
            type="button"
            :title="isStandalone ? (pinned ? 'Disable always on top' : 'Always on top') : (pinned ? 'Allow card to collapse' : 'Keep card open')"
            :aria-label="isStandalone ? (pinned ? 'Disable always on top' : 'Always on top') : (pinned ? 'Allow card to collapse' : 'Keep card open')"
            @click="togglePinned"
          >
            <Pin :size="isStandalone ? 14 : 15" />
          </button>
          <button
            v-if="!isStandalone"
            class="icon-button"
            :class="{ active: docked }"
            type="button"
            :title="docked ? 'Float card' : 'Dock card'"
            :aria-label="docked ? 'Float card' : 'Dock card'"
            @click="toggleDocked"
          >
            <PanelRight :size="15" />
          </button>
          <button
            v-if="!isStandalone"
            class="icon-button"
            type="button"
            title="Open in window"
            aria-label="Open in window"
            @click="openWindow"
          >
            <ExternalLink :size="15" />
          </button>
        </div>
      </header>

      <TodoNotesActionPanel
        :visible="actionPanelOpen"
        :query="actionQuery"
        :actions="todoActions"
        :surface="surface"
        @update:query="actionQuery = $event"
        @select="runAction"
        @close="closeActionPanel"
      />

      <div
        v-if="switcherOpen"
        ref="switcherRef"
        class="note-switcher"
      >
        <label class="switcher-search">
          <Search :size="14" />
          <input
            ref="switcherInputRef"
            v-model="switcherQuery"
            placeholder="Search for notes..."
            spellcheck="false"
            @keydown="handleSwitcherKeydown"
          >
        </label>

        <div class="switcher-list">
          <div class="switcher-header-row">
            <strong>Notes</strong>
            <span>
              {{ noteCountLabel }}
              <Info :size="16" />
            </span>
          </div>
          <div
            v-for="doc in filteredUserNotes"
            :key="doc.id"
            :class="['note-option', { active: activeId === doc.id, selected: switcherSelectedDocument?.id === doc.id }]"
            :data-note-id="doc.id"
            @mouseenter="selectSwitcherDocument(doc.id)"
          >
            <button
              class="note-option-main"
              type="button"
              @click="selectDocument(doc.id)"
            >
              <strong>{{ doc.title }}</strong>
              <small>
                <i :class="{ current: activeId === doc.id }" />
                {{ activeId === doc.id ? 'Current' : 'Note' }}
                <b>•</b>
                {{ doc.content.length }} Characters
              </small>
            </button>
            <div class="note-option-actions">
              <button
                :class="{ active: isNotePinned(doc.id) }"
                type="button"
                :title="isNotePinned(doc.id) ? 'Unpin note' : 'Pin note'"
                :aria-label="isNotePinned(doc.id) ? 'Unpin note' : 'Pin note'"
                @click="toggleNotePinned(doc.id)"
              >
                <Pin :size="16" />
              </button>
              <button
                type="button"
                title="Delete note"
                aria-label="Delete note"
                @click="deleteUserNote(doc.id)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>

          <div
            v-if="filteredSystemNotes.length"
            class="switcher-label"
          >
            System
          </div>
          <div
            v-for="doc in filteredSystemNotes"
            :key="doc.id"
            :class="['note-option', 'system', { active: activeId === doc.id, selected: switcherSelectedDocument?.id === doc.id }]"
            :data-note-id="doc.id"
            @mouseenter="selectSwitcherDocument(doc.id)"
          >
            <button
              class="note-option-main"
              type="button"
              @click="selectDocument(doc.id)"
            >
              <strong>AI Todo</strong>
              <small>
                <i :class="{ current: activeId === doc.id }" />
                {{ activeId === doc.id ? 'Current' : 'System' }}
                <b>•</b>
                {{ doc.content.length }} Characters
              </small>
            </button>
            <div class="note-option-actions">
              <Bot :size="16" />
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="findOpen"
        ref="findBarRef"
        class="floating-find-bar"
      >
        <Search :size="14" />
        <input
          ref="findInputRef"
          v-model="findQuery"
          placeholder="Find"
          spellcheck="false"
          @keydown="handleFindKeydown"
        >
        <span>{{ findStatus }}</span>
        <button
          class="mini-button"
          type="button"
          title="Previous match"
          aria-label="Previous match"
          @click="moveFind(-1)"
        >
          <ChevronUp :size="14" />
        </button>
        <button
          class="mini-button"
          type="button"
          title="Next match"
          aria-label="Next match"
          @click="moveFind(1)"
        >
          <ChevronDown :size="14" />
        </button>
        <button
          class="mini-button"
          type="button"
          title="Close find"
          aria-label="Close find"
          @click="closeFind"
        >
          <X :size="14" />
        </button>
      </div>

      <div
        ref="bodyRef"
        class="panel-body"
      >
        <MarkdownDocumentEditor
          ref="editorRef"
          :model-value="draft"
          class="markdown-editor"
          surface="todo-notes"
          :document-id="activeDocument?.id || 'todo-notes'"
          :document-path="activeDocument?.filePath || ''"
          :workspace-root="snapshot?.directory || effectiveWorkingDirectory || ''"
          :settings="editorSettings"
          :features="todoMarkdownFeatures"
          :toolbar="false"
          placeholder="# Untitled Note"
          :min-height="120"
          :max-height="100000"
          :spellcheck="true"
          @update:model-value="handleDraftUpdate"
          @keydown="handleEditorKeydown"
          @paste="handleMarkdownPaste"
          @open-link="openMarkdownLink"
          @open-image="openMarkdownImage"
          @cancel="handleEscape"
        />
      </div>

      <footer
        class="note-footer"
        :class="{ formatting: formatBufferOpen }"
      >
        <div
          v-if="formatBufferOpen"
          class="format-buffer"
          role="toolbar"
          aria-label="Markdown formatting"
        >
          <button
            class="format-command heading-command"
            type="button"
            title="Heading 1"
            aria-label="Heading 1"
            @mousedown.prevent
            @click="runFormatCommand('heading-1')"
          >
            <span>H</span>
            <ChevronDown :size="12" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Bold"
            aria-label="Bold"
            @mousedown.prevent
            @click="runFormatCommand('bold')"
          >
            <Bold :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Italic"
            aria-label="Italic"
            @mousedown.prevent
            @click="runFormatCommand('italic')"
          >
            <Italic :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Strikethrough"
            aria-label="Strikethrough"
            @mousedown.prevent
            @click="runFormatCommand('strikethrough')"
          >
            <Strikethrough :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Underline"
            aria-label="Underline"
            @mousedown.prevent
            @click="runFormatCommand('underline')"
          >
            <Underline :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Inline code"
            aria-label="Inline code"
            @mousedown.prevent
            @click="runFormatCommand('inline-code')"
          >
            <Code2 :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Link"
            aria-label="Link"
            @mousedown.prevent
            @click="runFormatCommand('link')"
          >
            <Link :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Code block"
            aria-label="Code block"
            @mousedown.prevent
            @click="runFormatCommand('code-block')"
          >
            <Code2 :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Quote"
            aria-label="Quote"
            @mousedown.prevent
            @click="runFormatCommand('blockquote')"
          >
            <Quote :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Bulleted list"
            aria-label="Bulleted list"
            @mousedown.prevent
            @click="runFormatCommand('bullet-list')"
          >
            <List :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Numbered list"
            aria-label="Numbered list"
            @mousedown.prevent
            @click="runFormatCommand('ordered-list')"
          >
            <ListOrdered :size="16" />
          </button>
          <button
            class="format-command"
            type="button"
            title="Task list"
            aria-label="Task list"
            @mousedown.prevent
            @click="runFormatCommand('task-list')"
          >
            <ListChecks :size="16" />
          </button>
          <span class="format-separator" />
          <button
            class="format-command close-format"
            type="button"
            title="Hide formatting bar"
            aria-label="Hide formatting bar"
            @click="formatBufferOpen = false"
          >
            <X :size="16" />
          </button>
        </div>
        <template v-else>
          <span>{{ characterCountLabel }}</span>
          <button
            class="format-toggle"
            type="button"
            title="Show formatting bar"
            aria-label="Show formatting bar"
            @click="toggleFormatBuffer"
          >
            <Type :size="21" />
          </button>
        </template>
      </footer>

      <div
        v-if="surface === 'chat-floating-card'"
        class="resize-handle"
        title="Resize card"
        @pointerdown="startResize"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Bot,
  Bold,
  ChevronDown,
  ChevronUp,
  Code2,
  Command,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Info,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  PanelRight,
  Pencil,
  Pin,
  Plus,
  Quote,
  Search,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline,
  X,
} from 'lucide-vue-next'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { copyTextToClipboard } from '@/utils/clipboard'
import type { TodoPlanDocument, TodoPlanSnapshot } from '@/types'
import MarkdownDocumentEditor from '@/editor/MarkdownDocumentEditor.vue'
import type { MarkdownCommand, MarkdownDocumentEditorHandle, MarkdownFeatureSet } from '@/editor/markdown-document'
import { handleMarkdownAttachmentPaste } from '@/editor/markdown-attachments'
import type { MarkdownAssetResolution } from '@shared/ipc/markdown'
import TodoNotesActionPanel from './TodoNotesActionPanel.vue'
import {
  findMarkdownMatches,
  parseTasks,
  titleFromMarkdown,
  type TodoPlanSurface,
} from './todo-plan-utils'
import type {
  TodoNotesAction,
  TodoNotesSurfaceActionContext,
} from './todo-notes-actions'

const props = defineProps<{
  sessionId?: string
  workingDirectory?: string
  standalone?: boolean
}>()

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const storagePrefix = props.standalone ? 'todoPlanWindow' : 'todoPlanCard'
const legacyChatStorage: Record<string, string> = {
  ActiveId: 'todoPlanActiveId',
  Pinned: 'todoPlanPinned',
  Docked: 'todoPlanDocked',
  Collapsed: 'todoPlanCollapsed',
  Height: 'todoPlanHeight',
}
const PINNED_NOTES_STORAGE_KEY = 'todoPlanPinnedNoteIds'

function storageKey(name: string): string {
  return `${storagePrefix}${name}`
}

function readStorage(name: string, fallback = ''): string {
  const scoped = localStorage.getItem(storageKey(name))
  if (scoped !== null) return scoped
  const legacyKey = props.standalone ? undefined : legacyChatStorage[name]
  return (legacyKey ? localStorage.getItem(legacyKey) : null) ?? fallback
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const TODO_PANEL_DEFAULT_HEIGHT = 320
const TODO_PANEL_LEGACY_DEFAULT_HEIGHT = 360
const TODO_PANEL_MIN_HEIGHT = 220
const TODO_PANEL_MAX_HEIGHT = 620

function readPanelHeight(): number {
  const raw = readStorage('Height')
  if (!raw) return TODO_PANEL_DEFAULT_HEIGHT
  const value = Number(raw)
  if (!Number.isFinite(value)) return TODO_PANEL_DEFAULT_HEIGHT
  if (value === TODO_PANEL_LEGACY_DEFAULT_HEIGHT) return TODO_PANEL_DEFAULT_HEIGHT
  return clampNumber(value, TODO_PANEL_MIN_HEIGHT, TODO_PANEL_MAX_HEIGHT)
}

const snapshot = ref<TodoPlanSnapshot | null>(null)
const activeId = ref(readStorage('ActiveId'))
const draft = ref('')
const pinned = ref(props.standalone ? true : readStorage('Pinned', 'false') === 'true')
const docked = ref(!props.standalone && readStorage('Docked', 'false') === 'true')
const collapsed = ref(props.standalone ? false : readStorage('Collapsed', 'true') !== 'false')
const panelHeight = ref(readPanelHeight())
const switcherOpen = ref(false)
const switcherQuery = ref('')
const switcherSelectedIndex = ref(0)
const actionPanelOpen = ref(false)
const actionQuery = ref('')
const formatBufferOpen = ref(false)
const pinnedNoteIds = ref<Set<string>>(readPinnedNoteIds())
const findOpen = ref(false)
const findQuery = ref('')
const activeFindIndex = ref(0)
const panelRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const titleButtonRef = ref<HTMLElement | null>(null)
const switcherRef = ref<HTMLElement | null>(null)
const switcherInputRef = ref<HTMLInputElement | null>(null)
const findBarRef = ref<HTMLElement | null>(null)
const findInputRef = ref<HTMLInputElement | null>(null)
const editorRef = ref<MarkdownDocumentEditorHandle | null>(null)
let cleanupChanged: (() => void) | undefined
let saveTimer: ReturnType<typeof setTimeout> | null = null
let resizing = false
let resizeStartY = 0
let resizeStartHeight = 0
let loadedDocumentId = ''
const todoMarkdownFeatures: MarkdownFeatureSet = {
  tasks: true,
  tables: true,
  images: true,
  math: true,
  codeBlocks: true,
  frontmatter: true,
}
const editorSettings = computed(() => settingsStore.settings.general.editor)

const isStandalone = computed(() => props.standalone === true)
const surface = computed<TodoPlanSurface>(() => {
  if (isStandalone.value) return 'standalone-window'
  return docked.value ? 'chat-docked-card' : 'chat-floating-card'
})
const panelStyle = computed(() => {
  if (collapsed.value || isStandalone.value || docked.value) return {}
  return { height: `${panelHeight.value}px` }
})
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId || undefined)
const effectiveWorkingDirectory = computed(() => {
  if (props.workingDirectory !== undefined) return props.workingDirectory || undefined
  const session = sessionsStore.sessions.find(item => item.id === effectiveSessionId.value)
  return session?.workingDirectory || undefined
})
const allDocuments = computed(() => {
  if (!snapshot.value) return []
  return [...snapshot.value.userNotes, snapshot.value.workspaceAiTodo]
})
const activeDocument = computed(() => allDocuments.value.find(doc => doc.id === activeId.value) || allDocuments.value[0])
const tasks = computed(() => parseTasks(draft.value))
const openTaskCount = computed(() => tasks.value.filter(task => !task.done).length)
const displayTitle = computed(() => titleFromMarkdown(draft.value, activeDocument.value?.title || 'Todo / Notes'))
const panelChromeTitle = computed(() => 'Notes')
const headerSummary = computed(() => {
  const kind = activeDocument.value?.scope === 'workspace-ai-todo' ? 'AI Todo' : 'Markdown note'
  if (!tasks.value.length) return kind
  if (!openTaskCount.value) return 'All tasks done'
  const taskLabel = openTaskCount.value === 1 ? 'task' : 'tasks'
  return `${openTaskCount.value} open ${taskLabel}`
})
const noteCountLabel = computed(() => {
  const count = snapshot.value?.userNotes.length || 0
  const label = count === 1 ? 'Note' : 'Notes'
  return `${count} ${label}`
})
const characterCountLabel = computed(() => `${draft.value.length} characters`)
const actionContext = computed<TodoNotesSurfaceActionContext>(() => ({
  surface: surface.value,
  activeDocument: activeDocument.value,
  selection: editorRef.value?.getSelection() || { from: 0, to: 0 },
  canEditNote: Boolean(activeDocument.value),
  canDeleteNote: activeDocument.value?.scope === 'user-note',
  pinned: pinned.value,
  docked: docked.value,
}))
const todoActions = computed<TodoNotesAction[]>(() => {
  const context = actionContext.value
  const canDelete = context.canDeleteNote
  return [
    {
      id: 'create-note',
      title: 'Create Note',
      subtitle: 'Start a new Markdown note',
      group: 'Note Actions',
      shortcut: '⌘N',
      icon: Plus,
      keywords: ['new', 'add'],
      run: createNote,
    },
    {
      id: 'rename-note',
      title: 'Rename Note',
      subtitle: canDelete ? 'Rename the current user note' : 'Only user notes can be renamed',
      group: 'Note Actions',
      icon: Pencil,
      enabled: canDelete,
      keywords: ['title'],
      run: renameNote,
    },
    {
      id: 'delete-note',
      title: 'Delete Note',
      subtitle: canDelete ? 'Delete the current user note' : 'System notes cannot be deleted',
      group: 'Note Actions',
      icon: Trash2,
      enabled: canDelete,
      keywords: ['remove'],
      run: deleteNote,
    },
    {
      id: 'reveal-notes-folder',
      title: 'Reveal Notes Folder',
      subtitle: 'Open the Markdown storage directory',
      group: 'Note Actions',
      icon: FolderOpen,
      keywords: ['folder', 'directory', 'files'],
      run: revealNotesFolder,
    },
    {
      id: 'copy-markdown',
      title: 'Copy Markdown',
      subtitle: 'Copy the current note as Markdown',
      group: 'Note Actions',
      icon: Copy,
      keywords: ['clipboard', 'copy text'],
      run: copyMarkdown,
    },
    markdownAction('bold', 'Bold', 'bold', 'Markdown Formatting', Bold, '⌘B'),
    markdownAction('italic', 'Italic', 'italic', 'Markdown Formatting', Italic, '⌘I'),
    markdownAction('strikethrough', 'Strikethrough', 'strikethrough', 'Markdown Formatting', Strikethrough),
    markdownAction('underline', 'Underline', 'underline', 'Markdown Formatting', Underline, '⌘U'),
    markdownAction('inline-code', 'Inline Code', 'inline-code', 'Markdown Formatting', Code2, '⌘E'),
    markdownAction('link', 'Link', 'link', 'Markdown Formatting', Link),
    markdownAction('heading-1', 'Heading 1', 'heading-1', 'Markdown Formatting', Heading1, '⌥⌘1'),
    markdownAction('heading-2', 'Heading 2', 'heading-2', 'Markdown Formatting', Heading2, '⌥⌘2'),
    markdownAction('heading-3', 'Heading 3', 'heading-3', 'Markdown Formatting', Heading3, '⌥⌘3'),
    markdownAction('bullet-list', 'Bulleted List', 'bullet-list', 'Insert', List, '⇧⌘8'),
    markdownAction('ordered-list', 'Numbered List', 'ordered-list', 'Insert', ListOrdered, '⇧⌘7'),
    markdownAction('task-list', 'Task List', 'task-list', 'Insert', ListChecks, '⇧⌘9'),
    markdownAction('blockquote', 'Quote', 'blockquote', 'Insert', Quote),
    markdownAction('code-block', 'Code Block', 'code-block', 'Insert', Code2),
    markdownAction('table', 'Table', 'table', 'Insert', Table2),
    markdownAction('image', 'Image', 'image', 'Insert', Image),
    markdownAction('divider', 'Divider', 'horizontal-rule', 'Insert', Minus),
    {
      id: 'browse-notes',
      title: 'Browse Notes',
      subtitle: 'Open the notes switcher',
      group: 'Navigation',
      shortcut: '⌘P',
      icon: FileText,
      keywords: ['switch', 'open note'],
      run: openSwitcher,
    },
    {
      id: 'find-in-note',
      title: 'Find in Note',
      subtitle: 'Search the current note',
      group: 'Navigation',
      shortcut: '⌘F',
      icon: Search,
      keywords: ['search'],
      run: openFind,
    },
    {
      id: 'keep-card-open',
      title: pinned.value ? 'Allow Card to Collapse' : 'Keep Card Open',
      subtitle: 'Toggle chat card pinning',
      group: 'Window/Card',
      icon: Pin,
      visible: !isStandalone.value,
      keywords: ['pin'],
      run: togglePinned,
    },
    {
      id: 'dock-card',
      title: docked.value ? 'Float Card' : 'Dock Card',
      subtitle: 'Toggle docked chat card layout',
      group: 'Window/Card',
      icon: PanelRight,
      visible: !isStandalone.value,
      keywords: ['dock', 'float'],
      run: toggleDocked,
    },
    {
      id: 'open-window',
      title: 'Open in Window',
      subtitle: 'Open the standalone Todo / Notes window',
      group: 'Window/Card',
      icon: ExternalLink,
      visible: !isStandalone.value,
      keywords: ['standalone'],
      run: openWindow,
    },
  ]
})
const sortedUserNotes = computed(() => {
  const notes = snapshot.value?.userNotes || []
  return [...notes].sort((a, b) => {
    const pinnedDelta = Number(isNotePinned(b.id)) - Number(isNotePinned(a.id))
    if (pinnedDelta !== 0) return pinnedDelta
    return b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)
  })
})
const filteredUserNotes = computed(() => {
  const query = switcherQuery.value.trim().toLowerCase()
  const notes = sortedUserNotes.value
  if (!query) return notes
  return notes.filter(note => documentMatchesQuery(note, query))
})
const filteredSystemNotes = computed(() => {
  const document = snapshot.value?.workspaceAiTodo
  if (!document) return []
  const query = switcherQuery.value.trim().toLowerCase()
  if (!query || documentMatchesQuery(document, query)) return [document]
  return []
})
const switcherDocuments = computed(() => [
  ...filteredUserNotes.value,
  ...filteredSystemNotes.value,
])
const switcherSelectedDocument = computed(() => switcherDocuments.value[switcherSelectedIndex.value])
const switcherDocumentSignature = computed(() => switcherDocuments.value.map(doc => doc.id).join('\u0000'))
watch([switcherQuery, switcherDocumentSignature], () => {
  if (!switcherOpen.value) return
  resetSwitcherSelection()
})
const findMatches = computed(() => findMarkdownMatches(draft.value, findQuery.value))
const findStatus = computed(() => {
  if (!findQuery.value.trim()) return '0/0'
  if (!findMatches.value.length) return '0/0'
  return `${activeFindIndex.value + 1}/${findMatches.value.length}`
})

function documentMatchesQuery(document: TodoPlanDocument, query: string): boolean {
  return document.title.toLowerCase().includes(query) ||
    document.content.toLowerCase().includes(query)
}

watch(activeDocument, (doc) => {
  if (!doc || doc.id === loadedDocumentId) return
  loadedDocumentId = doc.id
  draft.value = doc.content || ''
}, { immediate: true })

watch([pinned, docked, collapsed], () => {
  localStorage.setItem(storageKey('Pinned'), String(pinned.value))
  if (!isStandalone.value) {
    localStorage.setItem(storageKey('Docked'), String(docked.value))
    localStorage.setItem(storageKey('Collapsed'), String(collapsed.value))
  }
})

watch([effectiveSessionId, effectiveWorkingDirectory], () => {
  loadSnapshot()
})

watch(findQuery, () => {
  activeFindIndex.value = 0
  selectActiveFindMatch()
})

watch(activeFindIndex, () => {
  selectActiveFindMatch()
})

async function loadSnapshot() {
  const response = await window.electronAPI.getTodoPlan({
    sessionId: effectiveSessionId.value,
    workingDirectory: effectiveWorkingDirectory.value,
  })
  if (!response.success || !response.snapshot) return
  snapshot.value = response.snapshot
  if (!allDocuments.value.some(doc => doc.id === activeId.value)) {
    selectDocument(response.snapshot.userNotes[0]?.id || response.snapshot.workspaceAiTodo.id, false)
  }
}

function readPinnedNoteIds(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_NOTES_STORAGE_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function writePinnedNoteIds(ids: Set<string>) {
  localStorage.setItem(PINNED_NOTES_STORAGE_KEY, JSON.stringify([...ids]))
}

function isNotePinned(id: string): boolean {
  return pinnedNoteIds.value.has(id)
}

function toggleNotePinned(id: string) {
  const next = new Set(pinnedNoteIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  pinnedNoteIds.value = next
  writePinnedNoteIds(next)
}

function selectDocument(id: string, closeSwitcher = true) {
  activeId.value = id
  localStorage.setItem(storageKey('ActiveId'), id)
  const document = allDocuments.value.find(doc => doc.id === id)
  loadedDocumentId = id
  draft.value = document?.content || ''
  findQuery.value = ''
  if (closeSwitcher) switcherOpen.value = false
  nextTick(() => {
    editorRef.value?.focus()
  })
}

function markdownAction(
  id: string,
  title: string,
  command: MarkdownCommand,
  group: TodoNotesAction['group'],
  icon: TodoNotesAction['icon'],
  shortcut?: string,
): TodoNotesAction {
  return {
    id,
    title,
    subtitle: 'Format the current Markdown selection',
    group,
    shortcut,
    icon,
    markdownCommand: command,
    keywords: [command, 'markdown', 'format'],
    enabled: Boolean(activeDocument.value),
    run: () => applyEditorCommand(command),
  }
}

function applyEditorCommand(command: MarkdownCommand) {
  editorRef.value?.applyCommand(command)
}

function handleDraftUpdate(value: string) {
  draft.value = value
  scheduleSave()
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveDraft, 260)
}

async function saveDraft() {
  saveTimer = null
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
  const currentDocument = activeDocument.value
  const isActiveDocument = currentDocument?.id === document.id
  const hasLocalDraftChanges = isActiveDocument && draft.value !== (currentDocument.content || '')

  if (document.scope === 'user-note') {
    const nextNotes = snapshot.value.userNotes.some(note => note.id === document.id)
      ? snapshot.value.userNotes.map(note => note.id === document.id ? document : note)
      : [...snapshot.value.userNotes, document]
    snapshot.value = { ...snapshot.value, userNotes: nextNotes }
  } else if (document.scope === 'workspace-ai-todo') {
    snapshot.value = { ...snapshot.value, workspaceAiTodo: document }
  }

  if (isActiveDocument && !hasLocalDraftChanges) {
    loadedDocumentId = document.id
    draft.value = document.content || ''
  }
}

async function createNote() {
  const title = 'Untitled Note'
  const response = await window.electronAPI.createTodoPlanNote({
    title,
    content: `# ${title}\n\n`,
  })
  if (response.success && response.document) {
    applyDocument(response.document)
    selectDocument(response.document.id)
    nextTick(() => {
      editorRef.value?.focus()
      editorRef.value?.setSelection(response.document?.content.length || draft.value.length)
    })
  }
}

async function renameNote() {
  const document = activeDocument.value
  if (!document || document.scope !== 'user-note') return
  const title = window.prompt('Rename note', displayTitle.value)
  if (!title?.trim()) return
  const response = await window.electronAPI.renameTodoPlanNote({ id: document.id, title })
  if (response.success && response.document) {
    loadedDocumentId = ''
    await loadSnapshot()
    selectDocument(response.document.id)
  }
}

async function deleteNote() {
  const document = activeDocument.value
  if (!document || document.scope !== 'user-note') return
  await deleteUserNote(document.id)
}

async function deleteUserNote(id: string) {
  const document = snapshot.value?.userNotes.find(note => note.id === id)
  if (!document) return
  if (!window.confirm(`Delete "${document.title}"?`)) return
  const response = await window.electronAPI.deleteTodoPlanNote({ id: document.id })
  if (response.success) {
    loadedDocumentId = ''
    await loadSnapshot()
  }
}

function openSwitcher() {
  actionPanelOpen.value = false
  formatBufferOpen.value = false
  switcherOpen.value = true
  switcherQuery.value = ''
  resetSwitcherSelection()
  nextTick(() => {
    switcherInputRef.value?.focus()
    switcherInputRef.value?.select()
    scrollSelectedSwitcherDocumentIntoView()
  })
}

function closeSwitcher() {
  switcherOpen.value = false
}

function resetSwitcherSelection() {
  const documents = switcherDocuments.value
  if (!documents.length) {
    switcherSelectedIndex.value = 0
    return
  }
  const activeIndex = documents.findIndex(doc => doc.id === activeId.value)
  switcherSelectedIndex.value = activeIndex >= 0 ? activeIndex : 0
  scrollSelectedSwitcherDocumentIntoView()
}

function moveSwitcherSelection(direction: number) {
  const documents = switcherDocuments.value
  if (!documents.length) return
  switcherSelectedIndex.value = (switcherSelectedIndex.value + direction + documents.length) % documents.length
  scrollSelectedSwitcherDocumentIntoView()
}

function selectSwitcherDocument(id: string) {
  const index = switcherDocuments.value.findIndex(doc => doc.id === id)
  if (index >= 0) switcherSelectedIndex.value = index
}

function scrollSelectedSwitcherDocumentIntoView() {
  if (!switcherOpen.value) return
  nextTick(() => {
    const id = switcherSelectedDocument.value?.id
    if (!id) return
    const option = [...(switcherRef.value?.querySelectorAll<HTMLElement>('.note-option') || [])]
      .find(element => element.dataset.noteId === id)
    option?.scrollIntoView({ block: 'nearest' })
  })
}

function openActionPanel() {
  actionPanelOpen.value = true
  actionQuery.value = ''
  switcherOpen.value = false
  findOpen.value = false
  formatBufferOpen.value = false
}

function closeActionPanel(focusEditor = true) {
  actionPanelOpen.value = false
  actionQuery.value = ''
  if (focusEditor) nextTick(() => editorRef.value?.focus())
}

async function runAction(action: TodoNotesAction) {
  if (action.enabled === false) return
  actionPanelOpen.value = false
  actionQuery.value = ''
  await action.run()
  if (!switcherOpen.value && !findOpen.value) {
    nextTick(() => editorRef.value?.focus())
  }
}

function openFind() {
  actionPanelOpen.value = false
  formatBufferOpen.value = false
  findOpen.value = true
  nextTick(() => {
    findInputRef.value?.focus()
    findInputRef.value?.select()
    selectActiveFindMatch()
  })
}

function closeFind() {
  findOpen.value = false
  findQuery.value = ''
  nextTick(() => editorRef.value?.focus())
}

function toggleFormatBuffer() {
  formatBufferOpen.value = !formatBufferOpen.value
  if (formatBufferOpen.value) {
    actionPanelOpen.value = false
    switcherOpen.value = false
    findOpen.value = false
    nextTick(() => editorRef.value?.focus())
  }
}

function runFormatCommand(command: MarkdownCommand) {
  applyEditorCommand(command)
}

async function revealNotesFolder() {
  await window.electronAPI.revealTodoPlanDirectory?.()
}

async function copyMarkdown() {
  const success = await copyTextToClipboard(draft.value)
  if (!success) {
    console.warn('[TodoPlanPanel] Failed to copy markdown')
  }
}

function moveFind(direction: number) {
  if (!findMatches.value.length) return
  activeFindIndex.value = (activeFindIndex.value + direction + findMatches.value.length) % findMatches.value.length
}

function selectActiveFindMatch() {
  const match = findMatches.value[activeFindIndex.value]
  if (!findOpen.value || !match) return
  nextTick(() => editorRef.value?.setSelection(match.from, match.to))
}

function handleFindKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeFind()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    moveFind(event.shiftKey ? -1 : 1)
  }
}

function handleSwitcherKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSwitcher()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveSwitcherSelection(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveSwitcherSelection(-1)
    return
  }
  if (event.key !== 'Enter') return
  if (switcherSelectedDocument.value) {
    event.preventDefault()
    selectDocument(switcherSelectedDocument.value.id)
  }
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  const command = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()

  if (command && key === 'f') {
    event.preventDefault()
    openFind()
    return
  }
  if (command && key === 'p') {
    event.preventDefault()
    openSwitcher()
    return
  }
  if (command && key === 'k') {
    event.preventDefault()
    openActionPanel()
    return
  }
  if (command && key === 'n') {
    event.preventDefault()
    createNote()
    return
  }
}

async function handleMarkdownPaste(event: ClipboardEvent) {
  await handleMarkdownAttachmentPaste({
    event,
    editor: editorRef.value,
    documentPath: activeDocument.value?.filePath,
    workspaceRoot: snapshot.value?.directory || effectiveWorkingDirectory.value,
  })
}

async function resolveMarkdownLink(href: string, asset?: MarkdownAssetResolution | null) {
  if (asset) return asset
  const documentPath = activeDocument.value?.filePath
  if (!documentPath) return null
  const response = await window.electronAPI.resolveMarkdownAsset({
    documentPath,
    workspaceRoot: snapshot.value?.directory || effectiveWorkingDirectory.value,
    rawTarget: href,
  })
  return response.success ? response.asset || null : null
}

async function openMarkdownLink(payload: { href: string; asset?: MarkdownAssetResolution | null }) {
  const asset = await resolveMarkdownLink(payload.href, payload.asset)
  if (asset?.kind === 'external') {
    await window.electronAPI.openExternal(asset.href || payload.href)
    return
  }
  if (asset?.absolutePath) {
    await window.electronAPI.openPath(asset.absolutePath)
    return
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(payload.href)) {
    await window.electronAPI.openExternal(payload.href)
  }
}

async function openMarkdownImage(payload: { src: string; alt: string; asset?: MarkdownAssetResolution | null }) {
  await window.electronAPI.openImagePreview(payload.asset?.dataUrl || payload.src, payload.alt)
}

function handleShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return
  const target = event.target as Node | null
  const isInPanel = isStandalone.value || (target && panelRef.value?.contains(target))
  const command = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()

  if (command && event.shiftKey && key === 't' && !isStandalone.value) {
    event.preventDefault()
    toggleCollapsed()
    return
  }
  if (!isInPanel) return

  if (command && key === 'f') {
    event.preventDefault()
    openFind()
    return
  }
  if (command && key === 'p') {
    event.preventDefault()
    openSwitcher()
    return
  }
  if (command && key === 'k') {
    event.preventDefault()
    openActionPanel()
    return
  }
  if (command && key === 'n') {
    event.preventDefault()
    createNote()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    handleEscape()
  }
}

function handleEscape() {
  if (actionPanelOpen.value) {
    closeActionPanel()
    return
  }
  if (findOpen.value) {
    closeFind()
    return
  }
  if (switcherOpen.value) {
    closeSwitcher()
    return
  }
  if (formatBufferOpen.value) {
    formatBufferOpen.value = false
    nextTick(() => editorRef.value?.focus())
    return
  }
  if (isStandalone.value) {
    window.electronAPI.hideTodoPlanWindow?.({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    })
    return
  }
  collapseToEdge()
}

function handleOutsidePointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (actionPanelOpen.value) {
    const actionPanel = panelRef.value?.querySelector('.todo-notes-action-panel')
    if (actionPanel?.contains(target)) return
    actionPanelOpen.value = false
  }
  if (switcherOpen.value) {
    if (titleButtonRef.value?.contains(target) || switcherRef.value?.contains(target)) return
    switcherOpen.value = false
  }
  if (findOpen.value) {
    if (findBarRef.value?.contains(target)) return
  }
  if (formatBufferOpen.value && panelRef.value && !panelRef.value.contains(target)) {
    formatBufferOpen.value = false
  }
}

function togglePinned() {
  pinned.value = !pinned.value
  if (pinned.value) collapsed.value = false
  if (isStandalone.value) {
    window.electronAPI.setTodoPlanWindowPinned(pinned.value)
  }
}

function toggleDocked() {
  if (isStandalone.value) return
  docked.value = !docked.value
  if (docked.value) collapsed.value = false
}

function openWindow() {
  window.electronAPI.openTodoPlanWindow({
    activation: 'focus-if-app-active',
    preserveMainWindowVisibility: true,
  })
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
  const nextHeight = clampNumber(
    resizeStartHeight + event.clientY - resizeStartY,
    TODO_PANEL_MIN_HEIGHT,
    TODO_PANEL_MAX_HEIGHT,
  )
  panelHeight.value = nextHeight
  localStorage.setItem(storageKey('Height'), String(nextHeight))
}

function stopResize() {
  resizing = false
  window.removeEventListener('pointermove', handleResize)
}

function toggleCollapsed() {
  if (isStandalone.value) return
  collapsed.value = !collapsed.value
}

function expandFromEdge() {
  if (isStandalone.value) return
  collapsed.value = false
}

function collapseToEdge() {
  if (isStandalone.value) return
  if (pinned.value || docked.value) return
  collapsed.value = true
}

function handlePanelMouseEnter() {
  expandFromEdge()
}

function handlePanelMouseLeave() {
  collapseToEdge()
}

function shouldRefreshChanged(data: { scope: string; sessionId?: string; workingDirectory?: string }) {
  if (data.scope === 'global-user' || data.scope === 'all') return true
  if (data.scope === 'workspace-ai-todo') return (data.workingDirectory || '') === (effectiveWorkingDirectory.value || '')
  return false
}

onMounted(() => {
  loadSnapshot()
  if (isStandalone.value) {
    window.electronAPI.setTodoPlanWindowPinned(pinned.value)
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
  if (!isStandalone.value) {
    window.addEventListener('todo-plan:toggle-card', toggleCollapsed)
  }
})

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
  cleanupChanged?.()
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('pointerdown', handleOutsidePointerDown, true)
  if (!isStandalone.value) {
    window.removeEventListener('todo-plan:toggle-card', toggleCollapsed)
  }
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
  --todo-plan-width: 280px;
  --todo-popover-top: 44px;
  --todo-popover-width: min(430px, calc(100% - 18px));
  --todo-popover-radius: 12px;
  --todo-popover-shadow: 0 16px 42px rgba(0, 0, 0, 0.2);
  --todo-popover-search-height: 38px;
  --todo-popover-search-padding-x: 12px;
  --todo-popover-search-gap: 8px;
  --todo-popover-search-font-size: 13px;
  --todo-switcher-popover-max-height: min(286px, calc(100vh - 94px));
  --todo-action-popover-max-height: min(286px, calc(100vh - 94px));

  position: absolute;
  top: 52px;
  right: 12px;
  z-index: calc(var(--z-dropdown, 100) + 2);
  width: min(var(--todo-plan-width), calc(100vw - var(--todo-plan-nav-gutter) - 18px));
  min-height: 220px;
  border: 1px solid var(--todo-rule);
  border-radius: 14px;
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

.todo-plan-panel.standalone {
  --todo-card-bg: color-mix(in srgb, var(--bg-elevated, var(--panel)) 92%, #f5f0dd 8%);
  --todo-card-bg-soft: color-mix(in srgb, var(--todo-card-bg) 86%, #fff 14%);
  --todo-popover-top: clamp(58px, 12vh, 88px);
  --todo-popover-width: min(520px, calc(100% - 56px));
  --todo-popover-radius: 14px;
  --todo-popover-shadow: 0 18px 52px rgba(0, 0, 0, 0.22);
  --todo-popover-search-height: 46px;
  --todo-popover-search-padding-x: 16px;
  --todo-popover-search-gap: 10px;
  --todo-popover-search-font-size: 15px;
  --todo-switcher-popover-max-height: min(330px, calc(100vh - 94px));
  --todo-action-popover-max-height: min(330px, calc(100vh - 94px));

  width: 100%;
  min-height: 100%;
  border-radius: 22px;
  box-shadow: none;
}

.wake-button,
.icon-button,
.mini-button,
.note-option-main,
.note-option-actions button,
.format-toggle,
.format-command {
  border: 0;
  color: var(--todo-muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
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

.panel-header {
  position: relative;
  height: 50px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--todo-rule-soft);
  background: var(--todo-card-bg);
}

.todo-plan-panel.standalone .panel-header {
  height: 30px;
  padding: 0 10px 0 0;
  border-bottom: 0;
  background: color-mix(in srgb, var(--todo-card-bg) 84%, transparent);
  -webkit-app-region: drag;
}

.todo-plan-panel.standalone .panel-actions,
.todo-plan-panel.standalone .note-switcher,
.todo-plan-panel.standalone .todo-notes-action-panel,
.todo-plan-panel.standalone .floating-find-bar,
.todo-plan-panel.standalone .panel-body {
  -webkit-app-region: no-drag;
}

.window-title {
  position: absolute;
  left: 108px;
  right: 108px;
  width: auto;
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--todo-text) 72%, transparent);
  font-size: 14px;
  font-weight: 650;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.window-traffic-spacer {
  display: none;
}

.todo-plan-panel.standalone .window-traffic-spacer {
  display: block;
  flex: 0 0 82px;
  height: 100%;
  pointer-events: none;
}

.title-display {
  min-width: 0;
  flex: 1;
  height: 36px;
  display: flex;
  align-items: center;
  text-align: left;
}

.icon-button:hover,
.mini-button:hover,
.note-option:hover {
  color: var(--todo-text);
  background: var(--hover, color-mix(in srgb, var(--text) 8%, transparent));
}

.panel-title {
  min-width: 0;
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
  margin-left: auto;
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.todo-plan-panel.standalone .panel-actions {
  opacity: 1;
  pointer-events: auto;
  gap: 4px;
}

.icon-button,
.mini-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.todo-plan-panel.standalone .icon-button {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: color-mix(in srgb, var(--todo-text) 66%, transparent);
}

.todo-plan-panel.standalone .icon-button:hover,
.todo-plan-panel.standalone .icon-button.active:hover {
  color: var(--todo-text);
  background: color-mix(in srgb, var(--todo-text) 10%, transparent);
}

.todo-plan-panel.standalone .icon-button.active {
  color: color-mix(in srgb, var(--todo-text) 66%, transparent);
  background: transparent;
}

.icon-button.active {
  color: var(--todo-accent);
  background: var(--todo-accent-soft);
}

.icon-button:focus-visible,
.mini-button:focus-visible,
.note-option:focus-visible {
  outline: 2px solid var(--todo-accent-border);
  outline-offset: 2px;
}

.todo-plan-panel.standalone .icon-button:focus,
.todo-plan-panel.standalone .icon-button:focus-visible {
  outline: none;
  box-shadow: none;
}

.note-switcher {
  position: absolute;
  top: var(--todo-popover-top);
  left: 50%;
  z-index: 5;
  width: var(--todo-popover-width);
  max-height: var(--todo-switcher-popover-max-height);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--todo-rule);
  border-radius: var(--todo-popover-radius);
  background: var(--todo-card-bg);
  box-shadow: var(--todo-popover-shadow);
  transform: translateX(-50%);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.25;
  overflow: hidden;
}

.todo-plan-panel.standalone .note-switcher {
  background: color-mix(in srgb, var(--todo-card-bg) 96%, #fff 4%);
}

.switcher-search,
.floating-find-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--todo-muted);
  background: var(--todo-card-bg-soft);
}

.switcher-search {
  height: var(--todo-popover-search-height);
  padding: 0 var(--todo-popover-search-padding-x);
  gap: var(--todo-popover-search-gap);
  border-bottom: 1px solid var(--todo-rule-soft);
  font-size: var(--todo-popover-search-font-size);
  line-height: 1.25;
}

.switcher-search svg {
  flex: 0 0 auto;
}

.switcher-search input,
.floating-find-bar input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--todo-text);
  font: inherit;
}

.switcher-list {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 254px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 8px;
}

.todo-plan-panel.standalone .switcher-list {
  max-height: 282px;
  padding: 7px;
}

.switcher-header-row {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: color-mix(in srgb, var(--todo-text) 72%, transparent);
  font-size: 13px;
  font-weight: 700;
}

.switcher-header-row span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: color-mix(in srgb, var(--todo-text) 66%, transparent);
  font-weight: 650;
}

.todo-plan-panel.standalone .switcher-header-row {
  height: 28px;
  padding: 0 6px;
  font-size: 13px;
}

.switcher-label {
  padding: 8px 2px 5px;
  color: var(--todo-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.note-option {
  width: 100%;
  min-height: 58px;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  border-radius: 12px;
  text-align: left;
}

.surface-chat-floating-card .note-option,
.surface-chat-docked-card .note-option {
  min-height: 52px;
}

.todo-plan-panel.standalone .note-option {
  min-height: 52px;
  border-radius: 12px;
}

.note-option.active,
.note-option.selected {
  color: var(--todo-text);
  background: color-mix(in srgb, var(--todo-text) 9%, transparent);
}

.note-option.selected {
  background: color-mix(in srgb, var(--todo-text) 12%, transparent);
}

.note-option.system {
  color: color-mix(in srgb, var(--todo-text) 90%, var(--todo-accent) 10%);
}

.note-option-main {
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  border-radius: inherit;
  text-align: left;
}

.todo-plan-panel.standalone .note-option-main {
  padding: 8px 10px;
  gap: 4px;
}

.note-option-main:hover {
  color: var(--todo-text);
  background: transparent;
}

.note-option strong,
.note-option small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-option strong {
  color: inherit;
  font-size: 14px;
  font-weight: 700;
}

.todo-plan-panel.standalone .note-option strong {
  font-size: 14px;
}

.note-option small {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--todo-muted);
  font-size: 12px;
  font-style: normal;
}

.todo-plan-panel.standalone .note-option small {
  font-size: 12px;
}

.note-option small i {
  width: 7px;
  height: 7px;
  display: inline-block;
  border-radius: 999px;
  background: color-mix(in srgb, var(--todo-muted) 52%, transparent);
}

.note-option small i.current {
  background: #ff5f57;
}

.note-option small b {
  color: color-mix(in srgb, var(--todo-muted) 62%, transparent);
  font-weight: 500;
}

.note-option-actions {
  padding-right: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--todo-muted);
}

.note-option-actions button {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.todo-plan-panel.standalone .note-option-actions {
  padding-right: 10px;
  gap: 6px;
}

.todo-plan-panel.standalone .note-option-actions button {
  width: 24px;
  height: 24px;
}

@media (max-width: 460px) {
  .todo-plan-panel.standalone {
    --todo-popover-width: min(360px, calc(100% - 32px));
    --todo-popover-search-height: 44px;
    --todo-popover-search-padding-x: 14px;
    --todo-popover-search-font-size: 14px;
    --todo-switcher-popover-max-height: min(308px, calc(100vh - 84px));
    --todo-action-popover-max-height: min(308px, calc(100vh - 84px));
  }

  .todo-plan-panel.standalone .window-traffic-spacer {
    flex-basis: 76px;
  }

  .todo-plan-panel.standalone .window-title {
    left: 96px;
    right: 96px;
    font-size: 13px;
  }

  .todo-plan-panel.standalone .switcher-header-row {
    height: 30px;
    font-size: 13px;
  }

  .todo-plan-panel.standalone .note-option {
    min-height: 50px;
    grid-template-columns: minmax(0, 1fr);
  }

  .todo-plan-panel.standalone .note-option strong {
    font-size: 14px;
  }

  .todo-plan-panel.standalone .note-option small {
    max-width: 100%;
    font-size: 12px;
  }

  .todo-plan-panel.standalone .note-option-actions {
    display: none;
  }
}

.note-option-actions button.active {
  color: var(--todo-text);
  background: color-mix(in srgb, var(--todo-text) 11%, transparent);
}

.floating-find-bar {
  position: absolute;
  top: 62px;
  right: 12px;
  z-index: 4;
  width: min(300px, calc(100% - 24px));
  height: 34px;
  padding: 0 7px 0 10px;
  border: 1px solid var(--todo-rule);
  border-radius: 9px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.16);
}

.floating-find-bar span {
  flex: 0 0 auto;
  min-width: 36px;
  color: var(--todo-muted);
  font-size: 11px;
  text-align: center;
}

.panel-body {
  height: calc(100% - 88px);
  min-height: 132px;
  overflow: auto;
  background: var(--todo-card-bg);
}

.todo-plan-panel.standalone .panel-body {
  height: calc(100% - 68px);
  min-height: 120px;
}

.markdown-editor {
  width: 100%;
  height: 100%;
  --editor-font-size: 14px;
  min-height: 96px;
  padding: 14px;
  min-width: 0;
}

.todo-plan-panel.standalone .markdown-editor {
  --editor-font-size: 15px;
  padding: 10px 18px 10px;
}

.markdown-editor :deep(.cm-editor),
.markdown-editor :deep(.cm-scroller) {
  height: 100%;
  width: 100%;
  min-width: 0;
}

.markdown-editor :deep(.cm-scroller) {
  overflow: auto;
}

.note-footer {
  height: 38px;
  padding: 0 18px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  border-top: 1px solid var(--todo-rule-soft);
  color: color-mix(in srgb, var(--todo-muted) 72%, transparent);
  background: color-mix(in srgb, var(--todo-card-bg) 88%, transparent);
  font-size: 13px;
  font-weight: 600;
}

.note-footer.formatting {
  padding: 0 8px;
  display: flex;
  justify-content: stretch;
}

.note-footer span {
  text-align: center;
}

.format-toggle {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: color-mix(in srgb, var(--todo-text) 72%, transparent);
}

.format-toggle:hover,
.format-toggle:focus-visible {
  color: var(--todo-text);
  background: color-mix(in srgb, var(--todo-text) 9%, transparent);
  outline: none;
}

.format-buffer {
  min-width: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
}

.format-buffer::-webkit-scrollbar {
  display: none;
}

.format-command {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border-radius: 7px;
  color: color-mix(in srgb, var(--todo-text) 72%, transparent);
}

.format-command:hover,
.format-command:focus-visible {
  color: var(--todo-text);
  background: color-mix(in srgb, var(--todo-text) 9%, transparent);
  outline: none;
}

.heading-command {
  width: 42px;
  font-size: 22px;
  font-weight: 750;
  letter-spacing: 0;
}

.format-separator {
  width: 1px;
  height: 28px;
  flex: 0 0 auto;
  margin: 0 8px 0 auto;
  background: var(--todo-rule);
}

.close-format {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: var(--todo-card-bg);
  background: color-mix(in srgb, var(--todo-text) 58%, transparent);
}

.close-format:hover,
.close-format:focus-visible {
  color: var(--todo-card-bg);
  background: color-mix(in srgb, var(--todo-text) 72%, transparent);
}

.todo-plan-panel.standalone .note-footer {
  height: 38px;
  padding-right: 18px;
  font-size: 13px;
}

.todo-plan-panel.standalone .note-footer.formatting {
  padding: 0 8px;
}

.todo-plan-panel.standalone .format-buffer {
  gap: 5px;
}

.todo-plan-panel.standalone .format-command {
  width: 30px;
  height: 30px;
}

.todo-plan-panel.standalone .heading-command {
  width: 42px;
  font-size: 22px;
}

.todo-plan-panel.standalone .format-separator {
  height: 28px;
  margin-right: 8px;
}

.todo-plan-panel.standalone .close-format {
  width: 30px;
  height: 30px;
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
    width: min(340px, calc(100vw - 16px));
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
    width: min(340px, calc(100vw - 12px));
    border-radius: 10px;
  }

  .panel-actions {
    gap: 2px;
  }
}
</style>
