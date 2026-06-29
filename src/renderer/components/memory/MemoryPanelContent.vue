<template>
  <PageShell
    class="memory-page-shell"
    no-padding
  >
    <template #header>
      <div class="memory-title-block">
        <div class="memory-title">
          <Brain
            :size="18"
            :stroke-width="1.7"
          />
          <span>Memory</span>
        </div>
      </div>
      <div class="memory-actions">
        <Button
          text
          circle
          class="icon-btn"
          native-type="button"
          title="Reveal directory"
          :icon="FolderOpen"
          :disabled="!overview"
          @click="revealMemoryRoot"
        />
        <Button
          text
          circle
          class="icon-btn"
          native-type="button"
          title="Refresh"
          :disabled="loading"
          @click="loadOverview()"
        >
          <RefreshCw
            :size="16"
            :stroke-width="1.8"
            :class="{ spinning: loading }"
          />
        </Button>
      </div>
    </template>

    <div
      v-if="error"
      class="notice error"
    >
      {{ error }}
    </div>

    <div
      v-if="loading && !hasLoadedMemory"
      class="loading-state"
    >
      <LoadingSpinner label="Loading memory..." />
    </div>

    <template v-else>
      <LayoutGrid
        as="div"
        type="grid"
        class="memory-single-page"
        columns="1"
        row-gap="md"
        align-items="stretch"
      >
        <CollapsePanel
          class="memory-section profile-section memory-panel"
          :class="{ collapsed: memoryCollapsed }"
          name="memory-list-panel"
          variant="outlined"
          content-variant="plain"
          content-class="simple-profile-list profile-table-shell"
          expand-icon-position="start"
          :model-value="!memoryCollapsed"
          @update:model-value="memoryCollapsed = !$event"
        >
          <template #title>
            <div class="memory-panel-title">
              <strong>Memory</strong>
            </div>
          </template>

          <template #actions>
            <form
              class="profile-search-form"
              @submit.prevent="loadGraph"
            >
              <FilterSearchInput
                v-model="graphSearch"
                class="profile-search-input"
                placeholder="Search facts"
                label="Search facts"
              />
            </form>

            <Button
              text
              circle
              class="icon-btn"
              native-type="button"
              title="Refresh memory"
              :disabled="profileLoading"
              @click="loadGraph"
            >
              <RefreshCw
                :size="14"
                :class="{ spinning: profileLoading }"
              />
            </Button>
          </template>

          <LoadingSpinner
            v-if="profileLoading"
            label="Loading memory..."
            :size="22"
          />
          <Table
            v-else
            v-model:expand-row-keys="expandedMemoryRowKeys"
            class="memory-profile-table"
            :data="profileMemoryRows"
            :columns="profileMemoryColumns"
            row-key="id"
            :height="memoryTableHeight"
            empty-text="No profile rows yet."
          >
            <template #cell-memory="{ row }">
              <span class="profile-memory-text">{{ profileMemoryRow(row).text }}</span>
            </template>

            <template #cell-kind="{ row }">
              <span class="profile-kind-cell">
                <Badge
                  :label="memoryKindLabel(profileMemoryRow(row).observation.kind)"
                  :tone="memoryKindTone(profileMemoryRow(row).observation.kind)"
                />
                <Badge
                  v-if="profileMemoryRow(row).observation.sensitivity !== 'normal'"
                  :label="profileMemoryRow(row).observation.sensitivity"
                  :tone="profileMemoryRow(row).observation.sensitivity === 'secret' ? 'danger' : 'warning'"
                />
              </span>
            </template>

            <template #cell-updated="{ row }">
              <span class="profile-updated-cell">{{ formatShortDate(profileMemoryRow(row).observation.updatedAt) || 'New' }}</span>
            </template>

            <template #cell-actions="{ row }">
              <div class="memory-row-actions table-row-actions">
                <Button
                  text
                  circle
                  class="row-icon-btn memory-row-edit"
                  native-type="button"
                  title="Edit memory"
                  :icon="Pencil"
                  :disabled="Boolean(memoryActionId)"
                  @click.stop="startMemoryEdit(profileMemoryRow(row).observation)"
                />
                <Button
                  text
                  circle
                  class="row-icon-btn memory-row-delete danger"
                  native-type="button"
                  title="Delete memory"
                  :icon="Trash2"
                  :disabled="Boolean(memoryActionId)"
                  @click.stop="deleteMemoryRow(profileMemoryRow(row).observation)"
                />
              </div>
            </template>

            <template #expand="{ row }">
              <div class="memory-row-detail">
                <form
                  v-if="editingMemoryId === profileMemoryRow(row).id"
                  class="memory-edit-form memory-detail-edit-form"
                  @submit.prevent="saveMemoryRow(profileMemoryRow(row).observation)"
                >
                  <textarea
                    v-model="editingMemoryText"
                    class="memory-edit-textarea"
                    :disabled="memoryActionId === profileMemoryRow(row).id"
                    aria-label="Edit memory"
                    @keydown.esc.prevent="cancelMemoryEdit"
                  />
                  <div class="memory-row-actions edit-actions">
                    <Button
                      text
                      circle
                      class="row-icon-btn memory-row-save"
                      native-type="submit"
                      title="Save memory"
                      :icon="Check"
                      :disabled="memoryActionId === profileMemoryRow(row).id || !editingMemoryText.trim()"
                    />
                    <Button
                      text
                      circle
                      class="row-icon-btn memory-row-cancel"
                      native-type="button"
                      title="Cancel edit"
                      :icon="X"
                      :disabled="memoryActionId === profileMemoryRow(row).id"
                      @click="cancelMemoryEdit"
                    />
                  </div>
                </form>

                <div
                  v-else
                  class="memory-detail-layout"
                >
                  <section class="memory-detail-value">
                    <span class="memory-detail-label">Value</span>
                    <strong>{{ profileMemoryRow(row).observation.value || profileMemoryRow(row).text }}</strong>
                    <p
                      v-if="profileMemoryRow(row).observation.evidence"
                      class="memory-detail-evidence"
                    >
                      <span>Evidence</span>
                      {{ profileMemoryRow(row).observation.evidence }}
                    </p>
                  </section>

                  <dl class="memory-detail-grid">
                    <div class="memory-detail-item">
                      <dt>Entity</dt>
                      <dd>{{ profileMemoryRow(row).observation.entityDisplayName || profileMemoryRow(row).observation.entityId }}</dd>
                    </div>
                    <div class="memory-detail-item">
                      <dt>Slot</dt>
                      <dd>{{ profileMemoryRow(row).observation.slot || 'General' }}</dd>
                    </div>
                    <div class="memory-detail-item">
                      <dt>Confidence</dt>
                      <dd>{{ formatConfidence(profileMemoryRow(row).observation.confidence) }}</dd>
                    </div>
                    <div class="memory-detail-item">
                      <dt>Source</dt>
                      <dd>{{ profileMemoryRow(row).observation.source || 'memory' }}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </template>
          </Table>
        </CollapsePanel>

        <section class="memory-section notes-section memory-surface">
          <div class="memory-section-header notes-header">
            <div class="notes-title">
              <strong>Notes</strong>
            </div>
            <div class="notes-header-actions">
              <div class="notes-filter-control">
                <select
                  v-model="noteFilter"
                  class="view-select"
                  aria-label="Filter notes"
                >
                  <option value="all">
                    All notes ({{ noteCount('all') }})
                  </option>
                  <option value="ai">
                    AI notes ({{ noteCount('ai') }})
                  </option>
                  <option value="daily">
                    Daily captures ({{ noteCount('daily') }})
                  </option>
                  <option value="dreams">
                    Reflection reports ({{ noteCount('dreams') }})
                  </option>
                </select>
              </div>

              <div
                v-if="selectedFile"
                class="save-status-indicator notes-save-status"
              >
                <span :class="['status-dot', selectedFileIsDirty ? 'dirty' : 'saved', { pulsing: savingFile }]" />
                <span>{{ selectedFileStatus }}</span>
              </div>

              <div class="notes-editor-tabs segmented">
                <Button
                  text
                  size="small"
                  :class="{ active: notesMode === 'edit' }"
                  native-type="button"
                  :disabled="!selectedFile"
                  @click="notesMode = 'edit'"
                >
                  Edit
                </Button>
                <Button
                  text
                  size="small"
                  :class="{ active: notesMode === 'preview' }"
                  native-type="button"
                  :disabled="!selectedFile"
                  @click="notesMode = 'preview'"
                >
                  Preview
                </Button>
              </div>

              <Button
                text
                size="small"
                class="text-btn"
                native-type="button"
                :disabled="!selectedFile || savingFile || !selectedFileIsDirty"
                @click="saveSelectedFile"
              >
                Save
              </Button>
              <Button
                text
                size="small"
                class="text-btn"
                native-type="button"
                :disabled="!selectedFile"
                @click="readSelectedFile(undefined, true)"
              >
                Reload
              </Button>
              <Button
                text
                size="small"
                class="text-btn"
                native-type="button"
                :disabled="!selectedFile"
                @click="openSelectedPath"
              >
                Open
              </Button>
            </div>
          </div>

          <div class="memory-content-page notes-page unified-notes-page">
            <div
              class="notes-workspace memory-workspace"
              :class="{ 'detail-active': notesDetailActive }"
            >
              <section class="notes-list-surface">
                <div class="file-list">
                  <Button
                    v-for="file in visibleFiles"
                    :key="file.relativePath"
                    text
                    :class="['file-row', { active: selectedPath === file.relativePath }]"
                    native-type="button"
                    :title="file.relativePath"
                    @click="selectFile(file)"
                  >
                    <template #icon>
                      <component
                        :is="kindIcon(file.kind)"
                        :size="17"
                        :stroke-width="1.8"
                        class="file-icon"
                      />
                    </template>
                    <span class="file-main">
                      <span class="file-title-row">
                        <Badge
                          :label="kindLabel(file.kind)"
                          :tone="kindBadgeTone(file.kind)"
                        />
                        <span class="file-name">{{ memoryFileDisplayName(file) }}</span>
                        <span class="file-date">{{ memoryFileDateLabel(file) }}</span>
                      </span>
                      <span class="file-preview">{{ cleanMemoryPreview(file.preview, 120) }}</span>
                    </span>
                  </Button>
                </div>
              </section>

              <div
                v-if="selectedFile"
                class="viewer"
              >
                <div class="viewer-header">
                  <Button
                    text
                    circle
                    class="back-btn icon-btn"
                    native-type="button"
                    title="Back to list"
                    :icon="ArrowLeft"
                    @click="notesDetailActive = false"
                  />
                  <span>
                    <strong>{{ selectedFileDisplayTitle }}</strong>
                    <small>{{ selectedFile.relativePath }}:{{ selectedFile.startLine }}-{{ selectedFile.endLine }}</small>
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

                <div
                  v-if="selectedFile.truncated"
                  class="notice compact"
                >
                  File is truncated in the editor.
                </div>
              </div>
            </div>
          </div>
        </section>
      </LayoutGrid>
    </template>
  </PageShell>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import PageShell from '../common/PageShell.vue'
