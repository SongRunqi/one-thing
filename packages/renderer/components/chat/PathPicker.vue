<template>
  <ComposerExtensionPanel
    :visible="visible"
    title="Directories"
    :count="items.length"
    :loading="loading"
    :error="error"
    :empty-text="emptyText"
    loading-text="Searching directories..."
  >
    <div
      ref="listRef"
      class="composer-extension-list"
    >
      <div
        v-for="(item, index) in items"
        :key="item.id"
        :class="['composer-extension-row', { selected: index === selectedIndex }]"
        @click="selectPath(item)"
        @mouseenter="highlightItem(index)"
      >
        <div class="composer-extension-row-icon">
          <Folder
            :size="15"
            :stroke-width="2"
          />
        </div>
        <div class="composer-extension-row-main">
          <div class="composer-extension-row-title path-title">
            {{ item.title }}
          </div>
          <div class="composer-extension-row-description">
            {{ item.description }}
          </div>
        </div>
        <div class="composer-extension-row-meta">
          {{ item.meta }}
        </div>
      </div>
    </div>
  </ComposerExtensionPanel>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Folder } from 'lucide-vue-next'
import ComposerExtensionPanel from './ComposerExtensionPanel.vue'
import type { ComposerExtensionItem } from '@/composables/usePickerOrchestration'

const props = withDefaults(defineProps<{
  visible: boolean
  items: ComposerExtensionItem[]
  selectedIndex: number
  pathInput?: string
  loading?: boolean
  error?: string | null
}>(), {
  pathInput: '',
  loading: false,
  error: null,
})

const emit = defineEmits<{
  select: [path: string]
  highlight: [index: number]
  close: []
}>()

const listRef = ref<HTMLElement | null>(null)

const emptyText = computed(() => {
  const query = props.pathInput.trim()
  return query ? 'No directories found' : 'No directories available'
})

function selectPath(item: ComposerExtensionItem) {
  if (item.value) {
    emit('select', item.value)
  }
}

/* Pointer-driven highlights must not scroll-follow: wheel-scrolling sweeps
 * rows under the cursor, and following each would fight the user's scroll. */
let pointerDrivenSelection = false

function highlightItem(index: number) {
  pointerDrivenSelection = true
  emit('highlight', index)
}

function scrollToSelected() {
  const selected = listRef.value?.querySelector('.composer-extension-row.selected')
  selected?.scrollIntoView({ block: 'nearest' })
}

watch(
  () => [props.selectedIndex, props.visible, props.items.length],
  () => {
    const pointerDriven = pointerDrivenSelection
    pointerDrivenSelection = false
    if (pointerDriven) return
    nextTick(scrollToSelected)
  },
)
</script>

<style scoped>
.path-title {
  font-family: var(--font-mono);
  font-weight: 500;
}
</style>
