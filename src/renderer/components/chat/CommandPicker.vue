<template>
  <ComposerExtensionPanel
    :visible="visible"
    title="Command palette"
    :count="items.length"
    :loading="loading"
    :error="error"
    :empty-text="emptyText"
    :empty-hint="emptyHint"
    variant="command"
  >
    <div
      ref="listRef"
      class="composer-extension-list command-palette-list"
      role="listbox"
      aria-label="Command palette"
      :aria-activedescendant="activeOptionId"
    >
      <div
        v-for="(item, index) in items"
        :id="getOptionId(item, index)"
        :key="item.id"
        :class="['composer-extension-row', { selected: index === selectedIndex }]"
        :data-command-index="index"
        role="option"
        :aria-selected="index === selectedIndex"
        :aria-posinset="index + 1"
        :aria-setsize="items.length"
        :data-kind="item.kind"
        :data-command-kind="item.kind"
        :title="getItemTooltip(item)"
        @mousedown.prevent
        @click="selectItem(item)"
        @mouseenter="highlightItem(index)"
      >
        <span
          class="command-kind"
          aria-hidden="true"
        >{{ kindLabel(item.kind) }}</span>
        <div class="composer-extension-row-main">
          <div class="composer-extension-row-title">
            <template
              v-for="(segment, segmentIndex) in titleSegments(item.title)"
              :key="segmentIndex"
            >
              <span
                v-if="segment.hit"
                class="command-hit"
              >{{ segment.text }}</span><template v-else>
                {{ segment.text }}
              </template>
            </template>
          </div>
          <span
            class="command-leader"
            aria-hidden="true"
          />
          <div class="composer-extension-row-description">
            {{ item.description }}
          </div>
        </div>
        <div
          class="composer-extension-row-kbd"
          aria-hidden="true"
        >
          {{ index === selectedIndex ? '⏎' : '' }}
        </div>
      </div>
    </div>
  </ComposerExtensionPanel>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
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

/* Wheel-scrolling sweeps rows under the cursor, firing mouseenter →
 * highlight for each; following those with scroll-into-view would yank the
 * list back and fight the user's scroll. Only keyboard/content changes
 * scroll-follow. */
let pointerDrivenSelection = false

const itemSignature = computed(() => props.items.map(item => item.id).join('\u001f'))
const activeOptionId = computed(() => {
  const item = props.items[props.selectedIndex]
  return item ? getOptionId(item, props.selectedIndex) : undefined
})

const emptyText = computed(() => {
  const query = props.query.trim()
  return query ? `No matches for "${query}"` : 'No palette items'
})

const emptyHint = computed(() => {
  return props.query.trim()
    ? 'Try a command, prompt, or skill name'
    : 'Type to narrow commands, prompts, and skills'
})

/** Margin-column label for the ledger layout: what kind of entry this row
 * books (command / skill / action / prompt). */
const KIND_LABELS: Partial<Record<ComposerExtensionItem['kind'], string>> = {
  command: 'cmd',
  skill: 'skill',
  action: 'action',
  prompt: 'prompt',
}

function kindLabel(kind: ComposerExtensionItem['kind']) {
  return KIND_LABELS[kind] ?? kind
}

function selectItem(item: ComposerExtensionItem) {
  if (item.paletteItem) {
    emit('select', item.paletteItem)
  }
}

function highlightItem(index: number) {
  pointerDrivenSelection = true
  emit('highlight', index)
}

interface TitleSegment {
  text: string
  hit: boolean
}

/** Splits the command title around the first query match so the matched
 * characters render in accent, per the ledger mockup
 * (docs/design/command-palette/inkline-four-options.html, 案一). */
function titleSegments(title: string): TitleSegment[] {
  const query = props.query.trim().toLowerCase()
  if (!query) return [{ text: title, hit: false }]
  const start = title.toLowerCase().indexOf(query)
  if (start < 0) return [{ text: title, hit: false }]
  const end = start + query.length
  return [
    { text: title.slice(0, start), hit: false },
    { text: title.slice(start, end), hit: true },
    { text: title.slice(end), hit: false },
  ].filter(segment => segment.text)
}

function getItemTooltip(item: ComposerExtensionItem) {
  const meta = item.meta ? `\n${item.meta}` : ''
  return `${item.title}\n${item.description || ''}${meta}`
}

function getOptionId(item: ComposerExtensionItem, index: number) {
  const stableId = item.id.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `command-palette-option-${index}-${stableId}`
}

function resetScrollPosition() {
  const scroller = listRef.value?.parentElement
  if (scroller) scroller.scrollTop = 0
}

function syncSelectedIntoView() {
  const list = listRef.value
  if (!list || props.items.length === 0 || props.selectedIndex < 0) return
  const selected = list.querySelector<HTMLElement>(`[data-command-index="${props.selectedIndex}"]`)
  selected?.scrollIntoView({ block: 'nearest' })
}

watch(
  () => [props.selectedIndex, props.visible, props.items.length, props.query, itemSignature.value] as const,
  ([, visible, , query, signature], previous) => {
    const previousVisible = previous?.[1] ?? false
    const previousQuery = previous?.[3]
    const previousSignature = previous?.[4]
    const contentChanged = visible && (
      !previousVisible ||
      query !== previousQuery ||
      signature !== previousSignature
    )
    const pointerDriven = pointerDrivenSelection
    pointerDrivenSelection = false

    nextTick(() => {
      if (contentChanged) {
        resetScrollPosition()
      }
      if (contentChanged || !pointerDriven) {
        syncSelectedIntoView()
      }
    })
  },
  { flush: 'post', immediate: true },
)
</script>