import LoadingSpinner from '../common/LoadingSpinner.vue'
import FilterSearchInput from '../common/FilterSearchInput.vue'
import Badge from '../common/Badge.vue'
import CollapsePanel from '../common/CollapsePanel.vue'
import Table from '../common/Table.vue'
import LayoutGrid from '../common/LayoutGrid.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  BookOpen,
  Brain,
  Clock,
  FolderOpen,
  Check,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  ArrowLeft,
  User,
  X,
} from 'lucide-vue-next'
import StaticMarkdown from '../chat/message/StaticMarkdown.vue'
import { useSessionsStore } from '@/stores/sessions'
import type { TableColumn, TableRowKey } from '../common/table'
import type {
  MemoryGraphObservation,
  MemoryManagedFile,
  MemoryOverview,
  MemoryReadResponse,
} from '@shared/ipc'

type NoteFilter = 'all' | 'ai' | 'daily' | 'dreams'
type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'category-1' | 'category-2' | 'category-3' | 'category-4'

const memoryTableHeight = 'var(--memory-table-height)'

interface ProfileMemoryRow extends Record<string, unknown> {
  id: string
  text: string
  observation: MemoryGraphObservation
}

const sessionsStore = useSessionsStore()
const activeAgentId = computed(() => sessionsStore.currentSession?.agentId || 'default')

