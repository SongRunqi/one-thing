<template>
  <ComposerExtensionPanel
    :visible="visible"
    title="Composer palette"
    :count="items.length"
    :loading="loading"
    :error="error"
    :empty-text="emptyText"
  >
    <template #icon>
      <Terminal :size="14" />
    </template>

    <div
      ref="listRef"
      class="composer-extension-list"
    >
      <div
        v-for="(item, index) in items"
        :key="item.id"
        :class="['composer-extension-row', { selected: index === selectedIndex }]"
        :title="getItemTooltip(item)"
        @click="selectItem(item)"
        @mouseenter="emit('highlight', index)"
      >
        <div class="composer-extension-row-icon">
          <component
            :is="getItemIcon(item)"
            :size="15"
            :stroke-width="2"
          />
        </div>
        <div class="composer-extension-row-main">
          <div class="composer-extension-row-title">
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
import { FileText, Sparkles, Terminal, Zap } from 'lucide-vue-next'
import ComposerExtensionPanel from './ComposerExtensionPanel.vue'
import type { ComposerExtensionItem } from '@/composables/usePickerOrchestration'
import type { PaletteItem } from '@/types/palette'

const props = withDefaults(defineProps<{
  visible: boolean
  items: ComposerExtensionItem[]
  selectedIndex: number
  query?: string
  loading?: boolean
  error?: string | null
}>(), {
  query: '',
  loading: false,
  error: null,
})

const emit = defineEmits<{
  select: [item: PaletteItem]
  highlight: [index: number]
  close: []
}>()

const listRef = ref<HTMLElement | null>(null)

const emptyText = computed(() => {
  const query = props.query.trim()
  return query ? `No palette matches "${query}"` : 'No palette items available'
})

function getItemIcon(item: ComposerExtensionItem) {
  if (item.kind === 'skill') return Sparkles
  if (item.kind === 'prompt') return FileText
  if (item.kind === 'action') return Zap
  return Terminal
}

function selectItem(item: ComposerExtensionItem) {
  if (item.paletteItem) {
    emit('select', item.paletteItem)
  }
}

function getItemTooltip(item: ComposerExtensionItem) {
  const meta = item.meta ? `\n${item.meta}` : ''
  return `${item.title}\n${item.description || ''}${meta}`
}

function scrollToSelected() {
  const selected = listRef.value?.querySelector('.composer-extension-row.selected')
  selected?.scrollIntoView({ block: 'nearest' })
}

watch(
  () => [props.selectedIndex, props.visible, props.items.length],
  () => {
    nextTick(scrollToSelected)
  },
)
</script>
