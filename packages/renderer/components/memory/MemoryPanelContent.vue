<template>
  <PageShell
    class="memory-page-shell"
    no-padding
  >
    <template #header>
      <div class="memory-title-block">
        <span class="memory-title">Memory</span>
      </div>
      <div class="memory-actions">
        <button
          class="text-action"
          type="button"
          title="Reveal memory directory"
          :disabled="!overview"
          @click="revealMemoryRoot"
        >
          folder
        </button>
        <button
          class="text-action"
          type="button"
          title="Refresh memory"
          :disabled="loading"
          @click="loadOverview()"
        >
          {{ loading ? 'loading…' : 'refresh' }}
        </button>
      </div>
    </template>

    <ErrorNote
      v-if="error"
      class="ledger-error"
      :message="error"
    />

    <p
      v-if="loading && !hasLoadedMemory"
      class="ledger-note loading-note"
    >
      loading memory…
    </p>

    <template v-else>
      <LayoutGrid
        as="div"
        type="grid"
        class="memory-single-page"
        columns="1"
        row-gap="md"
        align-items="stretch"
      >
        <section class="memory-section notes-section memory-surface">
          <div class="memory-section-header notes-header">
            <div class="notes-title">
              <strong>Notes</strong>
            </div>
            <div class="notes-header-actions">
              <Select
                class="view-select"
                variant="underline"
                size="small"
                teleported
                fit-input-width
                :model-value="noteFilter"
                :options="NOTE_FILTER_OPTIONS"
                aria-label="Filter notes"
                @update:model-value="noteFilter = $event as NoteFilter"
              />

              <div
                v-if="selectedFile"
                class="save-status-indicator notes-save-status"
              >
                <span :class="['status-dot', selectedFileIsDirty ? 'dirty' : 'saved', { pulsing: savingFile }]" />
                <span>{{ selectedFileStatus }}</span>
              </div>

              <div class="notes-editor-tabs">
                <button
                  class="text-action tab-action"
                  :class="{ 'is-active': notesMode === 'edit' }"
                  type="button"
                  :disabled="!selectedFile"
                  @click="notesMode = 'edit'"
                >
                  edit
                </button>
                <button
                  class="text-action tab-action"
                  :class="{ 'is-active': notesMode === 'preview' }"
                  type="button"
                  :disabled="!selectedFile"
                  @click="notesMode = 'preview'"
                >
                  preview
                </button>
              </div>

              <button
                class="text-action notes-file-action"
                type="button"
                title="Save note"
                :disabled="!selectedFile || savingFile || !selectedFileIsDirty"
                @click="saveSelectedFile"
              >
                save
              </button>
              <button
                class="text-action notes-file-action"
                type="button"
                title="Reload note from disk"
                :disabled="!selectedFile"
                @click="readSelectedFile(undefined, true)"
              >
                reload
              </button>
              <button
                class="text-action notes-file-action"
                type="button"
                title="Open in default editor"
                :disabled="!selectedFile"
                @click="openSelectedPath"
              >
                open
              </button>
            </div>
          </div>

          <div class="memory-content-page notes-page unified-notes-page">
            <div
              class="notes-workspace memory-workspace"
              :class="{ 'detail-active': notesDetailActive }"
            >
              <section class="notes-list-surface">
                <p
                  v-if="visibleFiles.length === 0"
                  class="ledger-note list-note"
                >
                  no notes yet.
                </p>
                <div
                  v-else
                  class="file-list"
                >
                  <button
                    v-for="file in visibleFiles"
                    :key="file.relativePath"
                    type="button"
                    :class="['file-row', { active: selectedPath === file.relativePath }]"
                    :title="file.relativePath"
                    @click="selectFile(file)"
                  >
                    <component
                      :is="kindIcon(file.kind)"
                      :size="14"
                      :stroke-width="1.7"
                      class="file-icon"
                    />
                    <span class="file-main">
                      <span class="file-title-row">
                        <Badge
                          :label="kindLabel(file.kind)"
                          :tone="kindBadgeTone(file.kind)"
                        />
                        <span
                          class="file-name"
                          :title="memoryFileDisplayName(file)"
                        >{{ memoryFileDisplayName(file) }}</span>
                        <span class="file-date">{{ memoryFileDateLabel(file) }}</span>
                      </span>
                      <span class="file-preview">{{ cleanMemoryPreview(file.preview, 120) }}</span>
                    </span>
                  </button>
                </div>
              </section>

              <div
                v-if="selectedFile"
                class="viewer"
              >
                <div class="viewer-header">
                  <button
                    class="text-action back-btn"
                    type="button"
                    title="Back to list"
                    @click="notesDetailActive = false"
                  >
                    back
                  </button>
                  <span class="viewer-title">
                    <strong :title="selectedFileDisplayTitle">{{ selectedFileDisplayTitle }}</strong>
                    <small :title="selectedFile.relativePath">{{ selectedFile.relativePath }}:{{ selectedFile.startLine }}-{{ selectedFile.endLine }}</small>
                  </span>
                </div>

                <div class="notes-viewer-body">
                  <textarea
                    v-if="notesMode === 'edit'"
                    v-model="selectedFileText"
                    class="memory-editor"
                    spellcheck="true"
                    placeholder="Start typing memory notes..."
                  />
                  <div
                    v-else
                    class="memory-preview-container md-body"
                  >
                    <StaticMarkdown :content="selectedFileText" />
                  </div>
                </div>

                <p
                  v-if="selectedFile.truncated"
                  class="ledger-note truncated-note"
                >
                  file is truncated in the editor.
                </p>
              </div>
            </div>
          </div>
        </section>
      </LayoutGrid>
    </template>
  </PageShell>