const notesDetailActive = ref(false)
const notesMode = ref<'edit' | 'preview'>('edit')
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const overview = ref<MemoryOverview | null>(null)
const loading = ref(false)
const hasLoadedMemory = ref(false)
const savingFile = ref(false)
const profileLoading = ref(false)
const error = ref('')
const noteFilter = ref<NoteFilter>('all')
const selectedPath = ref('SOUL.md')
const selectedFile = ref<MemoryReadResponse['file'] | null>(null)
const selectedFileText = ref('')
const memoryCollapsed = ref(false)
const graphObservations = ref<MemoryGraphObservation[]>([])
const graphSearch = ref('')
const editingMemoryId = ref('')
const editingMemoryText = ref('')
const memoryActionId = ref('')
const expandedMemoryRowKeys = ref<TableRowKey[]>([])
let dreamingPollTimer: number | null = null

const isDreamingInFlight = computed(() =>
  overview.value?.dreaming.inFlight === true,
)

const profileMemoryRows = computed<ProfileMemoryRow[]>(() => {
  const query = graphSearch.value.trim().toLowerCase()
  return graphObservations.value
    .filter(item => item.status !== 'deleted')
    .map(item => ({
      id: item.id,
      text: cleanMemoryPreview(memoryObservationText(item), 220),
      observation: item,
    }))
    .filter(row => !query || row.text.toLowerCase().includes(query))
})

const profileMemoryColumns = computed<TableColumn[]>(() => [
  {
    type: 'expand',
    width: 42,
    fixed: 'left',
  },
  {
    key: 'memory',
    prop: 'text',
    label: 'Fact',
    minWidth: 360,
    showOverflowTooltip: true,
    slot: 'cell-memory',
  },
  {
    key: 'kind',
    label: 'Kind',
    width: 150,
    slot: 'cell-kind',
    filters: memoryKindFilters.value,
    filterMultiple: false,
    filterMethod: (value, row) => profileMemoryRow(row).observation.kind === value,
  },
  {
    key: 'updated',
    label: 'Updated',
    width: 110,
    align: 'right',
    headerAlign: 'right',
    sortable: true,
    sortBy: row => profileMemoryRow(row).observation.updatedAt,
    slot: 'cell-updated',
  },
  {
    key: 'actions',
    label: '',
    width: 86,
    align: 'right',
    fixed: 'right',
    slot: 'cell-actions',
  },
])

const memoryKindFilters = computed(() => {
  const kinds = new Set(profileMemoryRows.value.map(row => row.observation.kind))
  return [...kinds]
    .sort((a, b) => memoryKindLabel(a).localeCompare(memoryKindLabel(b)))
    .map(kind => ({
      text: memoryKindLabel(kind),
      value: kind,
    }))
})

function profileMemoryRow(row: unknown): ProfileMemoryRow {
  return row as ProfileMemoryRow
}

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
  if (dreamingPollTimer) {
    window.clearTimeout(dreamingPollTimer)
    dreamingPollTimer = null
  }
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
    autoSaveTimer.value = null
  }
})

async function loadOverview(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.getMemoryOverview(activeAgentId.value)
    if (!response.success || !response.overview) {
      throw new Error(response.error || 'Failed to load memory')
    }
    overview.value = response.overview
    if (!overview.value.files.some(file => file.relativePath === selectedPath.value)) {
      selectedPath.value = overview.value.files.find(file => file.relativePath === 'SOUL.md')?.relativePath ||
        overview.value.files[0]?.relativePath ||
        ''
    }
    await Promise.all([
      loadGraph(),
      selectedPath.value ? ensureFileSelectionForTab() : Promise.resolve(),
    ])
    syncDreamingPolling()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
    hasLoadedMemory.value = true
  }
}

async function selectFile(file: MemoryManagedFile): Promise<void> {
  if (file.relativePath !== selectedPath.value && !confirmDiscardSelectedFileChanges()) return
  selectedPath.value = file.relativePath
  await readSelectedFile(undefined, true)
  notesDetailActive.value = true
}

