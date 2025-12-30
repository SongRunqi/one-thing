<template>
  <div
    class="resize-handle"
    @mousedown="startResize"
  ></div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

interface Props {
  currentWidth: number
  minWidth?: number
  maxWidth?: number
}

interface Emits {
  (e: 'resize', width: number): void
  (e: 'resize-start'): void
  (e: 'resize-end'): void
}

const props = withDefaults(defineProps<Props>(), {
  minWidth: 200,
  maxWidth: 500,
})

const emit = defineEmits<Emits>()

const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

function startResize(event: MouseEvent) {
  isResizing.value = true
  startX.value = event.clientX
  startWidth.value = props.currentWidth

  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  emit('resize-start')
}

function handleResize(event: MouseEvent) {
  if (!isResizing.value) return
  const delta = event.clientX - startX.value
  const newWidth = Math.min(props.maxWidth, Math.max(props.minWidth, startWidth.value + delta))
  emit('resize', newWidth)
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''

  emit('resize-end')
}

onUnmounted(() => {
  // Clean up event listeners if component is unmounted during resize
  if (isResizing.value) {
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
})
</script>

<style scoped>
/* Resize Handle */
.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s ease;
  z-index: 10;
}

.resize-handle:hover {
  background: var(--accent);
}
</style>