</template>

<script setup lang="ts">
import { useConfirm } from '@/composables/useConfirm'
import PageShell from '../common/PageShell.vue'
import Badge from '../common/Badge.vue'
import LayoutGrid from '../common/LayoutGrid.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Select from '@/components/common/Select.vue'
import type { SelectOptionLike } from '@/components/common/select'
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  BookOpen,
  Clock,
  Sparkles,
  User,
} from 'lucide-vue-next'
import StaticMarkdown from '../chat/message/StaticMarkdown.vue'
import { useSessionsStore } from '@/stores/sessions'
import type {
  MemoryManagedFile,
  MemoryOverview,
  MemoryReadResponse,
} from '@shared/ipc'
import { platformApi } from '@/platform'

type NoteFilter = 'all' | 'ai' | 'daily'
type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'category-1' | 'category-2' | 'category-3' | 'category-4'

const sessionsStore = useSessionsStore()
const activeAgentId = computed(() => sessionsStore.currentSession?.agentId || 'default')

const notesDetailActive = ref(false)
const notesMode = ref<'edit' | 'preview'>('edit')
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const overview = ref<MemoryOverview | null>(null)
const { confirm } = useConfirm()
const loading = ref(false)
const hasLoadedMemory = ref(false)
const savingFile = ref(false)
const error = ref('')
const noteFilter = ref<NoteFilter>('all')

const NOTE_FILTER_OPTIONS: SelectOptionLike[] = [
  { value: 'all', label: 'All notes' },
  { value: 'ai', label: 'AI notes' },
  { value: 'daily', label: 'Daily captures' },
]

const selectedPath = ref('SOUL.md')
const selectedFile = ref<MemoryReadResponse['file'] | null>(null)
const selectedFileText = ref('')

const visibleFiles = computed(() => {
  const files = overview.value?.files || []
  if (noteFilter.value === 'all') return files
  if (noteFilter.value === 'ai') return files.filter(file => file.kind === 'soul' || file.kind === 'user' || file.kind === 'memory')
  return files.filter(file => file.kind === noteFilter.value)
})

const selectedManagedFile = computed(() =>
  overview.value?.files.find(file => file.relativePath === selectedPath.value) || null,
)

const selectedFileIsDirty = computed(() =>
  Boolean(selectedFile.value && selectedFileText.value !== selectedFile.value.text),
)

const selectedFileStatus = computed(() => {
  if (savingFile.value) return 'Saving...'
  return selectedFileIsDirty.value ? 'Unsaved changes' : 'Saved'
})

const selectedFileDisplayTitle = computed(() => {
  if (selectedManagedFile.value) return memoryFileDisplayName(selectedManagedFile.value)
  return selectedFile.value?.relativePath || 'Selected note'
})

