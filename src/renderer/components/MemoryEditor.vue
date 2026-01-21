<template>
  <div class="memory-editor">
    <!-- Editor Header -->
    <div class="editor-header">
      <div class="header-left">
        <button
          class="back-btn"
          title="Back to list (Esc)"
          @click="emit('close')"
        >
          <ArrowLeft
            :size="18"
            :stroke-width="2"
          />
        </button>
        <div class="editor-title-area">
          <h2 class="editor-title">
            {{ editorTitle }}
          </h2>
          <span class="editor-path-badge">{{ props.filePath }}</span>
        </div>
      </div>
      <div class="header-actions">
        <button
          v-if="!isEditMode"
          class="edit-btn"
          title="Edit (⌘E)"
          @click="isEditMode = true"
        >
          <Edit2
            :size="14"
            :stroke-width="2"
          />
          <span>Edit</span>
        </button>
        <button
          v-else
          class="done-btn"
          title="Done editing"
          @click="isEditMode = false"
        >
          <Check
            :size="14"
            :stroke-width="2"
          />
          <span>Done</span>
        </button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="editor-tabs">
      <button
        :class="['tab-btn', { active: editorTab === 'content' }]"
        @click="editorTab = 'content'"
      >
        <FileText
          :size="14"
          :stroke-width="2"
        />
        <span>Content</span>
        <span class="tab-shortcut">⌘1</span>
      </button>
      <button
        :class="['tab-btn', { active: editorTab === 'metadata' }]"
        @click="editorTab = 'metadata'"
      >
        <Tag
          :size="14"
          :stroke-width="2"
        />
        <span>Metadata</span>
        <span class="tab-shortcut">⌘2</span>
      </button>
    </div>

    <!-- Tab Content -->
    <div class="editor-body">
      <!-- Content Tab -->
      <div
        v-if="editorTab === 'content'"
        class="tab-content content-tab"
      >
        <!-- View Mode: Rendered Markdown -->
        <div
          v-if="!isEditMode"
          class="markdown-view"
        >
          <!-- Metadata Card (简洁版) -->
          <div
            v-if="fileMetadata && hasVisibleMetadata"
            class="metadata-card"
          >
            <!-- Tags Row -->
            <div
              v-if="fileMetadata.tags?.length"
              class="metadata-tags"
            >
              <span
                v-for="tag in fileMetadata.tags"
                :key="tag"
                class="metadata-tag"
                :style="getTagStyle(tag, false)"
              >{{ tag }}</span>
            </div>

            <!-- Info Row: importance + updated + source -->
            <div class="metadata-info">
              <span
                v-if="fileMetadata.importance"
                class="info-item"
                :title="`Importance: ${fileMetadata.importance}/5`"
              >
                <Star
                  :size="12"
                  :stroke-width="2"
                  fill="currentColor"
                />
                <span>{{ fileMetadata.importance }}</span>
              </span>
              <span
                v-if="fileMetadata.updated"
                class="info-item"
                :title="formatFullDate(fileMetadata.updated)"
              >
                <Clock
                  :size="12"
                  :stroke-width="2"
                />
                <span>{{ formatRelativeDate(fileMetadata.updated) }}</span>
              </span>
              <span
                v-if="fileMetadata.source"
                class="info-item source"
              >
                {{ fileMetadata.source }}
              </span>
            </div>
          </div>

          <!-- Markdown Content (使用共享样式) -->
          <div
            class="content"
            v-html="renderedContent"
          />
        </div>

        <!-- Edit Mode: Textarea Editor -->
        <textarea
          v-else
          ref="editorTextarea"
          v-model="editContent"
          class="full-editor"
          placeholder="Memory content (Markdown supported)..."
          spellcheck="false"
        />
      </div>

      <!-- Metadata Tab -->
      <div
        v-if="editorTab === 'metadata'"
        class="tab-content metadata-tab"
      >
        <!-- Tags Section -->
        <div class="metadata-section">
          <div class="section-header">
            <Tag
              :size="14"
              :stroke-width="2"
            />
            <span>Tags</span>
          </div>
          <div class="tags-editor">
            <div class="tags-list">
              <span
                v-for="tag in editTags"
                :key="tag"
                class="tag-chip"
                :style="getTagStyle(tag, false)"
              >
                {{ tag }}
                <button
                  class="remove-tag"
                  @click="removeTag(tag)"
                >
                  <X
                    :size="12"
                    :stroke-width="2"
                  />
                </button>
              </span>
              <div class="tag-input-wrapper">
                <input
                  v-model="newTagInput"
                  type="text"
                  class="tag-input"
                  placeholder="Add tag..."
                  @keydown.enter.prevent="addTag"
                  @keydown.tab.prevent="addTag"
                >
              </div>
            </div>
          </div>
        </div>

        <!-- File Info Section -->
        <div class="metadata-section">
          <div class="section-header">
            <Info
              :size="14"
              :stroke-width="2"
            />
            <span>File Info</span>
          </div>
          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">Path</span>
              <span class="info-value monospace">{{ props.filePath }}</span>
            </div>
            <div
              v-if="selectedFileMetadata?.created"
              class="info-row"
            >
              <span class="info-label">Created</span>
              <span class="info-value">{{ formatFullDate(selectedFileMetadata.created) }}</span>
            </div>
            <div
              v-if="selectedFileMetadata?.updated"
              class="info-row"
            >
              <span class="info-label">Updated</span>
              <span class="info-value">{{ formatFullDate(selectedFileMetadata.updated) }}</span>
            </div>
            <div
              v-if="selectedFileMetadata?.importance !== undefined"
              class="info-row"
            >
              <span class="info-label">Importance</span>
              <span class="info-value">
                <span class="importance-stars">
                  <Star
                    v-for="n in 5"
                    :key="n"
                    :size="12"
                    :fill="n <= selectedFileMetadata.importance ? 'currentColor' : 'none'"
                    :stroke-width="2"
                  />
                </span>
                <span class="importance-value">{{ selectedFileMetadata.importance }}/5</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Editor Footer (only shown in edit mode) -->
    <div
      v-if="isEditMode"
      class="editor-footer"
    >
      <div class="footer-hint">
        <kbd>⌘</kbd><kbd>Enter</kbd> to save
        <span class="hint-divider">•</span>
        <kbd>Esc</kbd> to close
        <span class="hint-divider">•</span>
        <kbd>⌘</kbd><kbd>E</kbd> to view
      </div>
      <div class="footer-actions">
        <button
          class="btn secondary"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          class="btn primary"
          :disabled="!hasChanges"
          @click="saveAndClose"
        >
          <Check
            :size="14"
            :stroke-width="2"
          />
          Save Changes
        </button>
      </div>
    </div>

    <!-- View Mode Footer Hint -->
    <div
      v-else
      class="editor-footer view-footer"
    >
      <div class="footer-hint">
        <kbd>⌘</kbd><kbd>E</kbd> to edit
        <span class="hint-divider">•</span>
        <kbd>Esc</kbd> to close
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useMemoryManagerStore } from '@/stores/memory-manager'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import {
  ArrowLeft,
  FileText,
  Tag,
  X,
  Info,
  Star,
  Check,
  Edit2,
  Clock
} from 'lucide-vue-next'

