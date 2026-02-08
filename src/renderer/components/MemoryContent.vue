<template>
  <div class="memory-content">
    <!-- Header -->
    <div class="memory-header">
      <div class="header-left">
        <h2 class="title">
          Memory Files
        </h2>
        <span
          v-if="!isLoading"
          class="file-count"
        >{{ memoryStore.totalFiles }} files</span>
      </div>
      <div class="header-actions">
        <button
          class="action-btn"
          :disabled="isExporting || memoryStore.totalFiles === 0"
          title="Export"
          @click="handleExport"
        >
          <Download
            :size="16"
            :stroke-width="2"
          />
        </button>
        <button
          class="action-btn"
          :disabled="isImporting"
          title="Import"
          @click="handleImport"
        >
          <Upload
            :size="16"
            :stroke-width="2"
          />
        </button>
        <button
          class="action-btn"
          title="Open folder"
          @click="openMemoryFolder"
        >
          <FolderOpen
            :size="16"
            :stroke-width="2"
          />
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="search-section">
      <div class="search-wrapper">
        <Search
          class="search-icon"
          :size="14"
          :stroke-width="2"
        />
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search memories..."
          @input="memoryStore.setSearchQuery(searchQuery)"
        >
        <button
          v-if="searchQuery"
          class="clear-btn"
          @click="clearSearch"
        >
          <X
            :size="14"
            :stroke-width="2"
          />
        </button>
      </div>
    </div>

    <!-- Tag Filters -->
    <div
      v-if="memoryStore.tagCloud.length > 0"
      class="tag-section"
    >
      <!-- Collapsed view: show top tags + expand button -->
      <div class="tag-filters-row">
        <span class="tag-label">Tags:</span>
        <div class="tag-list">
          <button
            v-for="tag in topTags"
            :key="tag.tag"
            :class="['tag-btn', { active: memoryStore.selectedTags.includes(tag.tag) }]"
            :style="getTagStyle(tag.tag, memoryStore.selectedTags.includes(tag.tag))"
            @click="memoryStore.toggleTagFilter(tag.tag)"
          >
            {{ tag.tag }}
            <span class="tag-count">{{ tag.count }}</span>
          </button>
        </div>
        <button
          v-if="memoryStore.tagCloud.length > 5"
          class="expand-btn"
          @click="tagExpanded = !tagExpanded"
        >
          <ChevronDown
            :size="14"
            :class="{ rotated: tagExpanded }"
          />
          <span>{{ tagExpanded ? 'Less' : `+${memoryStore.tagCloud.length - 5} more` }}</span>
        </button>
        <button
          v-if="memoryStore.selectedTags.length > 0"
          class="clear-filters-btn"
          @click="memoryStore.clearFilters()"
        >
          Clear
        </button>
      </div>

      <!-- Expanded view: show all tags grouped -->
      <div
        v-if="tagExpanded"
        class="tag-expanded"
      >
        <div class="tag-group">
          <div class="tag-group-header">
            <span class="group-label">Popular</span>
            <span class="group-count">{{ popularTags.length }}</span>
          </div>
          <div class="tag-group-items">
            <button
              v-for="tag in popularTags"
              :key="tag.tag"
              :class="['tag-btn', { active: memoryStore.selectedTags.includes(tag.tag) }]"
              :style="getTagStyle(tag.tag, memoryStore.selectedTags.includes(tag.tag))"
              @click="memoryStore.toggleTagFilter(tag.tag)"
            >
              {{ tag.tag }}
              <span class="tag-count">{{ tag.count }}</span>
            </button>
          </div>
        </div>
        <div
          v-if="otherTags.length > 0"
          class="tag-group"
        >
          <div class="tag-group-header">
            <span class="group-label">Other</span>
            <span class="group-count">{{ otherTags.length }}</span>
          </div>
          <div class="tag-group-items">
            <button
              v-for="tag in otherTags"
              :key="tag.tag"
              :class="['tag-btn', { active: memoryStore.selectedTags.includes(tag.tag) }]"
              :style="getTagStyle(tag.tag, memoryStore.selectedTags.includes(tag.tag))"
              @click="memoryStore.toggleTagFilter(tag.tag)"
            >
              {{ tag.tag }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="loading-state"
    >
      <div class="loading-spinner" />
      <span>Loading memories...</span>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="memoryStore.filteredFiles.length === 0"
      class="empty-state"
    >
      <FileText
        :size="48"
        :stroke-width="1.5"
        class="empty-icon"
      />
      <p
        v-if="memoryStore.totalFiles === 0"
        class="empty-title"
      >
        No memory files yet
      </p>
      <p
        v-else
        class="empty-title"
      >
        No files match your search
      </p>
      <p class="empty-desc">
        Memory files are created when AI learns from conversations.
      </p>
    </div>

    <!-- File List -->
    <div
      v-else
      class="file-list"
    >
      <div
        v-for="file in memoryStore.filteredFiles"
        :key="file.path"
        class="file-item"
        @click="openEditor(file.path)"
      >
        <div class="file-info">
          <div class="file-title">
            {{ file.title }}
          </div>
          <div class="file-path">
            {{ file.path }}
          </div>
          <div class="file-meta">
            <div
              v-if="file.metadata.tags?.length"
              class="file-tags"
              :title="file.metadata.tags.join(', ')"
            >
              <button
                v-for="tag in file.metadata.tags.slice(0, 2)"
                :key="tag"
                class="tag"
                :style="getTagStyle(tag, false)"
                @click.stop="memoryStore.toggleTagFilter(tag)"
              >
                {{ tag }}
              </button>
              <span
                v-if="file.metadata.tags.length > 2"
                class="more-tags"
                :title="file.metadata.tags.slice(2).join(', ')"
              >
                +{{ file.metadata.tags.length - 2 }}
              </span>
            </div>
            <span class="file-date">{{ formatDate(file.metadata.updated || file.metadata.created) }}</span>
          </div>
        </div>
        <button
          class="delete-btn"
          title="Delete"
          @click.stop="handleDelete(file.path)"
        >
          <Trash2
            :size="14"
            :stroke-width="2"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMemoryManagerStore } from '@/stores/memory-manager'
