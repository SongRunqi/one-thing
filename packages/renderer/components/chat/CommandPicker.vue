<template>
  <ComposerExtensionPanel
    :visible="visible"
    title="Command palette"
    :count="items.length"
    :loading="loading"
    :error="error"
    :empty-text="emptyText"
    :empty-hint="emptyHint"
    :hints="HINTS"
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
          <div class="composer-extension-row-description">
            {{ item.description }}
          </div>
        </div>
        <span
          class="composer-extension-row-meta command-kind"
          aria-hidden="true"
        >{{ kindLabel(item.kind) }}</span>
        <div
          class="composer-extension-row-kbd"
          aria-hidden="true"
        >
          ⏎
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

/** Keyboard legend under the list — the palette is the one picker with
 * enough bindings to be worth spelling out. */
const HINTS = ['↑↓ move', '⏎ run', 'tab complete', 'esc dismiss']

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

/** What kind of entry this row is (command / skill / action / prompt). It
 * rides in the shared meta slot and only surfaces on the selected row — the
 * moment you need to know a command's kind is the moment you've landed on
 * it, so every other row spends its width on the description instead. */
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
 * characters can carry ink (see docs/design/command-palette/quiet-rows.html) —
 * emphasis is weight and darkness, never a second colour. */
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

<style scoped>
/* The kind is the palette's meta slot, but unlike a file size or a skill's
   source it is not worth reading on every row — it appears only where the
   cursor is. The slot still reserves no width, so nothing shifts. */
.command-kind {
  visibility: hidden;
}

.composer-extension-row.selected .command-kind {
  visibility: visible;
}

/* Matched characters gain weight and ink — the same emphasis axis the
   selected row uses, not a separate accent colour. */
.command-hit {
  color: var(--ui-text-primary-fg);
  font-weight: 700;
}
</style>