const props = defineProps<{
  filePath: string
}>()

const emit = defineEmits<{
  close: []
}>()

const memoryStore = useMemoryManagerStore()

// Editor state
const editorTab = ref<'content' | 'metadata'>('content')
const isEditMode = ref(false)
const editContent = ref('')
const editTags = ref<string[]>([])
const newTagInput = ref('')
const originalContent = ref('')
const originalTags = ref<string[]>([])
const editorTextarea = ref<HTMLTextAreaElement | null>(null)

// Editor computed properties
const editorTitle = computed(() => {
  if (!memoryStore.selectedFile) return 'Memory File'
  return getFileTitle(memoryStore.selectedFile.content)
})

const selectedFileMetadata = computed(() => {
  return memoryStore.selectedFile?.metadata
})

const hasChanges = computed(() => {
  const contentChanged = editContent.value !== originalContent.value
  const tagsChanged = JSON.stringify(editTags.value.sort()) !== JSON.stringify(originalTags.value.sort())
  return contentChanged || tagsChanged
})

// Use metadata from store (backend already parsed YAML frontmatter)
const fileMetadata = computed(() => {
  return memoryStore.selectedFile?.metadata || null
})

// Clean up content for display (strip metadata + fix formatting issues)
function cleanContentForDisplay(content: string): string {
  let result = content

  // 1. Strip standard YAML frontmatter (--- ... ---)
  result = result.replace(/^---[\s\S]*?---\s*\n?/, '')

  // 2. Strip raw YAML-like metadata at the beginning
  let prevResult = ''
  while (prevResult !== result) {
    prevResult = result
    result = result.replace(/^(created|updated|lastAccessed|accessCount|version|source|sourceId|author|importance|feedbackPositive|feedbackNegative|lastFeedbackAt):\s*.+\n?/m, '')
    result = result.replace(/^tags:\s*\n?((\s*[-•]\s*.+\n?)*)/m, '')
    result = result.trimStart()
  }

  // 3. Fix malformed list items: "- - " or "- - - " → "- "
  result = result.replace(/^(\s*)[-•]\s+[-•]\s+/gm, '$1- ')

  // 4. Remove empty list items "- " followed by nothing meaningful
  result = result.replace(/^(\s*)[-•]\s*$/gm, '')

  // 5. Clean up excessive blank lines
  result = result.replace(/\n{3,}/g, '\n\n')

  return result.trim()
}

