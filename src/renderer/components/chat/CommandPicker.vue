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
          :title="getItemTooltip(item)"
          @click="selectItem(item)"
          @mouseenter="selectedIndex = index"
        >
          <div class="command-info">
            <div class="command-name">
              {{ item.title }}
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
import { refreshPluginCommands } from '@/services/commands'

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
const commandVersion = ref(0)

// Filter commands and skills by query
const filteredItems = computed(() => {
  commandVersion.value
  return filterPaletteItems(props.query, props.skills || [])
})

async function loadPluginCommands() {
  await refreshPluginCommands()
  commandVersion.value += 1
}

// Reset selected index when query changes
watch(
  () => [props.query, props.visible, filteredItems.value.length],
  () => {
    selectedIndex.value = 0
  }
)

watch(
  () => props.visible,
  visible => {
    if (visible) loadPluginCommands()
  }
)

// Handle keyboard navigation
function handleKeyDown(e: KeyboardEvent) {
  if (!props.visible) return

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      e.stopPropagation()
      selectedIndex.value = Math.max(0, selectedIndex.value - 1)
      break
    case 'ArrowDown':
      e.preventDefault()
      e.stopPropagation()
      selectedIndex.value = Math.min(filteredItems.value.length - 1, selectedIndex.value + 1)
      break
    case 'Tab':
    case 'Enter':
      if (filteredItems.value.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        selectItem(filteredItems.value[selectedIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      e.stopPropagation()
      emit('close')
      break
  }
}

function selectItem(item: PaletteItem) {
  emit('select', item)
}

function getItemTooltip(item: PaletteItem) {
  const usage = item.usage ? `\n${item.usage}` : ''
  return `${item.title}\n${item.description}${usage}`
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, true)
  loadPluginCommands()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
})
</script>

<style scoped>
.command-picker {
  position: relative;
  width: calc(100% - 28px);
  height: 142px;
  margin: 0 auto 16px;
  background: rgba(var(--bg-rgb, 30, 30, 35), 0.58);
  border: 0.5px solid color-mix(in srgb, rgba(var(--accent-rgb), 0.35) 42%, var(--border));
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.10), 0 0 0 0.5px rgba(var(--accent-rgb), 0.08);
  backdrop-filter: blur(22px) saturate(1.16);
  -webkit-backdrop-filter: blur(22px) saturate(1.16);
  overflow: hidden;
  z-index: calc(var(--z-dropdown) + 1);
}

.command-list {
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 5px;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--accent-rgb), 0.32) transparent;
}

.command-list::-webkit-scrollbar {
  width: 4px;
}

.command-list::-webkit-scrollbar-track {
  background: transparent;
}

.command-list::-webkit-scrollbar-thumb {
  background: rgba(var(--accent-rgb), 0.28);
  border-radius: 999px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 9px;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}

.command-item:hover {
  background: rgba(var(--accent-rgb), 0.06);
}

.command-item.selected {
  background: rgba(var(--accent-rgb), 0.11);
}

.command-info {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.command-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  font-family: var(--font-sans);
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-description {
  font-size: 11px;
  color: var(--text-muted, var(--muted));
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.68;
}

.command-usage {
  font-size: 11px;
  font-family: var(--font-sans);
  color: var(--text-muted, var(--muted));
  padding: 0;
  background: transparent;
  border-radius: 0;
  flex-shrink: 0;
  margin-left: 10px;
  opacity: 0.58;
}

.command-item.selected .command-usage {
  color: var(--accent);
  opacity: 0.9;
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
