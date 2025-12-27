<template>
  <div class="fact-card" :class="{ editing: isEditing }">
    <!-- Edit Mode -->
    <template v-if="isEditing">
      <div class="edit-form">
        <textarea
          ref="editInput"
          v-model="editContent"
          class="edit-textarea"
          rows="2"
          placeholder="Enter fact content..."
        />
        <div class="edit-controls">
          <div class="confidence-slider">
            <label>Confidence: {{ editConfidence }}%</label>
            <input
              type="range"
              v-model.number="editConfidence"
              min="0"
              max="100"
              class="slider"
            />
          </div>
          <div class="edit-actions">
            <button class="btn-cancel" @click="cancelEdit">Cancel</button>
            <button class="btn-save" @click="saveEdit">Save</button>
          </div>
        </div>
      </div>
    </template>

    <!-- View Mode -->
    <template v-else>
      <div class="fact-content">
        <p class="fact-text">{{ fact.content }}</p>
      </div>
      <div class="fact-meta">
        <span class="confidence-badge" :class="confidenceClass">
          {{ fact.confidence }}%
        </span>
        <span v-if="sourcesDisplay" class="sources">
          {{ sourcesDisplay }}
        </span>
        <span class="timestamp">{{ relativeTime }}</span>
      </div>
      <div class="fact-actions">
        <button class="action-btn edit-btn" @click="startEdit" title="Edit">
          <Pencil :size="14" :stroke-width="2" />
        </button>
        <button class="action-btn delete-btn" @click="confirmDelete" title="Delete">
          <Trash2 :size="14" :stroke-width="2" />
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { UserFact } from '@/types'
import { Pencil, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  fact: UserFact
}>()

const emit = defineEmits<{
  update: [factId: string, updates: { content?: string; confidence?: number }]
  delete: [factId: string]
}>()

// Edit state
const isEditing = ref(false)
const editContent = ref('')
const editConfidence = ref(0)
const editInput = ref<HTMLTextAreaElement | null>(null)

// Computed
const confidenceClass = computed(() => {
  if (props.fact.confidence >= 80) return 'high'
  if (props.fact.confidence >= 50) return 'medium'
  return 'low'
})

const sourcesDisplay = computed(() => {
  if (!props.fact.sources || props.fact.sources.length === 0) return null
  if (props.fact.sources.length === 1) return `From ${props.fact.sources[0]}`
  return `From ${props.fact.sources.length} agents`
})

const relativeTime = computed(() => {
  const now = Date.now()
  const diff = now - props.fact.createdAt
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  if (months > 0) return `${months}mo ago`
  if (weeks > 0) return `${weeks}w ago`
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
})

// Methods
function startEdit() {
  editContent.value = props.fact.content
  editConfidence.value = props.fact.confidence
  isEditing.value = true
  nextTick(() => {
    editInput.value?.focus()
  })
}

function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
  editConfidence.value = 0
}

function saveEdit() {
  if (!editContent.value.trim()) return

  const updates: { content?: string; confidence?: number } = {}
  if (editContent.value !== props.fact.content) {
    updates.content = editContent.value.trim()
  }
  if (editConfidence.value !== props.fact.confidence) {
    updates.confidence = editConfidence.value
  }

  if (Object.keys(updates).length > 0) {
    emit('update', props.fact.id, updates)
  }
  isEditing.value = false
}

function confirmDelete() {
  emit('delete', props.fact.id)
}
</script>

<style scoped>
.fact-card {
  position: relative;
  padding: 12px 14px;
  background: var(--bg);
  border-radius: 10px;
  border: 1px solid var(--border);
  transition: all 0.2s ease;
}

.fact-card:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.1);
}

.fact-card:hover .fact-actions {
  opacity: 1;
}

.fact-card.editing {
  background: var(--hover);
}

/* View Mode */
.fact-content {
  margin-bottom: 8px;
}

.fact-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}

.fact-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.confidence-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(107, 114, 128, 0.2);
  color: var(--text-muted);
}

.confidence-badge.high {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.confidence-badge.medium {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.confidence-badge.low {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.sources {
  font-size: 11px;
  color: var(--text-muted);
}

.timestamp {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.7;
}

/* Actions */
.fact-actions {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  color: var(--text-primary);
}

.edit-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* Edit Mode */
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  resize: vertical;
  min-height: 60px;
}

.edit-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.edit-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.confidence-slider {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.confidence-slider label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.slider {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  -webkit-appearance: none;
  background: var(--border);
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
}

.edit-actions {
  display: flex;
  gap: 8px;
}

.btn-cancel,
.btn-save {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel {
  background: var(--bg);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.btn-cancel:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.btn-save {
  background: var(--accent);
  color: white;
}

.btn-save:hover {
  opacity: 0.9;
}
</style>
