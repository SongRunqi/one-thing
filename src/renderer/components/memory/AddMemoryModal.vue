<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Add Memory</h3>
            <button class="close-btn" @click="$emit('close')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <!-- Category -->
            <div class="form-group">
              <label class="form-label">Category</label>
              <div class="category-options">
                <button
                  v-for="cat in categories"
                  :key="cat.value"
                  class="category-btn"
                  :class="{ selected: category === cat.value }"
                  @click="category = cat.value"
                >
                  {{ cat.icon }} {{ cat.label }}
                </button>
              </div>
            </div>

            <!-- Content -->
            <div class="form-group">
              <label class="form-label">Memory</label>
              <textarea
                ref="contentInput"
                v-model="content"
                class="form-textarea"
                rows="3"
                placeholder="What would you like this agent to remember?"
              />
            </div>

            <!-- Emotional Weight -->
            <div class="form-group">
              <label class="form-label">Emotional Importance: {{ emotionalWeightLabel }}</label>
              <input
                type="range"
                v-model.number="emotionalWeight"
                min="1"
                max="10"
                class="form-slider"
              />
              <div class="slider-labels">
                <span>Routine</span>
                <span>Very Important</span>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="$emit('close')">Cancel</button>
            <button class="btn-save" :disabled="!canSave" @click="save">
              Add Memory
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { AgentMemoryCategory } from '@/types'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [data: { content: string; category: AgentMemoryCategory; emotionalWeight: number }]
}>()

const contentInput = ref<HTMLTextAreaElement | null>(null)
const content = ref('')
const category = ref<AgentMemoryCategory>('observation')
const emotionalWeight = ref(5)

const categories = [
  { value: 'observation' as const, label: 'Observation', icon: '👁' },
  { value: 'event' as const, label: 'Event', icon: '📅' },
  { value: 'feeling' as const, label: 'Feeling', icon: '💭' },
  { value: 'learning' as const, label: 'Learning', icon: '💡' },
]

const canSave = computed(() => content.value.trim().length > 0)

const emotionalWeightLabel = computed(() => {
  if (emotionalWeight.value <= 3) return 'Low'
  if (emotionalWeight.value <= 6) return 'Medium'
  return 'High'
})

function save() {
  if (!canSave.value) return
  emit('save', {
    content: content.value.trim(),
    category: category.value,
    emotionalWeight: emotionalWeight.value
  })
  reset()
}

function reset() {
  content.value = ''
  category.value = 'observation'
  emotionalWeight.value = 5
}

// Focus input when modal opens
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    reset()
    nextTick(() => {
      contentInput.value?.focus()
    })
  }
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  width: 420px;
  max-width: 90vw;
  background: var(--panel);
  border-radius: 16px;
  border: 1px solid var(--border);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
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
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

/* Category Options */
.category-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.category-btn {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.category-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.category-btn.selected {
  background: rgba(59, 130, 246, 0.15);
  border-color: var(--accent);
  color: var(--accent);
}

/* Textarea */
.form-textarea {
  padding: 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  resize: vertical;
  min-height: 80px;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.form-textarea::placeholder {
  color: var(--text-muted);
}

/* Slider */
.form-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  -webkit-appearance: none;
  background: var(--border);
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn-cancel,
.btn-save {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel {
  background: var(--hover);
  color: var(--text-primary);
}

.btn-cancel:hover {
  background: var(--active);
}

.btn-save {
  background: var(--accent);
  color: white;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(-10px);
}
</style>