import {
  Search,
  X,
  Download,
  Upload,
  FolderOpen,
  FileText,
  Trash2,
  ChevronDown
} from 'lucide-vue-next'

const emit = defineEmits<{
  'open-file': [filePath: string]
}>()

const memoryStore = useMemoryManagerStore()

// List view state
const searchQuery = ref('')
const isLoading = ref(false)
const isExporting = ref(false)
const isImporting = ref(false)
const tagExpanded = ref(false)

// Tag computed properties
const topTags = computed(() => memoryStore.tagCloud.slice(0, 5))
const popularTags = computed(() => memoryStore.tagCloud.filter(t => t.count >= 2))
const otherTags = computed(() => memoryStore.tagCloud.filter(t => t.count < 2))

// Generate consistent color for a tag based on its name
const TAG_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },   // blue
  { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },    // green
  { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7' },   // purple
  { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316' },   // orange
  { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899' },   // pink
  { bg: 'rgba(20, 184, 166, 0.15)', text: '#14b8a6' },   // teal
  { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },   // amber
  { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1' },   // indigo
]

function getTagColor(tag: string) {
  // Simple hash to get consistent color for each tag
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

function getTagStyle(tag: string, isActive: boolean) {
  if (isActive) {
    return {
      background: 'var(--accent)',
      borderColor: 'var(--accent)',
      color: 'white'
    }
  }
  const color = getTagColor(tag)
  return {
    background: color.bg,
    borderColor: 'transparent',
    color: color.text
  }
}

// Load data on mount
onMounted(async () => {
  isLoading.value = true
  try {
    await memoryStore.loadAll()
  } finally {
    isLoading.value = false
  }
})

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

function clearSearch() {
  searchQuery.value = ''
  memoryStore.clearFilters()
}

// Open file in ChatContainer editor
function openEditor(path: string) {
  emit('open-file', path)
}

async function handleDelete(path: string) {
  const fileName = path.split('/').pop() || path
  if (confirm(`Delete "${fileName}"?`)) {
    await memoryStore.deleteFile(path)
  }
}

async function handleExport() {
  isExporting.value = true
  try {
    const filePath = await memoryStore.exportWithDialog({ includeMetadata: true })
    if (filePath) {
      alert(`Exported to: ${filePath}`)
    }
  } finally {
    isExporting.value = false
  }
}

async function handleImport() {
  isImporting.value = true
  try {
    const result = await memoryStore.importWithDialog()
    if (result) {
      alert(`Imported: ${result.imported} files\nSkipped: ${result.skipped} files`)
    }
  } finally {
    isImporting.value = false
  }
}

async function openMemoryFolder() {
  try {
    const dataPath = await window.electronAPI.getDataPath()
    await window.electronAPI.openPath(`${dataPath}/memory`)
  } catch (err) {
    console.error('Failed to open memory folder:', err)
  }
}
</script>

<style scoped>
.memory-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Header */
.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.file-count {
  font-size: 12px;
  color: var(--text-muted);
  padding: 2px 8px;
  background: var(--hover);
  border-radius: 10px;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text-primary);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Search */
.search-section {
  padding: 12px 20px;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 10px 36px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: all 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-faint);
}

.clear-btn {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--hover);
  color: var(--text-muted);
  cursor: pointer;
}

/* Tag Section */
.tag-section {
  padding: 0 20px 12px;
}

.tag-filters-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tag-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  margin-right: 4px;
}

.tag-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tag-btn:hover {
  filter: brightness(0.95);
  transform: translateY(-1px);
}

.tag-btn.active {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  color: white !important;
}

.tag-count {
  font-size: 10px;
  opacity: 0.7;
}

.expand-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 16px;
  background: var(--hover);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.expand-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.expand-btn svg {
  transition: transform 0.2s ease;
}

.expand-btn svg.rotated {
  transform: rotate(180deg);
}

.clear-filters-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 16px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.clear-filters-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* Tag Expanded Section */
.tag-expanded {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tag-group {
  margin-bottom: 12px;
}

.tag-group:last-child {
  margin-bottom: 0;
}

.tag-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.group-count {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 8px;
  color: var(--text-muted);
}

.tag-group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
  color: var(--text-muted);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  color: var(--text-muted);
  opacity: 0.4;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  max-width: 280px;
}

/* File List */
.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.file-item:hover {
  border-color: var(--accent);
  background: var(--hover);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
}

.file-tags {
  display: flex;
  align-items: center;
  gap: 4px;
}

.file-tags .tag {
  padding: 2px 8px;
  border: none;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.file-tags .tag:hover {
  filter: brightness(0.9);
  transform: scale(1.05);
}

.more-tags {
  font-size: 11px;
  color: var(--text-muted);
  cursor: help;
}

.file-date {
  color: var(--text-muted);
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
}

.file-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* ======================== EDITOR VIEW STYLES ======================== */

/* Editor Header */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
}

.editor-header .header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.editor-title-area {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.editor-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-path-badge {
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  color: var(--text-muted);
  padding: 2px 8px;
  background: var(--bg);
  border-radius: 6px;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Editor Tabs */
.editor-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-app);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--accent);
  color: white;
}

