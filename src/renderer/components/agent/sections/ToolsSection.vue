<template>
  <div class="tools-section">
    <div class="section-header">
      <div class="section-info">
        <label class="form-label">Custom Tools</label>
        <span class="tool-count">{{ customTools.length }} tool{{ customTools.length !== 1 ? 's' : '' }}</span>
      </div>
      <button
        class="add-tool-btn"
        @click="addNewTool"
      >
        <Plus
          :size="16"
          :stroke-width="2"
        />
        Add Tool
      </button>
    </div>

    <div
      v-if="customTools.length === 0"
      class="empty-tools"
    >
      <div class="empty-tools-icon">
        <Wrench
          :size="32"
          :stroke-width="1.5"
        />
      </div>
      <p class="empty-tools-text">
        No tools defined yet
      </p>
      <p class="empty-tools-hint">
        Add custom tools that this agent can use to complete tasks
      </p>
    </div>

    <div
      v-else
      class="tools-list"
    >
      <div
        v-for="(tool, index) in customTools"
        :key="tool.id"
        class="tool-item"
      >
        <div class="tool-info">
          <div class="tool-header">
            <span class="tool-name">{{ tool.name || 'Unnamed Tool' }}</span>
            <span
              class="tool-type"
              :class="tool.execution.type"
            >
              {{ tool.execution.type }}
            </span>
          </div>
          <p class="tool-description">
            {{ tool.description || 'No description' }}
          </p>
          <div class="tool-meta">
            <span class="param-count">{{ tool.parameters.length }} param{{ tool.parameters.length !== 1 ? 's' : '' }}</span>
            <span
              v-if="tool.execution.type === 'bash'"
              class="exec-preview"
            >
              {{ truncateCommand(tool.execution.command) }}
            </span>
            <span
              v-else-if="tool.execution.type === 'http'"
              class="exec-preview"
            >
              {{ tool.execution.method }} {{ truncateUrl(tool.execution.url) }}
            </span>
            <span
              v-else-if="tool.execution.type === 'builtin'"
              class="exec-preview"
            >
              {{ tool.execution.toolId }}
            </span>
          </div>
        </div>
        <div class="tool-actions">
          <button
            class="tool-action-btn"
            title="Edit"
            @click="editTool(index)"
          >
            <Pencil
              :size="16"
              :stroke-width="2"
            />
          </button>
          <button
            class="tool-action-btn danger"
            title="Remove"
            @click="removeTool(index)"
          >
            <Trash2
              :size="16"
              :stroke-width="2"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Tool Editor Dialog -->
    <Teleport to="body">
      <div
        v-if="showToolEditor"
        class="tool-editor-overlay"
        @click.self="closeToolEditor"
      >
        <div class="tool-editor-dialog">
          <CustomToolEditor
            :tool="editingTool"
            :mode="editingToolIndex === -1 ? 'create' : 'edit'"
            @save="handleToolSave"
            @cancel="closeToolEditor"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Wrench, Pencil, Trash2 } from 'lucide-vue-next'
import CustomToolEditor from '../../CustomToolEditor.vue'
import type { CustomToolDefinition } from '@/types'

interface Props {
  customTools: CustomToolDefinition[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:customTools': [value: CustomToolDefinition[]]
}>()

// Tool editor state
const showToolEditor = ref(false)
const editingToolIndex = ref(-1)
const editingTool = ref<CustomToolDefinition | null>(null)

function addNewTool() {
  editingToolIndex.value = -1
  editingTool.value = null
  showToolEditor.value = true
}

function editTool(index: number) {
  editingToolIndex.value = index
  editingTool.value = { ...props.customTools[index] }
  showToolEditor.value = true
}

function removeTool(index: number) {
  const newTools = [...props.customTools]
  newTools.splice(index, 1)
  emit('update:customTools', newTools)
}

function handleToolSave(tool: CustomToolDefinition) {
  const newTools = [...props.customTools]

  if (editingToolIndex.value === -1) {
    // Adding new tool
    newTools.push(tool)
  } else {
    // Updating existing tool
    newTools[editingToolIndex.value] = tool
  }

  emit('update:customTools', newTools)
  closeToolEditor()
}

function closeToolEditor() {
  showToolEditor.value = false
  editingToolIndex.value = -1
  editingTool.value = null
}

// Helpers for display
function truncateCommand(cmd: string): string {
  if (cmd.length <= 40) return cmd
  return cmd.slice(0, 40) + '...'
}

function truncateUrl(url: string): string {
  if (url.length <= 30) return url
  return url.slice(0, 30) + '...'
}
</script>

<style scoped>
.tools-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.tool-count {
  font-size: 12px;
  color: var(--muted);
  padding: 2px 8px;
  background: var(--hover);
  border-radius: 10px;
}

.add-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-tool-btn:hover {
  background: rgba(var(--accent-rgb), 0.2);
}

/* Empty Tools */
.empty-tools {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  background: var(--hover);
  border-radius: 12px;
  border: 1px dashed var(--border);
}

.empty-tools-icon {
  color: var(--muted);
  opacity: 0.5;
  margin-bottom: 12px;
}

.empty-tools-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 4px;
}

.empty-tools-hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}

/* Tools List */
.tools-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: var(--hover);
  border-radius: 10px;
  border: 1px solid var(--border);
  transition: all 0.15s ease;
}

.tool-item:hover {
  border-color: var(--muted);
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.tool-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.tool-type {
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  border-radius: 4px;
}

.tool-type.bash {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.tool-type.http {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.tool-type.builtin {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.tool-description {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}

.param-count {
  padding: 2px 6px;
  background: var(--bg);
  border-radius: 4px;
}

.exec-preview {
  font-family: monospace;
  opacity: 0.7;
}

.tool-actions {
  display: flex;
  gap: 4px;
}

.tool-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-action-btn:hover {
  background: var(--bg);
  color: var(--text);
}

.tool-action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Tool Editor Overlay */
.tool-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 20px;
}

.tool-editor-dialog {
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  background: var(--bg);
  border-radius: 16px;
  overflow: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
</style>
