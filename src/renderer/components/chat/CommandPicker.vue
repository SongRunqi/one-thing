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
      :class="[
        'composer-extension-list',
        'command-palette-list',
        {
          'has-active-indicator': selectedIndex >= 0 && items.length > 0,
          'is-navigating': isNavigating,
          'is-scrollable': isScrollable,
          'at-scroll-start': atScrollStart,
          'at-scroll-end': atScrollEnd,
        },
      ]"
      role="listbox"
      aria-label="Command palette"
      :aria-activedescendant="activeOptionId"
    >
      <div
        v-for="(item, index) in items"
        :key="item.id"
        :id="getOptionId(item, index)"
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
const isNavigating = ref(false)
const isScrollable = ref(false)
const atScrollStart = ref(true)
const atScrollEnd = ref(true)
const itemSignature = computed(() => props.items.map(item => item.id).join('\u001f'))
let syncFrame: number | null = null
let resizeObserver: ResizeObserver | null = null
let navigationPulseTimer: number | null = null
let observedScroller: HTMLElement | null = null

const scrollerStateClasses = [
  'command-palette-scroller',
  'is-scrollable',
  'is-navigating',
  'at-scroll-start',
  'at-scroll-end',
] as const

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

function selectItem(item: ComposerExtensionItem) {
  if (item.paletteItem) {
    emit('select', item.paletteItem)
  }
}

function highlightItem(index: number) {
  emit('highlight', index)
  scheduleActiveSync(false)
}

function getItemTooltip(item: ComposerExtensionItem) {
  const meta = item.meta ? `\n${item.meta}` : ''
  return `${item.title}\n${item.description || ''}${meta}`
}

function getOptionId(item: ComposerExtensionItem, index: number) {
  const stableId = item.id.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `command-palette-option-${index}-${stableId}`
}

function clearActiveGeometry(list = listRef.value) {
  list?.style.removeProperty('--command-active-top')
  list?.style.removeProperty('--command-active-height')
}

function getScroller(list: HTMLElement) {
  const scroller = list.parentElement
  return scroller instanceof HTMLElement ? scroller : null
}

function clearScrollerClasses(scroller: HTMLElement | null) {
  scrollerStateClasses.forEach(className => scroller?.classList.remove(className))
}

function syncScrollerClasses(scroller: HTMLElement) {
  scroller.classList.add('command-palette-scroller')
  scroller.classList.toggle('is-scrollable', isScrollable.value)
  scroller.classList.toggle('is-navigating', isNavigating.value)
  scroller.classList.toggle('at-scroll-start', atScrollStart.value)
  scroller.classList.toggle('at-scroll-end', atScrollEnd.value)
}

function updateScrollState(scroller = listRef.value ? getScroller(listRef.value) : null) {
  if (!scroller) {
    isScrollable.value = false
    atScrollStart.value = true
    atScrollEnd.value = true
    return
  }

  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  isScrollable.value = maxScrollTop > 1
  atScrollStart.value = scroller.scrollTop <= 1
  atScrollEnd.value = scroller.scrollTop >= maxScrollTop - 1
  syncScrollerClasses(scroller)
}

function resetScrollPosition(scroller = listRef.value ? getScroller(listRef.value) : null) {
  if (!scroller) return
  scroller.scrollTop = 0
  updateScrollState(scroller)
}

function pulseNavigation() {
  isNavigating.value = true
  if (observedScroller) {
    observedScroller.classList.add('is-navigating')
  }
  if (navigationPulseTimer !== null) {
    window.clearTimeout(navigationPulseTimer)
  }
  navigationPulseTimer = window.setTimeout(() => {
    isNavigating.value = false
    if (observedScroller) {
      observedScroller.classList.remove('is-navigating')
    }
    navigationPulseTimer = null
  }, 1100)
}

function keepSelectedVisible(scroller: HTMLElement, selected: HTMLElement) {
  const safeGap = Math.max(8, Math.round(selected.offsetHeight * 0.28))
  const selectedTop = selected.offsetTop
  const selectedBottom = selectedTop + selected.offsetHeight
  const visibleTop = scroller.scrollTop + safeGap
  const visibleBottom = scroller.scrollTop + scroller.clientHeight - safeGap

  if (selectedTop < visibleTop) {
    scroller.scrollTop = Math.max(0, selectedTop - safeGap)
    return
  }

  if (selectedBottom > visibleBottom) {
    scroller.scrollTop = Math.min(
      scroller.scrollHeight - scroller.clientHeight,
      selectedBottom - scroller.clientHeight + safeGap,
    )
  }
}

function syncActiveSelection(ensureVisible: boolean) {
  syncFrame = null
  const list = listRef.value
  if (!list || props.items.length === 0 || props.selectedIndex < 0) {
    clearActiveGeometry(list)
    updateScrollState()
    return
  }

  const selected = list.querySelector<HTMLElement>(`[data-command-index="${props.selectedIndex}"]`)
  const scroller = getScroller(list)
  if (!selected || !scroller) {
    clearActiveGeometry(list)
    updateScrollState(scroller)
    return
  }

  if (ensureVisible) {
    keepSelectedVisible(scroller, selected)
  }

  list.style.setProperty('--command-active-top', `${selected.offsetTop}px`)
  list.style.setProperty('--command-active-height', `${selected.offsetHeight}px`)
  updateScrollState(scroller)
}

function scheduleActiveSync(ensureVisible = true) {
  if (syncFrame !== null) {
    cancelAnimationFrame(syncFrame)
    syncFrame = null
  }

  if (typeof requestAnimationFrame !== 'function') {
    syncActiveSelection(ensureVisible)
    return
  }

  syncFrame = requestAnimationFrame(() => syncActiveSelection(ensureVisible))
}

function bindResizeObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (observedScroller) {
    observedScroller.removeEventListener('scroll', handleScrollerScroll)
    clearScrollerClasses(observedScroller)
    observedScroller = null
  }

  const list = listRef.value
  if (!list || typeof ResizeObserver === 'undefined') return

  resizeObserver = new ResizeObserver(() => scheduleActiveSync(false))
  resizeObserver.observe(list)
  const scroller = getScroller(list)
  if (scroller) {
    resizeObserver.observe(scroller)
    observedScroller = scroller
    observedScroller.addEventListener('scroll', handleScrollerScroll, { passive: true })
    updateScrollState(scroller)
    syncScrollerClasses(scroller)
  }
}

function handleScrollerScroll() {
  updateScrollState(observedScroller)
  scheduleActiveSync(false)
}

watch(
  () => [props.selectedIndex, props.visible, props.items.length, props.query, itemSignature.value] as const,
  ([selectedIndex, visible, , query, signature], previous) => {
    const previousSelectedIndex = previous?.[0]
    const previousVisible = previous?.[1] ?? false
    const previousQuery = previous?.[3]
    const previousSignature = previous?.[4]
    const contentChanged = visible && (
      !previousVisible ||
      query !== previousQuery ||
      signature !== previousSignature
    )

    if (props.visible && previousVisible && selectedIndex !== previousSelectedIndex) {
      pulseNavigation()
    }
    nextTick(() => {
      bindResizeObserver()
      if (contentChanged) {
        resetScrollPosition()
      }
      scheduleActiveSync(true)
    })
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
  if (syncFrame !== null) cancelAnimationFrame(syncFrame)
  if (navigationPulseTimer !== null) window.clearTimeout(navigationPulseTimer)
  if (observedScroller) {
    observedScroller.removeEventListener('scroll', handleScrollerScroll)
    clearScrollerClasses(observedScroller)
  }
  resizeObserver?.disconnect()
})
</script>