function confirmDiscardSelectedFileChanges(): boolean {
  return !selectedFileIsDirty.value || window.confirm('Discard unsaved note changes?')
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
  const response = await window.electronAPI.readMemoryFile({
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
    const response = await window.electronAPI.saveMemoryFile({
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

async function loadGraph(): Promise<void> {
  profileLoading.value = true
  error.value = ''
  try {
    const agentId = activeAgentId.value
    const query = graphSearch.value.trim() || undefined
    const observations = await window.electronAPI.listMemoryGraphObservations({ agentId, query, limit: 250 })
    if (!observations.success || !observations.observations) throw new Error(observations.error || 'Failed to load graph observations')
    graphObservations.value = observations.observations
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileLoading.value = false
  }
}

function memoryObservationText(memory: MemoryGraphObservation): string {
  return memory.text || memory.value || memory.slot
}

function startMemoryEdit(memory: MemoryGraphObservation): void {
  editingMemoryId.value = memory.id
  editingMemoryText.value = memoryObservationText(memory)
  if (!expandedMemoryRowKeys.value.includes(memory.id)) {
    expandedMemoryRowKeys.value = [...expandedMemoryRowKeys.value, memory.id]
  }
}

function cancelMemoryEdit(): void {
  editingMemoryId.value = ''
  editingMemoryText.value = ''
}

async function saveMemoryRow(memory: MemoryGraphObservation): Promise<void> {
  const text = editingMemoryText.value.trim()
  if (!text) return
  memoryActionId.value = memory.id
  error.value = ''
  try {
    const response = await window.electronAPI.upsertMemoryGraphObservation({
      agentId: activeAgentId.value,
      id: memory.id,
      entityId: memory.entityId,
      kind: memory.kind,
      slot: memory.slot,
      value: memory.value || text,
      text,
      confidence: memory.confidence,
      sensitivity: memory.sensitivity,
      evidence: memory.evidence,
      status: memory.status,
    })
    if (!response.success) throw new Error(response.error || 'Failed to save memory')
    const updated = response.observation || {
      ...memory,
      text,
      updatedAt: Date.now(),
    }
    graphObservations.value = graphObservations.value.map(item =>
      item.id === memory.id ? updated : item,
    )
    cancelMemoryEdit()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    memoryActionId.value = ''
  }
}

async function deleteMemoryRow(memory: MemoryGraphObservation): Promise<void> {
  if (!window.confirm('Delete this memory?')) return
  memoryActionId.value = memory.id
  error.value = ''
  try {
    const response = await window.electronAPI.deleteMemoryGraphObservation({
      agentId: activeAgentId.value,
      id: memory.id,
    })
    if (!response.success) throw new Error(response.error || 'Failed to delete memory')
    graphObservations.value = graphObservations.value.filter(item => item.id !== memory.id)
    expandedMemoryRowKeys.value = expandedMemoryRowKeys.value.filter(key => key !== memory.id)
    if (editingMemoryId.value === memory.id) cancelMemoryEdit()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    memoryActionId.value = ''
  }
}

function syncDreamingPolling(): void {
  if (!isDreamingInFlight.value) {
    if (dreamingPollTimer) {
      window.clearTimeout(dreamingPollTimer)
      dreamingPollTimer = null
    }
    return
  }
  if (dreamingPollTimer) return
  dreamingPollTimer = window.setTimeout(async () => {
    dreamingPollTimer = null
    await loadOverview()
    syncDreamingPolling()
  }, 1500)
}

async function revealMemoryRoot(): Promise<void> {
  if (overview.value?.root) {
    await window.electronAPI.revealPath(overview.value.root)
  }
}

async function openSelectedPath(): Promise<void> {
  if (!selectedPath.value || !overview.value) return
  const file = overview.value.files.find(item => item.relativePath === selectedPath.value)
  if (file) await window.electronAPI.openPath(file.absolutePath)
}

function kindIcon(kind: MemoryManagedFile['kind']): Component {
  if (kind === 'soul') return Sparkles
  if (kind === 'user') return User
  if (kind === 'memory') return BookOpen
  if (kind === 'dreams') return Brain
  return Clock
}

function kindLabel(kind: MemoryManagedFile['kind']): string {
  if (kind === 'soul') return 'Soul'
  if (kind === 'user') return 'User'
  if (kind === 'memory') return 'AI'
  if (kind === 'dreams') return 'Dreams'
  return 'Daily'
}

function kindBadgeTone(kind: MemoryManagedFile['kind']): BadgeTone {
  if (kind === 'soul') return 'category-1'
  if (kind === 'memory') return 'category-2'
  if (kind === 'dreams') return 'category-3'
  if (kind === 'user') return 'category-4'
  if (kind === 'daily') return 'category-4'
  return 'neutral'
}

function memoryKindLabel(kind: MemoryGraphObservation['kind']): string {
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, char => char.toUpperCase())
}

function memoryKindTone(kind: MemoryGraphObservation['kind']): BadgeTone {
  if (kind === 'preference') return 'accent'
  if (kind === 'constraint') return 'warning'
  if (kind === 'identity') return 'success'
  if (kind === 'summary') return 'info'
  if (kind === 'episodic') return 'muted'
  return 'neutral'
}

function formatConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) return 'Unknown'
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
}

function memoryFileDisplayName(file: MemoryManagedFile): string {
  if (file.kind === 'soul') return 'Profile guidance'
  if (file.kind === 'user') return 'User memory'
  if (file.kind === 'memory') return 'Long-term memory note'
  if (file.kind === 'dreams') return 'Reflection report'
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

function noteCount(filter: NoteFilter): number {
  const files = overview.value?.files || []
  if (filter === 'all') return files.length
  if (filter === 'ai') return files.filter(file => file.kind === 'soul' || file.kind === 'user' || file.kind === 'memory').length
  return files.filter(file => file.kind === filter).length
}

function formatShortDate(ms?: number): string {
  if (!ms || ms < 100000000000) return ''
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

</script>

<style scoped>
.memory-title-block {
  min-width: 0;
  display: flex;
  align-items: center;
}

.memory-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.2px;
}

.memory-actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: -2px;
}

.memory-page-shell {
  min-height: 0;
}

.memory-page-shell :deep(.page-shell-header) {
  padding: 8px 18px 8px;
}

.memory-page-shell :deep(.page-shell-header-main) {
  align-items: flex-start;
}

.memory-page-shell :deep(.page-shell-body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.icon-btn {
  --app-button-tone: var(--ui-text-muted-fg, var(--muted));
  --app-button-height: 30px;
  --app-button-min-width: 30px;
  --app-button-padding-x: 0;
  --app-button-gap: 0;
  --app-button-hover-fill: var(--ui-state-hover-bg, var(--hover));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.icon-btn :deep(.app-button-slotted-icon) {
  width: 16px;
  height: 16px;
}

.icon-btn:hover:not(:disabled) {
  --app-button-tone: var(--ui-text-primary-fg, var(--text));

  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.memory-single-page {
  --memory-table-height: clamp(96px, 30vh, 360px);

  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 14px 16px 16px;
  overflow: hidden;
  background: var(--ui-surface-panel-bg, var(--ui-surface-app-bg, var(--bg)));
  grid-template-rows: auto minmax(0, 1fr);
}

.memory-surface {
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 58%, transparent);
  border-radius: 8px;
  background: color-mix(
    in srgb,
    var(--ui-surface-panel-bg, var(--bg-panel, var(--bg))) 78%,
    var(--ui-surface-app-bg, var(--bg)) 22%
  );
}

.memory-section {
  min-width: 0;
  min-height: 0;
}

.memory-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 44%, transparent);
}

.memory-section-header > div:not(.memory-header-actions):not(.notes-header-actions) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.memory-section-header strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 750;
}

.section-kicker {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.profile-search-form {
  width: 100%;
  min-width: 0;
  padding: 0;
}

.profile-search-input {
  width: 100%;
}

.profile-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  --collapse-panel-bg: color-mix(
    in srgb,
    var(--ui-surface-panel-bg, var(--bg-panel, var(--bg))) 78%,
    var(--ui-surface-app-bg, var(--bg)) 22%
  );
  --collapse-panel-hover-bg: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 68%, transparent);
}

