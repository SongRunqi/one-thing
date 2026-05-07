<template>
  <Transition name="picker-slide">
    <div
      v-if="visible && filteredItems.length > 0"
      class="command-picker"
    >
      <div class="command-list">
        <div
          v-for="(item, index) in filteredItems"
          :key="item.id"
          :class="['command-item', { selected: index === selectedIndex }]"
          @click="selectItem(item)"
          @mouseenter="selectedIndex = index"
        >
          <div class="command-info">
            <div class="command-title-row">
              <div class="command-name">
                {{ item.title }}
              </div>
              <div :class="['command-type', item.type]">
                {{ item.type }}
              </div>
            </div>
            <div class="command-description">
              {{ item.description }}
            </div>
          </div>
          <div class="command-usage">
            {{ item.usage || item.type }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { SkillDefinition } from '@/types'
import type { PaletteItem } from '@/types/palette'
import { filterPaletteItems } from '@/services/palette'

interface Props {
  visible: boolean
  query: string
  skills?: SkillDefinition[]
}

interface Emits {
  (e: 'select', item: PaletteItem): void
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const selectedIndex = ref(0)

// Filter commands and skills by query
const filteredItems = computed(() => {
  return filterPaletteItems(props.query, props.skills || [])
})

// Reset selected index when query changes
watch(
  () => [props.query, props.visible, filteredItems.value.length],
  () => {
    selectedIndex.value = 0
  }
)

// Handle keyboard navigation
function handleKeyDown(e: KeyboardEvent) {
  if (!props.visible) return

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      selectedIndex.value = Math.max(0, selectedIndex.value - 1)
      break
    case 'ArrowDown':
      e.preventDefault()
      selectedIndex.value = Math.min(filteredItems.value.length - 1, selectedIndex.value + 1)
      break
    case 'Tab':
    case 'Enter':
      if (filteredItems.value.length > 0) {
        e.preventDefault()
        selectItem(filteredItems.value[selectedIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      emit('close')
      break
  }
}

function selectItem(item: PaletteItem) {
  emit('select', item)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.command-picker {
  margin-bottom: 6px;
  background: color-mix(in srgb, var(--panel-2) 88%, transparent);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.10);
  overflow: hidden;
  z-index: var(--z-dropdown);
}

.command-list {
  max-height: 188px;
  overflow-y: auto;
  padding: 4px;
}

.command-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.command-item:hover,
.command-item.selected {
  background: var(--hover);
}

.command-item.selected {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.command-info {
  flex: 1;
  min-width: 0;
}

.command-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.command-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.command-type {
  font-size: 9px;
  line-height: 1;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.command-type.skill {
  color: var(--accent);
}

.command-description {
  font-size: 12px;
  color: var(--muted);
  margin-top: 1px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-usage {
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: var(--muted);
  padding: 0;
  background: transparent;
  border-radius: 0;
  flex-shrink: 0;
  margin-top: 2px;
}

.command-item.selected .command-usage {
  color: var(--accent);
}

/* Enter/leave transitions */
.picker-slide-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.picker-slide-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.picker-slide-enter-from,
.picker-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