watch(
  () => noteFilter.value,
  async () => {
    if (overview.value) {
      await ensureFileSelectionForTab()
    }
  },
)

watch(
  () => activeAgentId.value,
  async () => {
    hasLoadedMemory.value = false
    await loadOverview()
  },
)

function scheduleAutoSave() {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
  }
  autoSaveTimer.value = setTimeout(async () => {
    if (selectedFileIsDirty.value && !savingFile.value) {
      await saveSelectedFile()
    }
  }, 1500)
}

watch(
  () => selectedFileText.value,
  (newText) => {
    if (selectedFile.value && newText !== selectedFile.value.text) {
      scheduleAutoSave()
    }
  }
)

onMounted(async () => {
  await loadOverview()
})

onBeforeUnmount(() => {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
    autoSaveTimer.value = null
  }
})

async function loadOverview(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await platformApi.getMemoryOverview(activeAgentId.value)
    if (!response.success || !response.overview) {
      throw new Error(response.error || 'Failed to load memory')
    }
    overview.value = response.overview
    if (!overview.value.files.some(file => file.relativePath === selectedPath.value)) {
      selectedPath.value = overview.value.files.find(file => file.relativePath === 'SOUL.md')?.relativePath ||
        overview.value.files[0]?.relativePath ||
        ''
    }
    if (selectedPath.value) {
      await ensureFileSelectionForTab()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
    hasLoadedMemory.value = true
  }
}

async function selectFile(file: MemoryManagedFile): Promise<void> {
  if (file.relativePath !== selectedPath.value && !await confirmDiscardSelectedFileChanges()) return
  selectedPath.value = file.relativePath
  await readSelectedFile(undefined, true)
  notesDetailActive.value = true
}

async function confirmDiscardSelectedFileChanges(): Promise<boolean> {
  if (!selectedFileIsDirty.value) return true
  return confirm({
    title: 'Discard changes',
    message: 'Discard unsaved note changes?',
    confirmText: 'Discard',
    danger: true,
  })
}

async function ensureFileSelectionForTab(): Promise<void> {
  const files = visibleFiles.value
  if (files.length === 0) {
    selectedFile.value = null
    selectedFileText.value = ''
    return
  }
  if (!files.some(file => file.relativePath === selectedPath.value)) {
    selectedPath.value = files[0].relativePath
  }
  await readSelectedFile(undefined, true)
}

async function readSelectedFile(startLine?: number, full = false): Promise<void> {
  if (!selectedPath.value) return
  const response = await platformApi.readMemoryFile({
    path: selectedPath.value,
    agentId: activeAgentId.value,
    ...(startLine ? { startLine } : {}),
    ...(full ? { full: true } : { lines: startLine ? 180 : 260 }),
  })
  if (!response.success || !response.file) {
    error.value = response.error || 'Failed to read memory file'
    return
  }
  selectedFile.value = response.file
  selectedFileText.value = response.file.text
}

async function saveSelectedFile(): Promise<void> {
  if (!selectedPath.value || !selectedFile.value) return
  savingFile.value = true
  error.value = ''
  try {
    const response = await platformApi.saveMemoryFile({
      path: selectedPath.value,
      content: selectedFileText.value,
      agentId: activeAgentId.value,
    })
    if (!response.success) throw new Error(response.error || 'Failed to save memory file')
    await loadOverview()
    await readSelectedFile(undefined, true)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    savingFile.value = false
  }
}

async function revealMemoryRoot(): Promise<void> {
  if (overview.value?.root) {
    await platformApi.revealPath(overview.value.root)
  }
}

async function openSelectedPath(): Promise<void> {
  if (!selectedPath.value || !overview.value) return
  const file = overview.value.files.find(item => item.relativePath === selectedPath.value)
  if (file) await platformApi.openPath(file.absolutePath)
}

function kindIcon(kind: MemoryManagedFile['kind']): Component {
  if (kind === 'soul') return Sparkles
  if (kind === 'user') return User
  if (kind === 'memory') return BookOpen
  return Clock
}