.memory-panel {
  border-radius: 8px;
}

.profile-section :deep(.collapse-panel-header) {
  grid-template-columns: auto minmax(0, 1fr) clamp(240px, 30vw, 340px) !important;
  align-items: center;
  min-height: 52px;
  padding: 11px 14px;
}

.profile-section.collapsed :deep(.collapse-panel-header) {
  border-bottom: 0;
}

.profile-section :deep(.collapse-panel-content-shell) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.profile-section :deep(.collapse-panel-content.simple-profile-list) {
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  background: transparent;
}

.profile-section :deep(.collapse-panel-actions) {
  width: 100%;
  max-width: none;
  justify-self: end;
  align-self: center;
  justify-content: flex-end;
}

.profile-section :deep(.collapse-panel-actions > .app-space__item:first-child) {
  flex: 1 1 auto;
  min-width: 0;
}

.profile-section :deep(.collapse-panel-actions > .app-space__item:last-child) {
  flex: 0 0 auto;
}

.profile-section :deep(.collapse-panel-actions > .app-space__item) {
  display: flex;
  align-items: center;
}

.profile-section :deep(.collapse-panel-actions > .app-space__item:first-child),
.profile-section :deep(.collapse-panel-actions .profile-search-form) {
  width: 100%;
}

.memory-panel-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.memory-panel-title strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 750;
}

.memory-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

:deep(.profile-table-shell > .loading-spinner-root) {
  min-height: 120px;
}

.memory-profile-table {
  --app-table-bg: color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-panel)) 82%, transparent);
  --app-table-head-bg: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 82%, transparent);
  --app-table-border: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 58%, transparent);

  height: var(--memory-table-height);
  min-height: 0;
}

