<template>
  <div class="custom-tool-editor">
    <div class="editor-header">
      <h4 class="editor-title">{{ isNew ? 'Add Tool' : 'Edit Tool' }}</h4>
      <button class="close-btn" @click="$emit('cancel')" title="Cancel">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="editor-form">
      <!-- Basic Info -->
      <div class="form-section">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tool ID</label>
            <input
              v-model="form.id"
              class="form-input"
              type="text"
              placeholder="e.g., git-status"
              :disabled="!isNew"
            />
          </div>
          <div class="form-group">
            <label class="form-label">Name</label>
            <input
              v-model="form.name"
              class="form-input"
              type="text"
              placeholder="e.g., Git Status"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Description</label>
          <input
            v-model="form.description"
            class="form-input"
            type="text"
            placeholder="Describe what this tool does"
          />
        </div>
      </div>

      <!-- Execution Type -->
      <div class="form-section">
        <label class="form-label">Execution Type</label>
        <div class="execution-type-tabs">
          <button
            class="type-tab"
            :class="{ active: form.executionType === 'bash' }"
            @click="form.executionType = 'bash'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            Bash
          </button>
          <button
            class="type-tab"
            :class="{ active: form.executionType === 'http' }"
            @click="form.executionType = 'http'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            HTTP
          </button>
        </div>

        <!-- Bash Execution Config -->
        <div v-if="form.executionType === 'bash'" class="execution-config">
          <div class="form-group">
            <label class="form-label">Command</label>
            <textarea
              v-model="form.bashCommand"
              class="form-textarea code"
              placeholder="git status"
              rows="2"
            />
            <span class="form-hint">Use <code>&#123;&#123;param&#125;&#125;</code> for parameter interpolation</span>
          </div>
          <div class="form-group">
            <label class="form-label">Timeout (ms) <span class="optional">(optional)</span></label>
            <input
              v-model.number="form.bashTimeout"
              class="form-input"
              type="number"
              placeholder="30000"
            />
          </div>
        </div>

        <!-- HTTP Execution Config -->
        <div v-if="form.executionType === 'http'" class="execution-config">
          <div class="form-row">
            <div class="form-group method-select">
              <label class="form-label">Method</label>
              <select v-model="form.httpMethod" class="form-select">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div class="form-group flex-grow">
              <label class="form-label">URL</label>
              <input
                v-model="form.httpUrl"
                class="form-input code"
                type="text"
                placeholder="https://api.example.com/{{endpoint}}"
              />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Headers <span class="optional">(JSON, optional)</span></label>
            <textarea
              v-model="form.httpHeaders"
              class="form-textarea code"
              placeholder='{"Authorization": "Bearer {{token}}"}'
              rows="2"
            />
          </div>
          <div class="form-group">
            <label class="form-label">Body Template <span class="optional">(optional)</span></label>
            <textarea
              v-model="form.httpBody"
              class="form-textarea code"
              placeholder='{"query": "{{query}}"}'
              rows="3"
            />
          </div>
        </div>

      </div>

      <!-- Parameters -->
      <div class="form-section">
        <div class="section-header">
          <label class="form-label">Parameters</label>
          <button class="add-param-btn" @click="addParameter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add
          </button>
        </div>

        <div v-if="form.parameters.length === 0" class="empty-params">
          No parameters defined
        </div>

        <div v-else class="params-list">
          <div
            v-for="(param, index) in form.parameters"
            :key="index"
            class="param-item"
          >
            <div class="param-row">
              <input
                v-model="param.name"
                class="param-input name"
                type="text"
                placeholder="name"
              />
              <select v-model="param.type" class="param-select">
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
                <option value="array">array</option>
              </select>
              <label class="required-toggle">
                <input
                  type="checkbox"
                  v-model="param.required"
                />
                Required
              </label>
              <button class="remove-param-btn" @click="removeParameter(index)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <input
              v-model="param.description"
              class="param-input description"
              type="text"
              placeholder="Description"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="editor-actions">
      <button class="btn secondary" @click="$emit('cancel')">Cancel</button>
      <button
        class="btn primary"
        :disabled="!isValid"
        @click="handleSave"
      >
        {{ isNew ? 'Add Tool' : 'Save Changes' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import type { CustomToolDefinition, CustomToolParameter, CustomToolParameterType } from '@/types'

const props = defineProps<{
  tool?: CustomToolDefinition
  isNew?: boolean
}>()

const emit = defineEmits<{
  save: [tool: CustomToolDefinition]
  cancel: []
}>()

interface ParamForm {
  name: string
  type: CustomToolParameterType
  description: string
  required: boolean
}

const form = reactive({
  id: '',
  name: '',
  description: '',
  executionType: 'bash' as 'bash' | 'http',
  // Bash
  bashCommand: '',
  bashTimeout: 30000,
  // HTTP
  httpMethod: 'GET' as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  httpUrl: '',
  httpHeaders: '',
  httpBody: '',
  // Parameters
  parameters: [] as ParamForm[],
})

// Initialize form from prop
watch(() => props.tool, (tool) => {
  if (tool) {
    form.id = tool.id
    form.name = tool.name
    form.description = tool.description
    form.parameters = tool.parameters.map(p => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required,
    }))

    // Set execution type and config
    if (tool.execution.type === 'bash') {
      form.executionType = 'bash'
      form.bashCommand = tool.execution.command
      form.bashTimeout = tool.execution.timeout || 30000
    } else if (tool.execution.type === 'http') {
      form.executionType = 'http'
      form.httpMethod = tool.execution.method
      form.httpUrl = tool.execution.url
      form.httpHeaders = tool.execution.headers ? JSON.stringify(tool.execution.headers, null, 2) : ''
      form.httpBody = tool.execution.bodyTemplate || ''
    }
  }
}, { immediate: true })

