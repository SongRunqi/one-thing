<template>
  <Teleport to="body">
    <Transition name="preview-fade">
      <div
        v-if="visible"
        class="image-preview-overlay"
        @click="close"
      >
        <div
          class="preview-container"
          @click.stop
        >
          <img
            :src="src"
            :alt="alt"
            class="preview-image"
            :style="imageStyle"
            @wheel="handleWheel"
          >
        </div>

        <!-- Controls -->
        <div class="preview-controls">
          <button
            class="control-btn"
            title="Zoom out"
            @click.stop="zoomOut"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <line
                x1="21"
                y1="21"
                x2="16.65"
                y2="16.65"
              />
              <line
                x1="8"
                y1="11"
                x2="14"
                y2="11"
              />
            </svg>
          </button>
          <span class="zoom-level">{{ Math.round(scale * 100) }}%</span>
          <button
            class="control-btn"
            title="Zoom in"
            @click.stop="zoomIn"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <line
                x1="21"
                y1="21"
                x2="16.65"
                y2="16.65"
              />
              <line
                x1="11"
                y1="8"
                x2="11"
                y2="14"
              />
              <line
                x1="8"
                y1="11"
                x2="14"
                y2="11"
              />
            </svg>
          </button>
          <button
            class="control-btn"
            title="Reset"
            @click.stop="resetZoom"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>

        <!-- Close button -->
        <button
          class="close-btn"
          title="Close (ESC)"
          @click="close"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
            />
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            />
          </svg>
        </button>

        <!-- File name -->
        <div
          v-if="alt"
          class="preview-filename"
        >
          {{ alt }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface Props {
  visible: boolean
  src: string
  alt?: string
}

const props = withDefaults(defineProps<Props>(), {
  alt: ''
})

const emit = defineEmits<{
  close: []
}>()

const scale = ref(1)
const minScale = 0.1
const maxScale = 5

const imageStyle = computed(() => ({
  transform: `scale(${scale.value})`,
}))

function close() {
  emit('close')
}

function zoomIn() {
  scale.value = Math.min(scale.value * 1.25, maxScale)
}

function zoomOut() {
  scale.value = Math.max(scale.value / 1.25, minScale)
}

function resetZoom() {
  scale.value = 1
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.deltaY < 0) {
    zoomIn()
  } else {
    zoomOut()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.visible) return

  if (e.key === 'Escape') {
    close()
  } else if (e.key === '+' || e.key === '=') {
    zoomIn()
  } else if (e.key === '-') {
    zoomOut()
  } else if (e.key === '0') {
    resetZoom()
  }
}

// Reset scale when opening
watch(() => props.visible, (visible) => {
  if (visible) {
    scale.value = 1
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.image-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.preview-container {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 90vw;
  max-height: 85vh;
  overflow: hidden;
}

.preview-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  transition: transform 0.15s ease-out;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.preview-controls {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 24px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.zoom-level {
  min-width: 48px;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
}

.preview-filename {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  max-width: 80%;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Transition animations */
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.2s ease;
}

.preview-fade-enter-active .preview-image,
.preview-fade-leave-active .preview-image {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}

.preview-fade-enter-from .preview-image {
  transform: scale(0.9);
}

.preview-fade-leave-to .preview-image {
  transform: scale(0.9);
}
</style>