.memory-profile-table :deep(.app-table-scrollbar) {
  height: var(--memory-table-height) !important;
  min-height: 0;
  border: 0;
  border-top: 1px solid var(--app-table-border);
  border-radius: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.memory-profile-table :deep(.app-table-cell-content) {
  min-height: 42px;
}

.memory-profile-table :deep(.app-table-expanded-cell) {
  padding: 0;
  background: color-mix(in srgb, var(--ui-surface-muted-bg, var(--surface-soft)) 34%, transparent);
}

.profile-memory-text {
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.profile-kind-cell {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
}

.profile-updated-cell {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.memory-row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transform: translateX(3px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.table-row-actions,
.memory-row-detail:focus-within .memory-row-actions,
.memory-row-detail:hover .memory-row-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
}

.row-icon-btn {
  --app-button-tone: var(--ui-text-muted-fg, var(--muted));
  --app-button-height: 26px;
  --app-button-min-width: 26px;
  --app-button-padding-x: 0;
  --app-button-gap: 0;
  --app-button-hover-fill: var(--ui-state-hover-bg, var(--hover));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-hover-border: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 56%, transparent);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.row-icon-btn:hover:not(:disabled) {
  --app-button-tone: var(--ui-text-primary-fg, var(--text));

  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  border-color: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 56%, transparent);
}

.row-icon-btn.danger:hover:not(:disabled) {
  --app-button-tone: var(--ui-status-danger-fg, #ef4444);
  --app-button-hover-fill: var(--ui-status-danger-bg, transparent);
  --app-button-hover-fg: var(--ui-status-danger-fg, #ef4444);
  --app-button-hover-border: var(--ui-status-danger-border, #ef4444);

  color: var(--ui-status-danger-fg, #ef4444);
  background: var(--ui-status-danger-bg, transparent);
  border-color: var(--ui-status-danger-border, #ef4444);
}

.row-icon-btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.memory-edit-form {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
}

.memory-edit-textarea {
  min-height: 74px;
  width: 100%;
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid var(--ui-surface-input-border, var(--ui-border-default-border, var(--border)));
  border-radius: 7px;
  background: var(--ui-surface-input-bg, var(--bg-input));
  color: var(--ui-text-primary-fg, var(--text));
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  outline: none;
}

.memory-edit-textarea:focus {
  border-color: var(--ui-surface-input-focus-border, var(--ui-border-focus-border, var(--ui-accent-primary-fg, var(--accent))));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
}

.edit-actions {
  opacity: 1;
  pointer-events: auto;
  transform: none;
}

.memory-row-detail {
  min-width: 0;
  padding: 10px 12px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 36%, transparent),
      color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-panel)) 68%, transparent)
    );
}

.memory-detail-layout {
  display: grid;
  grid-template-columns: minmax(260px, 1.1fr) minmax(0, 2fr);
  gap: 10px;
  align-items: stretch;
}

.memory-detail-value,
.memory-detail-item {
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 48%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-panel)) 68%, transparent);
}

.memory-detail-value {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  min-height: 82px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 58%, transparent);
}

.memory-detail-label {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  font-weight: 760;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.memory-detail-value strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 14px;
  font-weight: 760;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.memory-detail-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.memory-detail-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 82px;
  padding: 9px 11px;
}

.memory-detail-grid dt {
  margin: 0 0 4px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.01em;
}

.memory-detail-grid dd {
  margin: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.3px;
  font-weight: 560;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.memory-detail-evidence {
  display: -webkit-box;
  margin: 1px 0 0;
  overflow: hidden;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  font-size: 11.5px;
  font-weight: 520;
  line-height: 1.35;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.memory-detail-evidence span {
  margin-right: 6px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.memory-detail-edit-form {
  padding: 2px 0;
}

@media (max-width: 1100px) {
  .memory-detail-layout {
    grid-template-columns: 1fr;
  }

  .memory-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.notes-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  overflow: hidden;
}

.notes-header {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 44%, transparent);
  border-radius: 0;
  background: transparent;
  min-height: 52px;
}

.notes-title {
  flex: 0 0 auto;
}

.notes-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

.notes-filter-control {
  flex: 0 1 220px;
  min-width: 150px;
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 9px;
  border: 1px solid var(--ui-surface-input-border, color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 68%, transparent));
  border-radius: 7px;
  background: var(--ui-surface-input-bg, var(--bg-input));
}

.notes-filter-control .view-select {
  width: 100%;
}

.unified-notes-page {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}

.viewer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 50px;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 44%, transparent);
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-panel)) 62%, transparent);
}

.viewer-header > span {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.viewer-header strong,
.viewer-header small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-header strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.5px;
}

.viewer-header small {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
}

.notice {
  padding: 12px 14px;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  font-size: 12px;
  line-height: 1.45;
}

.notice.compact {
  padding: 12px;
}

.notice.error {
  color: var(--ui-status-danger-fg, #ef4444);
  background: var(--ui-status-danger-bg, transparent);
  border-bottom: 1px solid var(--ui-status-danger-border, #ef4444);
}

/* Dropdown Selector styling */
.workspace-head-title-select {
  display: flex;
  align-items: center;
}

.view-select {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--ui-text-primary-fg, var(--text));
  background: transparent;
  border: none;
  padding-right: 20px;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>");
  background-repeat: no-repeat;
  background-position: right center;
  background-size: 11px;
}

.view-select:hover {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.workspace-head-title {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--ui-text-primary-fg, var(--text));
}

.workspace-head.borderless {
  border-bottom: none;
  padding-bottom: 4px;
}

.loading-state {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  height: 100%;
  padding: 0 20px;
  gap: 12px;
  text-align: center;
  color: var(--ui-text-muted-fg, var(--muted));
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Shared Adaptiveness Workspace */
.notes-workspace {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  overflow: hidden;
  gap: 0;
}

.notes-list-surface {
  flex: 1 1 clamp(220px, 42%, 520px);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  min-width: min(220px, 100%);
  max-width: min(560px, 58%);
  overflow: hidden;
  background: transparent;
  border-right: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 50%, transparent);
}

.viewer {
  flex: 1 1 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  min-width: min(260px, 100%);
  overflow: hidden;
  background: transparent;
}

.workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 44%, transparent);
  flex-shrink: 0;
}

.workspace-head .back-btn {
  display: none; /* Hidden on wide splits */
}