// Rendered markdown content
const renderedContent = computed(() => {
  const cleanContent = cleanContentForDisplay(editContent.value)
  return renderMarkdown(cleanContent, false)
})

// Check if there's any visible metadata to show in the card
const hasVisibleMetadata = computed(() => {
  const meta = fileMetadata.value
  if (!meta) return false
  return (meta.tags?.length ?? 0) > 0 || meta.importance || meta.updated || meta.source
})

// Tag colors
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

// Load file data
async function loadFile() {
  await memoryStore.selectFile(props.filePath)
  if (memoryStore.selectedFile) {
    editContent.value = memoryStore.selectedFile.content
    originalContent.value = memoryStore.selectedFile.content
    editTags.value = [...(memoryStore.selectedFile.metadata.tags || [])]
    originalTags.value = [...(memoryStore.selectedFile.metadata.tags || [])]
  }
}

onMounted(async () => {
  await loadFile()
  // Add keyboard listener
  window.addEventListener('keydown', handleKeydown)
  // Don't auto-focus in view mode
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  memoryStore.clearSelection()
})

// Watch for file path changes
watch(() => props.filePath, async () => {
  await loadFile()
})

// Keyboard shortcuts handler
function handleKeydown(e: KeyboardEvent) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const cmdKey = isMac ? e.metaKey : e.ctrlKey

  // Escape to close
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return
  }

  // Cmd/Ctrl + Enter to save (only in edit mode)
  if (cmdKey && e.key === 'Enter' && isEditMode.value) {
    e.preventDefault()
    saveAndClose()
    return
  }

  // Cmd/Ctrl + E to toggle edit mode
  if (cmdKey && e.key === 'e') {
    e.preventDefault()
    isEditMode.value = !isEditMode.value
    if (isEditMode.value) {
      // Focus textarea when entering edit mode
      nextTick(() => {
        editorTextarea.value?.focus()
      })
    }
    return
  }

  // Cmd/Ctrl + 1/2 to switch tabs
  if (cmdKey && (e.key === '1' || e.key === '2')) {
    e.preventDefault()
    editorTab.value = e.key === '1' ? 'content' : 'metadata'
    return
  }
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString()
}

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString()
}

function getFileTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1] : 'Memory File'
}

async function saveAndClose() {
  if (!hasChanges.value) return

  // TODO: Support saving tags when the store supports it
  // For now, just save content
  const success = await memoryStore.updateFile(props.filePath, editContent.value)
  if (success) {
    emit('close')
  }
}

// Tag editing functions
function addTag() {
  const tag = newTagInput.value.trim().toLowerCase().replace(/\s+/g, '-')
  if (tag && !editTags.value.includes(tag)) {
    editTags.value.push(tag)
  }
  newTagInput.value = ''
}

function removeTag(tag: string) {
  editTags.value = editTags.value.filter(t => t !== tag)
}
</script>

<style scoped>
@import '@/styles/markdown.css';

.memory-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--bg-app);
}

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
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

/* Content Tab */
.content-tab {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* View Mode */
.markdown-view {
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 24px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: auto;
}

/* Metadata Card in View Mode - Compact Style */
.metadata-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 16px;
}

.metadata-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.metadata-tag {
  display: inline-flex;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.metadata-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.info-item svg {
  opacity: 0.6;
}

.info-item.source {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  text-transform: capitalize;
}

/* Markdown Content Container */
.content {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.7;
}

/* Edit Mode */
.full-editor {
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 24px;
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

/* Header Actions */
.header-actions {
  display: flex;
  gap: 8px;
}

.edit-btn,
.done-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.edit-btn {
  background: var(--accent);
  color: white;
}

.edit-btn:hover {
  opacity: 0.9;
}

.done-btn {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.done-btn:hover {
  background: var(--hover);
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

.editor-footer.view-footer {
  justify-content: center;
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
