<template>
  <div class="documents-tab">
    <!-- Header -->
    <div class="tab-header">
      <span class="header-title">Extracted Diagrams</span>
      <span class="doc-count">{{ documents.length }}</span>
    </div>

    <!-- Empty State -->
    <div v-if="documents.length === 0" class="empty-state">
      <FileCode :size="32" :stroke-width="1.5" />
      <p class="empty-text">No diagrams found</p>
      <p class="empty-hint">Mermaid, PlantUML, and chart diagrams from AI messages will appear here</p>
    </div>

    <!-- Documents List -->
    <div v-else class="documents-list">
      <div
        v-for="doc in documents"
        :key="doc.id"
        class="document-item"
        :class="{ expanded: expandedId === doc.id }"
      >
        <div class="doc-header" @click="toggleExpand(doc.id)">
          <div class="doc-info">
            <component :is="getIcon(doc.type)" :size="16" :stroke-width="1.5" class="doc-icon" />
            <span class="doc-type">{{ getTypeLabel(doc.type) }}</span>
          </div>
          <div class="doc-actions">
            <button class="action-btn" @click.stop="copyCode(doc.code)" title="Copy code">
              <Copy :size="14" :stroke-width="1.5" />
            </button>
            <ChevronDown :size="14" :stroke-width="1.5" class="expand-icon" />
          </div>
        </div>

        <!-- Expanded content -->
        <Transition name="expand">
          <div v-if="expandedId === doc.id" class="doc-content">
            <!-- Mermaid Preview -->
            <div v-if="doc.type === 'mermaid'" class="mermaid-preview" ref="mermaidContainer">
              <div v-html="renderMermaid(doc.code)"></div>
            </div>

            <!-- Code Preview for others -->
            <div v-else class="code-preview">
              <pre><code>{{ doc.code }}</code></pre>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { FileCode, GitGraph, Box, Copy, ChevronDown, Workflow } from 'lucide-vue-next'
import type { ExtractedDocument } from '@/types'
import { useChatStore } from '@/stores/chat'
import { useRightSidebarStore } from '@/stores/right-sidebar'

const props = defineProps<{
  sessionId?: string
}>()

const chatStore = useChatStore()
const rightSidebarStore = useRightSidebarStore()

const expandedId = ref<string | null>(null)

// Get documents from store
const documents = computed(() => rightSidebarStore.currentDocuments)

// Extract diagrams from messages when they change
watch(
  () => props.sessionId ? chatStore.sessionMessages.get(props.sessionId) : null,
  (messages) => {
    if (!props.sessionId || !messages) return
    const extracted = extractDocumentsFromMessages(messages)
    rightSidebarStore.setExtractedDocuments(props.sessionId, extracted)
  },
  { immediate: true, deep: true }
)

// Also extract on mount
onMounted(() => {
  if (props.sessionId) {
    const messages = chatStore.sessionMessages.get(props.sessionId)
    if (messages) {
      const extracted = extractDocumentsFromMessages(messages)
      rightSidebarStore.setExtractedDocuments(props.sessionId, extracted)
    }
  }
})

// Extract diagrams from messages
function extractDocumentsFromMessages(messages: any[]): ExtractedDocument[] {
  const docs: ExtractedDocument[] = []

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue

    // Get text content
    let textContent = ''
    if (msg.content) {
      textContent = msg.content
    }
    if (msg.contentParts) {
      for (const part of msg.contentParts) {
        if (part.type === 'text' && part.content) {
          textContent += '\n' + part.content
        }
      }
    }

    // Extract Mermaid diagrams
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g
    let match
    while ((match = mermaidRegex.exec(textContent)) !== null) {
      docs.push({
        id: `mermaid-${msg.id}-${match.index}`,
        type: 'mermaid',
        code: match[1].trim(),
        messageId: msg.id,
        timestamp: msg.timestamp || Date.now(),
      })
    }

    // Extract PlantUML diagrams
    const plantumlRegex = /```plantuml\n([\s\S]*?)```/g
    while ((match = plantumlRegex.exec(textContent)) !== null) {
      docs.push({
        id: `plantuml-${msg.id}-${match.index}`,
        type: 'plantuml',
        code: match[1].trim(),
        messageId: msg.id,
        timestamp: msg.timestamp || Date.now(),
      })
    }

    // Extract chart/chartjs diagrams
    const chartRegex = /```(?:chart|chartjs)\n([\s\S]*?)```/g
    while ((match = chartRegex.exec(textContent)) !== null) {
      docs.push({
        id: `chart-${msg.id}-${match.index}`,
        type: 'chart',
        code: match[1].trim(),
        messageId: msg.id,
        timestamp: msg.timestamp || Date.now(),
      })
    }

    // Extract LaTeX math blocks
    const latexRegex = /```(?:latex|tex|math)\n([\s\S]*?)```/g
    while ((match = latexRegex.exec(textContent)) !== null) {
      docs.push({
        id: `latex-${msg.id}-${match.index}`,
        type: 'latex',
        code: match[1].trim(),
        messageId: msg.id,
        timestamp: msg.timestamp || Date.now(),
      })
    }
  }

  // Sort by timestamp descending (newest first)
  return docs.sort((a, b) => b.timestamp - a.timestamp)
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function getIcon(type: string) {
  switch (type) {
    case 'mermaid':
      return Workflow
    case 'plantuml':
      return GitGraph
    case 'chart':
      return Box
    default:
      return FileCode
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'mermaid':
      return 'Mermaid Diagram'
    case 'plantuml':
      return 'PlantUML'
    case 'chart':
      return 'Chart.js'
    case 'latex':
      return 'LaTeX'
    default:
      return 'Diagram'
  }
}

function copyCode(code: string) {
  navigator.clipboard.writeText(code)
}

function renderMermaid(code: string): string {
  // For now, just show the code. Full Mermaid rendering can be added later
  // using mermaid.js library
  return `<pre class="mermaid-code">${escapeHtml(code)}</pre>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
</script>

<style scoped>
.documents-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-divider);
  background: transparent;
}

.header-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.doc-count {
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--hover);
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--muted);
  text-align: center;
}

.empty-text {
  margin: 12px 0 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.empty-hint {
  font-size: 12px;
  color: var(--muted);
  max-width: 200px;
}

/* Documents list */
.documents-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.document-item {
  border-bottom: 1px solid var(--border);
}

.document-item:last-child {
  border-bottom: none;
}

.doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.doc-header:hover {
  background: var(--hover);
}

.doc-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-icon {
  color: var(--accent);
}

.doc-type {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.doc-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.expand-icon {
  color: var(--muted);
  transition: transform 0.15s ease;
}

.document-item.expanded .expand-icon {
  transform: rotate(180deg);
}

/* Content */
.doc-content {
  padding: 0 12px 12px;
  overflow: hidden;
}

.mermaid-preview,
.code-preview {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg);
  overflow-x: auto;
}

.mermaid-preview :deep(.mermaid-code),
.code-preview pre {
  margin: 0;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.code-preview code {
  background: none;
}

/* Expand animation */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