const isValid = computed(() => {
  if (!form.id.trim() || !form.name.trim() || !form.description.trim()) {
    return false
  }

  if (form.executionType === 'bash' && !form.bashCommand.trim()) {
    return false
  }

  if (form.executionType === 'http' && !form.httpUrl.trim()) {
    return false
  }

  return true
})

function addParameter() {
  form.parameters.push({
    name: '',
    type: 'string',
    description: '',
    required: true,
  })
}

function removeParameter(index: number) {
  form.parameters.splice(index, 1)
}

function handleSave() {
  if (!isValid.value) return

  const parameters: CustomToolParameter[] = form.parameters
    .filter(p => p.name.trim())
    .map(p => ({
      name: p.name.trim(),
      type: p.type,
      description: p.description.trim(),
      required: p.required,
    }))

  let execution: CustomToolDefinition['execution']

  if (form.executionType === 'bash') {
    execution = {
      type: 'bash',
      command: form.bashCommand.trim(),
      timeout: form.bashTimeout || undefined,
    }
  } else {
    // HTTP
    let headers: Record<string, string> | undefined
    try {
      headers = form.httpHeaders.trim() ? JSON.parse(form.httpHeaders) : undefined
    } catch {
      headers = undefined
    }

    execution = {
      type: 'http',
      method: form.httpMethod,
      url: form.httpUrl.trim(),
      headers,
      bodyTemplate: form.httpBody.trim() || undefined,
    }
  }

  const tool: CustomToolDefinition = {
    id: form.id.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    parameters,
    execution,
  }

  emit('save', tool)
}
</script>

<style scoped>
.custom-tool-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-elevated);
  border-radius: 12px;
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.editor-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.close-btn {
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

.close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.editor-form {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-section {
  margin-bottom: 24px;
}

.form-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group.method-select {
  width: 100px;
  flex-shrink: 0;
}

.form-group.flex-grow {
  flex: 1;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 6px;
}

.optional {
  font-weight: 400;
  color: var(--muted);
}

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.form-textarea.code,
.form-input.code {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
}

.form-select {
  cursor: pointer;
}

.form-hint {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

/* Execution Type Tabs */
.execution-type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.type-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.type-tab:hover {
  background: var(--active);
}

.type-tab.active {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: var(--accent);
  color: var(--accent);
}

.execution-config {
  padding: 16px;
  background: var(--hover);
  border-radius: 8px;
}

/* Parameters */
.add-param-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-param-btn:hover {
  background: rgba(var(--accent-rgb), 0.2);
}

.empty-params {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  background: var(--hover);
  border-radius: 8px;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.param-item {
  padding: 12px;
  background: var(--hover);
  border-radius: 8px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.param-input {
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.param-input.name {
  width: 120px;
}

.param-input.description {
  width: 100%;
}

.param-select {
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.required-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
}

.required-toggle input {
  accent-color: var(--accent);
}

.remove-param-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.remove-param-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Actions */
.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn.secondary {
  background: var(--hover);
  border: 1px solid var(--border);
  color: var(--text);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--active);
}
</style>
