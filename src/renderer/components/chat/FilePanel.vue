<template>
  <div class="file-panel">
    <div v-if="loading" class="file-status">Loading...</div>
    <div v-else-if="error" class="file-status error">{{ error }}</div>
    <div v-else class="file-content-wrapper">
      <div class="file-toolbar">
        <div v-if="truncated" class="file-truncated-badge">
          First {{ maxSizeKb }}KB of {{ fileSizeDisplay }}
        </div>
        <div class="toolbar-spacer" />
        <button
          v-if="!editing"
          class="toolbar-btn"
          title="Edit file"
          @click="startEditing"
        >
          <Pencil :size="13" />
        </button>
        <template v-else>
          <button
            class="toolbar-btn save-btn"
            title="Save (⌘S)"
            :disabled="saving"
            @click="saveFile"
          >
            <Save :size="13" />
          </button>
          <button
            class="toolbar-btn"
            title="Cancel"
            @click="cancelEditing"
          >
            <X :size="13" />
          </button>
        </template>
      </div>
      <!-- Read-only highlighted view -->
      <pre
        v-if="!editing"
        class="file-content"
      ><code v-html="highlightedContent" /></pre>
      <!-- Edit mode -->
      <textarea
        v-else
        ref="editorRef"
        v-model="editContent"
        class="file-editor"
        spellcheck="false"
        @keydown="onEditorKeydown"
      />
    </div>
    <div class="file-status-bar">
      <span class="file-path">{{ filePath }}</span>
      <span v-if="editing && dirty" class="file-dirty">Modified</span>
      <span v-if="lang" class="file-lang">{{ lang }}</span>
      <span v-if="fileSize" class="file-size">{{ fileSizeDisplay }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Pencil, Save, X } from 'lucide-vue-next'
import hljs from 'highlight.js'

const props = withDefaults(defineProps<{
  filePath: string
  maxSizeKb?: number
}>(), {
  maxSizeKb: 256,
})

const content = ref('')
const loading = ref(true)
const error = ref('')
const truncated = ref(false)
const fileSize = ref(0)
const editing = ref(false)
const editContent = ref('')
const saving = ref(false)
const editorRef = ref<HTMLTextAreaElement | null>(null)

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  vue: 'xml', html: 'xml', htm: 'xml', svg: 'xml', xml: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  md: 'markdown', mdx: 'markdown',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  java: 'java', kt: 'kotlin', swift: 'swift',
  sh: 'bash', zsh: 'bash', bash: 'bash', fish: 'bash',
  sql: 'sql', graphql: 'graphql',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  lua: 'lua', php: 'php', r: 'r', dart: 'dart',
}

const ext = computed(() => {
  const parts = props.filePath.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
})

const lang = computed(() => EXT_TO_LANG[ext.value] || '')

const highlightedContent = computed(() => {
  if (!content.value) return ''
  const language = lang.value
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(content.value, { language, ignoreIllegals: true }).value
    } catch { /* fall through */ }
  }
  return hljs.highlightAuto(content.value).value
})

const dirty = computed(() => editContent.value !== content.value)

const fileSizeDisplay = computed(() => {
  if (fileSize.value < 1024) return `${fileSize.value}B`
  if (fileSize.value < 1048576) return `${Math.round(fileSize.value / 1024)}KB`
  return `${(fileSize.value / 1048576).toFixed(1)}MB`
})

async function loadFile() {
  loading.value = true
  error.value = ''
  content.value = ''
  truncated.value = false
  editing.value = false

  try {
    const maxBytes = props.maxSizeKb * 1024
    const res = await window.electronAPI.readFileContent(props.filePath, maxBytes)
    if (!res.success) {
      error.value = res.error || 'Failed to read file'
      return
    }
    content.value = res.content || ''
    fileSize.value = res.size || 0
    truncated.value = (res.size || 0) > maxBytes
  } catch (e: any) {
    error.value = e.message || 'Failed to read file'
  } finally {
    loading.value = false
  }
}

function startEditing() {
  editContent.value = content.value
  editing.value = true
  nextTick(() => editorRef.value?.focus())
}

function cancelEditing() {
  editing.value = false
}

async function saveFile() {
  saving.value = true
  try {
    const res = await window.electronAPI.saveFileContent(props.filePath, editContent.value)
    if (!res.success) {
      error.value = res.error || 'Failed to save'
      return
    }
    content.value = editContent.value
    editing.value = false
  } catch (e: any) {
    error.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

function onEditorKeydown(e: KeyboardEvent) {
  // ⌘S / Ctrl+S to save
  if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    saveFile()
    return
  }
  // Tab inserts spaces
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = editorRef.value
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    editContent.value = editContent.value.substring(0, start) + '  ' + editContent.value.substring(end)
    nextTick(() => {
      ta.selectionStart = ta.selectionEnd = start + 2
    })
  }
}

onMounted(loadFile)
watch(() => props.filePath, loadFile)
</script>

<style scoped>
.file-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.file-status {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--muted);
  font-size: 14px;
}

.file-status.error {
  color: #ef4444;
}

.file-toolbar {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 4px;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 5px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.12s ease;
}

.toolbar-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.toolbar-btn.save-btn {
  color: var(--accent);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.file-truncated-badge {
  font-size: 11px;
  color: var(--muted);
  padding: 2px 8px;
  background: rgba(234, 179, 8, 0.1);
  border-radius: 4px;
}

.file-content-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.file-content {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 12px 16px;
  font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre;
  tab-size: 4;
  background: transparent;
}

.file-content :deep(code) {
  font-family: inherit;
  background: transparent;
}

.file-editor {
  flex: 1;
  margin: 0;
  padding: 12px 16px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  tab-size: 4;
  overflow: auto;
}

.file-status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 16px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}

.file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-dirty {
  color: var(--accent);
  font-weight: 500;
}

.file-lang {
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
