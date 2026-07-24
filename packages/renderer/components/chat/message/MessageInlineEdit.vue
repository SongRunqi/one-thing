<template>
  <div
    ref="containerRef"
    class="edit-container"
    @click.stop
  >
    <TextEditor
      ref="editEditor"
      v-model="content"
      class="edit-textarea"
      profile="inline-message"
      language="markdown"
      :min-height="60"
      :max-height="280"
      :select-on-focus="true"
      @keydown="handleKeyDown"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import TextEditor from '@/editor/TextEditor.vue'
import type { EditorHandle } from '@/editor'

const props = defineProps<{
  initialContent: string
  /**
   * Clicks inside this element keep editing alive (typically the whole
   * message bubble, not just this editor). Falls back to the editor
   * container itself.
   */
  boundary?: HTMLElement | null
}>()

const emit = defineEmits<{
  submit: [content: string]
  cancel: []
}>()

const containerRef = ref<HTMLElement | null>(null)
const editEditor = ref<EditorHandle | null>(null)
const content = ref(props.initialContent)
const isComposing = ref(false)

function handleKeyDown(e: KeyboardEvent) {
  if (isComposing.value || e.isComposing) return

  if (e.key === 'Escape') {
    emit('cancel')
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    const trimmed = content.value.trim()
    if (trimmed) {
      emit('submit', trimmed)
    }
  }
}

// Cancel editing when clicking outside the boundary. The listener only
// exists while this component is mounted; registration is deferred one task
// so the click that opened edit mode can never reach document and
// immediately cancel it.
let clickOutsideArmTimer: number | null = null

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node
  const boundary = props.boundary ?? containerRef.value
  if (boundary && !boundary.contains(target)) {
    emit('cancel')
  }
}

onMounted(() => {
  nextTick(() => {
    editEditor.value?.focus()
    editEditor.value?.setSelection(0, content.value.length)
  })
  clickOutsideArmTimer = window.setTimeout(() => {
    clickOutsideArmTimer = null
    document.addEventListener('click', handleClickOutside)
  }, 0)
})

onUnmounted(() => {
  if (clickOutsideArmTimer !== null) {
    clearTimeout(clickOutsideArmTimer)
    clickOutsideArmTimer = null
  }
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.edit-container {
  width: 100%;
}

/* Inline edit only exists for user messages; the semantic tokens resolve
   against the user-bubble context this component renders inside. */
.edit-textarea {
  width: 100%;
  --editor-font-size: var(--message-font-size, var(--type-chat-comfortable-size));
  min-height: 1.5em;
  max-height: 300px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--ui-message-user-fg, var(--text-user-primary));
  font-size: 15px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  overflow-y: auto;
  caret-color: var(--ui-accent-primary-fg, var(--accent));
}

.edit-textarea::-webkit-scrollbar {
  width: 4px;
}

.edit-textarea::-webkit-scrollbar-track {
  background: transparent;
}

.edit-textarea::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 30%, transparent);
  border-radius: 2px;
}
</style>