function kindLabel(kind: MemoryManagedFile['kind']): string {
  if (kind === 'soul') return 'Soul'
  if (kind === 'user') return 'User'
  if (kind === 'memory') return 'AI'
  return 'Daily'
}

function kindBadgeTone(kind: MemoryManagedFile['kind']): BadgeTone {
  if (kind === 'soul') return 'category-1'
  if (kind === 'memory') return 'category-2'
  if (kind === 'user') return 'category-4'
  if (kind === 'daily') return 'category-4'
  return 'neutral'
}

function memoryFileDisplayName(file: MemoryManagedFile): string {
  if (file.kind === 'soul') return 'Profile guidance'
  if (file.kind === 'user') return 'User memory'
  if (file.kind === 'memory') return 'Long-term memory note'
  const date = memoryFileDateLabel(file)
  return date ? `Daily capture · ${date}` : 'Daily capture'
}

function memoryFileDateLabel(file: MemoryManagedFile): string {
  if (file.date) {
    const ms = Date.parse(`${file.date}T12:00:00`)
    if (!Number.isNaN(ms)) return formatShortDate(ms)
  }
  return formatShortDate(file.mtimeMs)
}

function cleanMemoryPreview(value: string, maxLength = 180): string {
  const clean = value
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return 'No preview available yet.'
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3).trim()}...` : clean
}

function formatShortDate(ms?: number): string {
  if (!ms || ms < 100000000000) return ''
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

</script>

<style scoped>
/*
 * Memory ledger — 画线风.
 * No background fills, no radii: state lives in the line.
 * One vertical ink rule carries the notes sheet.
 */
.memory-page-shell {
  min-height: 0;
  animation: ledger-fade 0.15s ease;
}

@keyframes ledger-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- page header ---- */
.memory-page-shell :deep(.page-shell-header) {
  padding: 10px 20px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 45%, transparent);
  background: transparent;
}

.memory-page-shell :deep(.page-shell-header-main) {
  align-items: baseline;
}

.memory-page-shell :deep(.page-shell-body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.memory-page-shell :deep(.layout-grid.type-grid) {
  border-top: 0;
}

.memory-title-block {
  display: flex;
  align-items: baseline;
  min-width: 0;
}

.memory-title {
  font-size: 12px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg, var(--text-primary));
  white-space: nowrap;
}

.memory-actions {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-shrink: 0;
}

/* ---- text actions ---- */
.text-action {
  appearance: none;
  background: transparent;
  border: none;
  padding: 4px 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.12s ease;
}

.text-action:hover:not(:disabled),
.text-action:focus-visible {
  outline: none;
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-danger:hover:not(:disabled),
.text-action.is-danger:focus-visible {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  text-decoration-color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.text-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ---- errors / plain notes ---- */
/* positioning only — visuals come from ErrorNote */
.ledger-error {
  margin: 12px 20px 0;
}

.ledger-note {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.loading-note {
  padding: 14px 20px;
}

.list-note {
  padding: 10px 8px;
}

.truncated-note {
  flex-shrink: 0;
  padding: 7px 12px 8px;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
}

/* ---- the ledger sheet ---- */
.memory-single-page {
  position: relative;
  container-type: inline-size;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 12px 16px 16px 20px;
  overflow: hidden;
  background: transparent;
  grid-template-rows: minmax(0, 1fr);
}

/* one vertical ink rule carries the notes sheet */
.memory-single-page::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 18px;
  bottom: 18px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

.memory-section {
  min-width: 0;
  min-height: 0;
}

.memory-surface {
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

/* outlined chips: the ring marks the kind, no fill */
.file-title-row :deep(.badge) {
  background: transparent;
  border-radius: 9px;
  font-weight: var(--font-weight-medium, 500);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- notes section ---- */
.notes-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  overflow: visible;
}

.memory-section-header {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 14px;
  padding: 8px 0 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 45%, transparent);
}

.memory-section-header::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 16px;
  width: 10px;
  height: 2px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

.notes-title {
  flex: 0 0 auto;
}

.notes-title strong {
  font-size: 12px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg, var(--text-primary));
  white-space: nowrap;
}

.notes-header-actions {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px 14px;
  flex: 1 1 auto;
  min-width: 0;
}

/* P3: the notes filter is `<Select variant="underline">` — the component owns
   the hairline, the hover ink and the caret. Footprint only here. */
.view-select {
  min-width: 0;
  max-width: 140px;
}

/* save status: a small ink dot, no fills elsewhere */
.save-status-indicator {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

.notes-save-status {
  flex: 0 0 auto;
}

.status-dot {
  align-self: center;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px dashed var(--ui-text-muted-fg, var(--text-muted));
  background: transparent;
}

.status-dot.saved {
  border: 1px solid var(--ui-accent-primary-fg, var(--accent));
  background: var(--ui-accent-primary-fg, var(--accent));
}

.status-dot.pulsing {
  animation: pulse-opacity 1s infinite alternate;
}

@keyframes pulse-opacity {
  from { opacity: 0.3; }
  to { opacity: 1; }
}

.notes-editor-tabs {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
}

.tab-action.is-active {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

/* ---- notes workspace ---- */
.unified-notes-page {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  overflow: hidden;
}

.notes-workspace {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  gap: 0;
}

.notes-list-surface {
  flex: 0 0 clamp(220px, 34%, 380px);
  min-width: 0;
  max-width: min(420px, 42%);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
  border-right: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
}

.viewer {
  flex: 1 1 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  min-width: min(220px, 100%);
  overflow: hidden;
  background: transparent;
}

/* ---- file rows as ledger rows ---- */
.file-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 10px 10px 0;
  display: flex;
  flex-direction: column;
}

.file-row {
  appearance: none;
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  flex-shrink: 0;
  margin: 0;
  padding: 8px 4px 9px 8px;
  border: none;
  border-radius: 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text-primary));
  font: inherit;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  white-space: normal;
}

.file-row:first-child {
  border-top: none;
}

.file-row:focus-visible {
  outline: none;
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 55%, transparent);
}

/* selection is a line, not a fill */
.file-row.active {
  box-shadow: inset 2px 0 0 var(--ui-accent-primary-fg, var(--accent));
}

.file-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--ui-text-faint-fg, var(--muted));
}

.file-row:hover .file-icon,
.file-row.active .file-icon {
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.file-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.file-title-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
}

.file-title-row :deep(.badge) {
  max-width: 82px;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: var(--font-weight-medium, 500);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.file-date {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

.file-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* ---- viewer ---- */
.viewer-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
  min-height: 40px;
  padding: 8px 12px 7px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
  background: transparent;
}

.viewer-header .back-btn {
  display: none;
}

.viewer-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.viewer-title strong,
.viewer-title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-title strong {
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: 12px;
  font-weight: var(--font-weight-medium, 500);
}

.viewer-title small {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
}

.notes-viewer-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

.memory-editor {
  flex: 1;
  width: 100%;
  padding: 12px;
  border: 0;
  resize: none;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  line-height: 1.6;
}

.memory-editor::placeholder {
  color: var(--ui-text-faint-fg, var(--muted));
}

.memory-preview-container {
  flex: 1;
  padding: 12px 16px;
  overflow-y: auto;
  line-height: 1.6;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

/* ---- narrow panel: stacked list/viewer with slide-in detail ----
   Container queries key off the actual panel width, not the viewport,
   because this page lives inside a resizable workspace panel. */
@container (max-width: 720px) {
  .notes-workspace {
    display: block;
  }

  .notes-list-surface {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    min-width: 0;
    max-width: none;
    height: 100%;
    border-right: 0;
    transform: translateX(0);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
  }

  .viewer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 2;
    background: var(--ui-surface-app-bg, var(--bg));
  }

  .detail-active .notes-list-surface {
    transform: translateX(-20%);
  }

  .detail-active .viewer {
    transform: translateX(0);
  }

  .viewer-header .back-btn {
    display: inline-flex;
  }
}

@container (max-width: 460px) {
  .notes-header-actions {
    justify-content: flex-start;
  }
}

@media (max-height: 520px) {
  .memory-single-page {
    padding: 10px 12px 12px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .memory-page-shell {
    animation: none;
  }

  .notes-list-surface,
  .viewer {
    transition: none;
  }

  .status-dot.pulsing {
    animation: none;
  }
}
</style>
