<template>
  <div class="prompt-section">
    <div class="prompt-header">
      <label class="form-label">System Prompt</label>
      <span class="char-count" :class="{ warning: systemPrompt.length > 5000 }">
        {{ systemPrompt.length.toLocaleString() }} characters
      </span>
    </div>

    <div class="prompt-editor-container">
      <textarea
        ref="textareaRef"
        :value="systemPrompt"
        @input="handleInput"
        class="prompt-editor"
        placeholder="Define the agent's behavior, expertise, and how it should use its tools...

Examples of what to include:
- The agent's role and personality
- What tasks it should help with
- How it should approach problems
- Any specific instructions or constraints"
        @keydown="handleKeydown"
      />
    </div>

    <div class="prompt-tips">
      <div class="tip">
        <FileText :size="14" :stroke-width="2" />
        <span>Write clear, specific instructions for best results</span>
      </div>
      <div class="tip">
        <Lightbulb :size="14" :stroke-width="2" />
        <span>Include examples of expected behavior when helpful</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { FileText, Lightbulb } from 'lucide-vue-next'

interface Props {
  systemPrompt: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:systemPrompt': [value: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  emit('update:systemPrompt', target.value)
  adjustHeight()
}

function handleKeydown(e: KeyboardEvent) {
  // Allow Tab to insert 2 spaces instead of moving focus
  if (e.key === 'Tab') {
    e.preventDefault()
    const textarea = e.target as HTMLTextAreaElement
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = textarea.value

    // Insert 2 spaces
    const newValue = value.substring(0, start) + '  ' + value.substring(end)
    emit('update:systemPrompt', newValue)

    // Move cursor after the inserted spaces
    nextTick(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2
    })
  }
}

function adjustHeight() {
  const textarea = textareaRef.value
  if (!textarea) return

  // Reset height to recalculate
  textarea.style.height = 'auto'

  // Set to scroll height but respect min-height
  const newHeight = Math.max(400, textarea.scrollHeight)
  textarea.style.height = newHeight + 'px'
}

// Adjust height on mount and when content changes
onMounted(() => {
  adjustHeight()
})

watch(() => props.systemPrompt, () => {
  nextTick(adjustHeight)
})
</script>

<style scoped>
.prompt-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.char-count {
  font-size: 12px;
  color: var(--muted);
  font-family: monospace;
}

.char-count.warning {
  color: #f59e0b;
}

.prompt-editor-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.prompt-editor {
  width: 100%;
  min-height: 400px;
  padding: 16px;
  font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
  line-height: 1.6;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 12px;
  resize: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.prompt-editor:hover {
  border-color: var(--muted);
}

.prompt-editor:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.prompt-editor::placeholder {
  color: var(--muted);
  opacity: 0.7;
}

.prompt-tips {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--hover);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.tip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.tip svg {
  flex-shrink: 0;
  color: var(--muted);
  opacity: 0.7;
}
</style>