.tab-shortcut {
  font-size: 10px;
  opacity: 0.6;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.tab-btn.active .tab-shortcut {
  opacity: 0.8;
}

/* Editor Body */
.editor-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

/* Content Tab */
.content-tab {
  display: flex;
  flex-direction: column;
}

.full-editor {
  width: 100%;
  flex: 1;
  min-height: 400px;
  padding: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  resize: none;
  transition: border-color 0.15s ease;
}

.full-editor:focus {
  outline: none;
  border-color: var(--accent);
}

.full-editor::placeholder {
  color: var(--text-faint);
}

/* Metadata Tab */
.metadata-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.metadata-section {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-header svg {
  color: var(--text-muted);
}

/* Tags Editor */
.tags-editor {
  padding: 16px;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
}

.remove-tag {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.15);
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
  transition: all 0.15s ease;
}

.remove-tag:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.25);
}

.tag-input-wrapper {
  flex: 1;
  min-width: 100px;
}

.tag-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px dashed var(--border);
  border-radius: 16px;
  background: transparent;
  font-size: 12px;
  color: var(--text-primary);
  transition: all 0.15s ease;
}

.tag-input:focus {
  outline: none;
  border-color: var(--accent);
  border-style: solid;
}

.tag-input::placeholder {
  color: var(--text-faint);
}

/* File Info Grid */
.info-grid {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-label {
  width: 80px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  flex-shrink: 0;
}

.info-value {
  font-size: 13px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-value.monospace {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.importance-stars {
  display: flex;
  gap: 2px;
  color: var(--accent);
}

.importance-value {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 4px;
}

/* Editor Footer */
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.footer-hint kbd {
  padding: 2px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 11px;
}

.hint-divider {
  margin: 0 4px;
  opacity: 0.5;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.secondary {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.primary {
  background: var(--accent);
  border: none;
  color: white;
}

.btn.primary:hover {
  opacity: 0.9;
}

.btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