/* Narrow Stacked layouts for Sidebars (Specifically targeting mode-side class) */
.mode-side :deep(.notes-workspace) {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.mode-side :deep(.notes-list-surface) {
  width: 100%;
  min-width: 0;
  max-width: none;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(0);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}

.mode-side :deep(.viewer) {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 2;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

/* Active slide-in states */
.mode-side :deep(.detail-active .notes-list-surface) {
  transform: translateX(-20%);
}

.mode-side :deep(.detail-active .viewer) {
  transform: translateX(0);
}

/* Show Back button in stacked details drawer */
.mode-side :deep(.workspace-head .back-btn),
.mode-side :deep(.viewer-header .back-btn) {
  display: inline-flex;
  margin-right: 8px;
}

.viewer-header .back-btn {
  display: none;
}

/* File List Rows Styling */
.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.file-row {
  --app-button-tone: var(--ui-text-primary-fg, var(--text));
  --app-button-height: 82px;
  --app-button-min-width: 0;
  --app-button-padding-x: 0;
  --app-button-gap: 0;
  --app-button-font-size: 12.5px;
  --app-button-hover-fill: var(--ui-state-hover-bg, var(--hover));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-hover-border: var(--ui-border-subtle-border, var(--border-subtle));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: 100%;
  height: 82px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0;
  background: transparent;
  color: var(--ui-text-primary-fg);
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: stretch;
  gap: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  white-space: normal;
}

.file-row :deep(.app-button-content) {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: start;
  gap: 0 9px;
  width: 100%;
  height: 100%;
  padding: 10px 12px;
  box-sizing: border-box;
}

.file-row :deep(.app-button-label) {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  white-space: normal;
  text-align: left;
}

.file-row :deep(.app-button-slotted-icon) {
  grid-column: 1;
  grid-row: 1;
  width: 17px;
  height: 17px;
  margin-top: 3px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.file-row :deep(.app-button-slotted-icon svg) {
  width: 17px;
  height: 17px;
  margin: 0;
  color: inherit;
}

.file-row:hover {
  --app-button-tone: var(--ui-text-primary-fg, var(--text));

  background: var(--ui-state-hover-bg, var(--hover));
  border-color: var(--ui-border-subtle-border, var(--border-subtle));
}

.file-row.active {
  background: var(--ui-state-selected-bg, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 9%, transparent));
  border-color: color-mix(in srgb, var(--ui-state-selected-border, var(--ui-accent-primary-fg, var(--accent))) 48%, transparent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

/* Notes Editor tab toggle bar */
.notes-editor-tabs {
  flex: 0 0 auto;
  margin: 0;
}

/* Rich Preview for Markdown notes */
.notes-viewer-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.memory-editor {
  flex: 1;
  width: 100%;
  padding: 16px;
  border: 0;
  resize: none;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary-fg);
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  line-height: 1.6;
}

.memory-preview-container {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
  line-height: 1.6;
  font-size: 13px;
  color: var(--ui-text-primary-fg);
}

/* Auto-save pulse visual states */
.save-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  margin-left: auto;
}

.notes-save-status {
  flex: 0 0 auto;
  margin-left: 2px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-text-muted-fg);
}

.status-dot.saved {
  background: var(--ui-status-success-fg, #10b981);
}

.status-dot.dirty {
  background: var(--ui-status-warning-fg, #f59e0b);
}

.status-dot.pulsing {
  animation: pulse-opacity 1s infinite alternate;
}

@keyframes pulse-opacity {
  from { opacity: 0.3; }
  to { opacity: 1; }
}

.strength-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.strength-badge.strong {
  background: var(--ui-status-success-bg, transparent);
  color: var(--ui-status-success-fg, #10b981);
}

.strength-badge.good {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.strength-badge.weak {
  background: color-mix(in srgb, var(--ui-text-muted-fg) 12%, transparent);
  color: var(--ui-text-muted-fg);
}

.segmented {
  display: flex;
  background: var(--ui-state-hover-bg, var(--hover));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  padding: 2px;
  border-radius: 6px;
  width: fit-content;
}

.segmented :deep(.app-button) {
  --app-button-height: 24px;
  --app-button-min-width: 0;
  --app-button-padding-x: 0;
  --app-button-gap: 0;
  --app-button-font-size: 11px;
  --app-button-tone: var(--ui-text-muted-fg, var(--muted));
  --app-button-hover-fill: transparent;
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  min-height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s ease;
}

.segmented :deep(.app-button-content) {
  width: auto;
  padding: 0 10px;
  box-sizing: border-box;
}

.segmented :deep(.app-button.active) {
  --app-button-tone: var(--ui-accent-primary-fg, var(--accent));

  background: var(--ui-surface-panel-bg, var(--bg-panel));
  color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.segmented :deep(.app-button:disabled) {
  cursor: default;
  opacity: 0.45;
}

.text-btn {
  --app-button-height: 28px;
  --app-button-min-width: 0;
  --app-button-padding-x: 0;
  --app-button-gap: 0;
  --app-button-font-size: 11.5px;
  --app-button-tone: var(--ui-text-secondary-fg, var(--text-secondary));
  --app-button-hover-fill: var(--ui-state-hover-bg, var(--hover));
  --app-button-hover-fg: var(--ui-text-primary-fg, var(--text));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  height: 28px;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  border: 1px solid transparent;
  padding: 0;
  font-size: 11.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.text-btn :deep(.app-button-content) {
  width: auto;
  padding: 0 8px;
  box-sizing: border-box;
}

.text-btn:hover:not(:disabled) {
  --app-button-tone: var(--ui-text-primary-fg, var(--text));

  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.text-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.file-main {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 7px;
  flex: 1;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}

.file-icon {
  grid-column: 1;
  grid-row: 1;
  margin-top: 3px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.file-title-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  height: 23px;
  overflow: hidden;
}

.file-name {
  min-width: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ui-text-primary-fg, var(--text));
  line-height: 23px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview {
  font-size: 11.8px;
  line-height: 1.42;
  height: 34px;
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary)) 88%, var(--ui-text-primary-fg, var(--text)) 12%);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-date {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted-fg, var(--muted));
  line-height: 23px;
  min-width: 54px;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* Adaptiveness overrides for narrow viewports */
@media (max-width: 768px) {
  .notes-header {
    flex-wrap: wrap;
    align-items: stretch;
  }

  .notes-header-actions {
    flex-basis: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .notes-filter-control {
    flex: 1 1 100%;
    min-width: 0;
  }

  .notes-save-status {
    margin-left: 0;
  }

  .profile-section :deep(.collapse-panel-header) {
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr) minmax(220px, 40%) !important;
  }

  .profile-section :deep(.collapse-panel-actions) {
    grid-column: auto;
    width: 100%;
    max-width: 100%;
    justify-self: end;
  }

  .profile-search-form {
    width: 100%;
    min-width: 0;
  }

  .notes-workspace {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .notes-list-surface {
    width: 100%;
    max-width: none;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(0);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
  }
  .viewer {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 2;
    background: var(--ui-surface-panel-bg, var(--bg-panel));
  }
  .detail-active .notes-list-surface {
    transform: translateX(-20%);
  }
  .detail-active .viewer {
    transform: translateX(0);
  }
  .workspace-head .back-btn,
  .viewer-header .back-btn {
    display: inline-flex;
    margin-right: 8px;
  }
}

@media (max-width: 620px) {
  .profile-section :deep(.collapse-panel-header) {
    grid-template-columns: auto minmax(0, 1fr) !important;
  }

  .profile-section :deep(.collapse-panel-actions) {
    grid-column: 2 / -1;
    justify-self: stretch;
  }
}

@media (max-height: 520px) {
  .memory-single-page {
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    padding: 10px 12px 12px;
  }

  .profile-section :deep(.collapse-panel-header) {
    min-height: 44px;
    padding: 8px 12px;
  }

  .memory-profile-table {
    height: 100%;
  }

  .memory-profile-table :deep(.app-table-scrollbar) {
    height: 100% !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}

</style>

<style>
.memory-page-shell .notes-workspace {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  gap: 0;
}

.memory-page-shell .notes-list-surface {
  flex: 1 1 clamp(220px, 42%, 520px) !important;
  width: auto;
  min-width: min(220px, 100%);
  max-width: min(560px, 58%);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
  border-right: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 50%, transparent);
}

.memory-page-shell .file-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.memory-page-shell .file-row {
  width: 100%;
  min-height: 82px !important;
  height: 82px !important;
  max-height: 82px !important;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
  text-align: left;
  display: flex !important;
  align-items: stretch;
  gap: 0;
  overflow: hidden;
  white-space: normal;
}

.memory-page-shell .file-row .app-button-content {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: start;
  gap: 0 9px;
  width: 100%;
  height: 100%;
  padding: 10px 12px;
  box-sizing: border-box;
}

.memory-page-shell .file-row .app-button-label {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  white-space: normal;
  text-align: left;
}

.memory-page-shell .file-row .app-button-slotted-icon {
  grid-column: 1;
  grid-row: 1;
  width: 17px;
  height: 17px;
  margin-top: 3px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.memory-page-shell .file-row:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: var(--ui-border-subtle-border, var(--border-subtle));
}

.memory-page-shell .file-row.active {
  background: var(--ui-state-selected-bg, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 9%, transparent));
  border-color: color-mix(in srgb, var(--ui-state-selected-border, var(--ui-accent-primary-fg, var(--accent))) 48%, transparent);
}

.memory-page-shell .file-icon {
  grid-column: 1;
  grid-row: 1;
  width: 17px;
  height: 17px;
  margin-top: 0;
  color: inherit;
}

.memory-page-shell .file-main {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 7px;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}

.memory-page-shell .file-title-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  height: 23px;
  overflow: hidden;
}

.memory-page-shell .file-title-row .badge {
  max-width: 82px;
}

.memory-page-shell .file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.5px;
  font-weight: 700;
  line-height: 23px;
}

.memory-page-shell .file-date {
  min-width: 54px;
  text-align: right;
  white-space: nowrap;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 600;
  line-height: 23px;
  font-variant-numeric: tabular-nums;
}

.memory-page-shell .file-preview {
  height: 34px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary)) 88%, var(--ui-text-primary-fg, var(--text)) 12%);
  font-size: 11.8px;
  line-height: 1.42;
  text-overflow: ellipsis;
}

.memory-page-shell.mode-side .notes-workspace,
.mode-side .memory-page-shell .notes-workspace {
  display: block;
}

.memory-page-shell.mode-side .notes-list-surface,
.mode-side .memory-page-shell .notes-list-surface {
  flex: none !important;
  width: 100%;
  min-width: 0;
  max-width: none;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(0);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}

.memory-page-shell.mode-side .detail-active .notes-list-surface,
.mode-side .memory-page-shell .detail-active .notes-list-surface {
  transform: translateX(-20%);
}

@media (max-width: 768px) {
  .memory-page-shell .notes-workspace {
    display: block;
  }

  .memory-page-shell .notes-list-surface {
    flex: none !important;
    width: 100%;
    min-width: 0;
    max-width: none;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(0);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
  }

  .memory-page-shell .detail-active .notes-list-surface {
    transform: translateX(-20%);
  }
}
</style>
