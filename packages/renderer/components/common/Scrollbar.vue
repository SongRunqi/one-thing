<template>
  <div
    class="scrollbar"
    :class="scrollbarClasses"
    :style="scrollbarStyle"
  >
    <div
      ref="scrollerRef"
      class="scrollbar-viewport"
      @scroll="handleScroll"
    >
      <div
        ref="contentRef"
        class="scrollbar-content"
      >
        <slot />
      </div>
    </div>
    <div
      v-if="showVerticalBar"
      class="scrollbar-track scrollbar-track-vertical"
      :style="verticalTrackStyle"
      @mousedown.self="handleVerticalTrackMouseDown"
    >
      <div
        class="scrollbar-thumb scrollbar-thumb-vertical"
        :style="verticalThumbStyle"
        @mousedown.stop="startVerticalThumbDrag"
      />
    </div>
    <div
      v-if="showHorizontalBar"
      class="scrollbar-track scrollbar-track-horizontal"
      :style="horizontalTrackStyle"
      @mousedown.self="handleHorizontalTrackMouseDown"
    >
      <div
        class="scrollbar-thumb scrollbar-thumb-horizontal"
        :style="horizontalThumbStyle"
        @mousedown.stop="startHorizontalThumbDrag"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties, type StyleValue } from 'vue'

type ScrollbarLength = number | string

interface ScrollbarState {
  scrollTop: number
  scrollLeft: number
  scrollHeight: number
  scrollWidth: number
  clientHeight: number
  clientWidth: number
  maxScrollTop: number
  maxScrollLeft: number
  distanceToBottom: number
}

const BOTTOM_EPSILON = 1

const props = withDefaults(defineProps<{
  height?: ScrollbarLength
  maxHeight?: ScrollbarLength
  horizontal?: boolean
  vertical?: boolean
  native?: boolean
  stableGutter?: boolean
  endReachedThreshold?: number
}>(), {
  height: undefined,
  maxHeight: undefined,
  horizontal: false,
  vertical: true,
  native: false,
  stableGutter: true,
  endReachedThreshold: 0,
})

const emit = defineEmits<{
  scroll: [event: Event, state: ScrollbarState]
  'end-reached': [state: ScrollbarState]
}>()

const scrollerRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const geometry = ref<ScrollbarState>(createEmptyScrollState())
const isScrolling = ref(false)
const isDragging = ref(false)

let reachedEnd = false
let scrollerResizeObserver: ResizeObserver | null = null
let contentResizeObserver: ResizeObserver | null = null
let scrollEndTimer: number | null = null
let dragCleanup: (() => void) | null = null

const scrollbarStyle = computed<StyleValue>(() => {
  const height = normalizeLength(props.height)
  const maxHeight = normalizeLength(props.maxHeight)
  const style: Record<string, string> = {}

  if (height) {
    style.height = height
  } else if (!maxHeight) {
    style.height = '100%'
  }

  if (maxHeight) {
    style.maxHeight = maxHeight
  }

  return style
})

const scrollbarClasses = computed(() => ({
  'is-horizontal': props.horizontal,
  'is-native-scrollbar': props.native,
  'is-overlay-scrollbar': !props.native,
  'has-natural-height': !normalizeLength(props.height) && Boolean(normalizeLength(props.maxHeight)),
  'is-scrollable-y': showVerticalBar.value,
  'is-scrollable-x': showHorizontalBar.value,
  'is-stable-gutter': props.native && props.stableGutter,
  'is-vertical-disabled': !props.vertical,
  'is-scrolling': isScrolling.value,
  'is-dragging': isDragging.value,
}))

const showVerticalBar = computed(() => !props.native && props.vertical && geometry.value.maxScrollTop > 0)
const showHorizontalBar = computed(() => !props.native && props.horizontal && geometry.value.maxScrollLeft > 0)

const verticalThumbHeight = computed(() => {
  const state = geometry.value
  if (state.scrollHeight <= 0 || state.clientHeight <= 0) return 0
  return Math.max(24, Math.round((state.clientHeight / state.scrollHeight) * state.clientHeight))
})

const verticalThumbOffset = computed(() => {
  const state = geometry.value
  const trackRange = Math.max(0, state.clientHeight - verticalThumbHeight.value)
  if (trackRange <= 0 || state.maxScrollTop <= 0) return 0
  return Math.round((state.scrollTop / state.maxScrollTop) * trackRange)
})

const horizontalThumbWidth = computed(() => {
  const state = geometry.value
  if (state.scrollWidth <= 0 || state.clientWidth <= 0) return 0
  return Math.max(24, Math.round((state.clientWidth / state.scrollWidth) * state.clientWidth))
})

const horizontalThumbOffset = computed(() => {
  const state = geometry.value
  const trackRange = Math.max(0, state.clientWidth - horizontalThumbWidth.value)
  if (trackRange <= 0 || state.maxScrollLeft <= 0) return 0
  return Math.round((state.scrollLeft / state.maxScrollLeft) * trackRange)
})

const verticalTrackStyle = computed<CSSProperties>(() => ({
  height: `${geometry.value.clientHeight}px`,
}))

const verticalThumbStyle = computed<CSSProperties>(() => ({
  height: `${verticalThumbHeight.value}px`,
  transform: `translate3d(0, ${verticalThumbOffset.value}px, 0)`,
}))

const horizontalTrackStyle = computed<CSSProperties>(() => ({
  width: `${geometry.value.clientWidth}px`,
}))

const horizontalThumbStyle = computed<CSSProperties>(() => ({
  width: `${horizontalThumbWidth.value}px`,
  transform: `translate3d(${horizontalThumbOffset.value}px, 0, 0)`,
}))

function createEmptyScrollState(): ScrollbarState {
  return {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    scrollWidth: 0,
    clientHeight: 0,
    clientWidth: 0,
    maxScrollTop: 0,
    maxScrollLeft: 0,
    distanceToBottom: 0,
  }
}

function normalizeLength(value: ScrollbarLength | undefined): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? `${Math.max(0, value)}px` : undefined

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function getScrollState(): ScrollbarState {
  const scroller = scrollerRef.value

  if (!scroller) {
    return createEmptyScrollState()
  }

  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
  const distanceToBottom = Math.max(0, maxScrollTop - scroller.scrollTop)

  return {
    scrollTop: scroller.scrollTop,
    scrollLeft: scroller.scrollLeft,
    scrollHeight: scroller.scrollHeight,
    scrollWidth: scroller.scrollWidth,
    clientHeight: scroller.clientHeight,
    clientWidth: scroller.clientWidth,
    maxScrollTop,
    maxScrollLeft,
    distanceToBottom,
  }
}

function syncGeometry() {
  geometry.value = getScrollState()
  return geometry.value
}

function hasReachedBottom(state = getScrollState()) {
  const threshold = Math.max(0, props.endReachedThreshold)
  return props.vertical && state.maxScrollTop > 0 && state.distanceToBottom <= threshold + BOTTOM_EPSILON
}

function syncEndReached(state = getScrollState()) {
  const atEnd = hasReachedBottom(state)

  if (atEnd && !reachedEnd) {
    reachedEnd = true
    emit('end-reached', state)
    return
  }

  if (!atEnd) {
    reachedEnd = false
  }
}

function clampScrollValue(value: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(0, value), max)
}

function handleScroll(event: Event) {
  const state = syncGeometry()
  markScrolling()
  emit('scroll', event, state)
  syncEndReached(state)
}

function markScrolling() {
  isScrolling.value = true

  if (scrollEndTimer !== null) {
    window.clearTimeout(scrollEndTimer)
  }

  scrollEndTimer = window.setTimeout(() => {
    scrollEndTimer = null
    isScrolling.value = false
  }, 600)
}

function setScrollTop(scrollTop: number) {
  const scroller = scrollerRef.value
  if (!scroller) return

  scroller.scrollTop = clampScrollValue(scrollTop, Math.max(0, scroller.scrollHeight - scroller.clientHeight))
  const state = syncGeometry()
  syncEndReached(state)
}

function setScrollLeft(scrollLeft: number) {
  const scroller = scrollerRef.value
  if (!scroller) return

  scroller.scrollLeft = clampScrollValue(scrollLeft, Math.max(0, scroller.scrollWidth - scroller.clientWidth))
  syncGeometry()
}

function getScrollElement() {
  return scrollerRef.value
}

function getScrollTop() {
  return scrollerRef.value?.scrollTop ?? 0
}

function getScrollLeft() {
  return scrollerRef.value?.scrollLeft ?? 0
}

function setupResizeObservers() {
  if (typeof ResizeObserver === 'undefined') return

  scrollerResizeObserver = new ResizeObserver(() => {
    const state = syncGeometry()
    syncEndReached(state)
  })
  contentResizeObserver = new ResizeObserver(() => {
    const state = syncGeometry()
    syncEndReached(state)
  })

  if (scrollerRef.value) scrollerResizeObserver.observe(scrollerRef.value)
  if (contentRef.value) contentResizeObserver.observe(contentRef.value)
}

function setScrollFromVerticalTrack(clientY: number) {
  const scroller = scrollerRef.value
  if (!scroller || geometry.value.maxScrollTop <= 0) return

  const rect = scroller.getBoundingClientRect()
  const targetThumbTop = clientY - rect.top - verticalThumbHeight.value / 2
  const trackRange = Math.max(1, geometry.value.clientHeight - verticalThumbHeight.value)
  scroller.scrollTop = clampScrollValue((targetThumbTop / trackRange) * geometry.value.maxScrollTop, geometry.value.maxScrollTop)
}

function setScrollFromHorizontalTrack(clientX: number) {
  const scroller = scrollerRef.value
  if (!scroller || geometry.value.maxScrollLeft <= 0) return

  const rect = scroller.getBoundingClientRect()
  const targetThumbLeft = clientX - rect.left - horizontalThumbWidth.value / 2
  const trackRange = Math.max(1, geometry.value.clientWidth - horizontalThumbWidth.value)
  scroller.scrollLeft = clampScrollValue((targetThumbLeft / trackRange) * geometry.value.maxScrollLeft, geometry.value.maxScrollLeft)
}

function handleVerticalTrackMouseDown(event: MouseEvent) {
  setScrollFromVerticalTrack(event.clientY)
  startVerticalThumbDrag(event)
}

function handleHorizontalTrackMouseDown(event: MouseEvent) {
  setScrollFromHorizontalTrack(event.clientX)
  startHorizontalThumbDrag(event)
}

function startVerticalThumbDrag(event: MouseEvent) {
  const startY = event.clientY
  const startScrollTop = geometry.value.scrollTop
  const maxScrollTop = geometry.value.maxScrollTop
  const trackRange = Math.max(1, geometry.value.clientHeight - verticalThumbHeight.value)

  startDrag(
    event,
    moveEvent => {
      const scrollDelta = ((moveEvent.clientY - startY) / trackRange) * maxScrollTop
      setScrollTop(startScrollTop + scrollDelta)
    },
  )
}

function startHorizontalThumbDrag(event: MouseEvent) {
  const startX = event.clientX
  const startScrollLeft = geometry.value.scrollLeft
  const maxScrollLeft = geometry.value.maxScrollLeft
  const trackRange = Math.max(1, geometry.value.clientWidth - horizontalThumbWidth.value)

  startDrag(
    event,
    moveEvent => {
      const scrollDelta = ((moveEvent.clientX - startX) / trackRange) * maxScrollLeft
      setScrollLeft(startScrollLeft + scrollDelta)
    },
  )
}

function startDrag(event: MouseEvent, onMove: (event: MouseEvent) => void) {
  event.preventDefault()
  dragCleanup?.()
  isDragging.value = true

  const handleMouseMove = (moveEvent: MouseEvent) => onMove(moveEvent)
  const handleMouseUp = () => {
    dragCleanup?.()
  }

  dragCleanup = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    dragCleanup = null
    isDragging.value = false
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp, { once: true })
}

onMounted(() => {
  const state = syncGeometry()
  setupResizeObservers()
  syncEndReached(state)
  void nextTick(() => {
    const nextState = syncGeometry()
    syncEndReached(nextState)
  })
})

onBeforeUnmount(() => {
  dragCleanup?.()
  scrollerResizeObserver?.disconnect()
  contentResizeObserver?.disconnect()
  if (scrollEndTimer !== null) {
    window.clearTimeout(scrollEndTimer)
    scrollEndTimer = null
  }
})

watch(
  () => [props.height, props.maxHeight, props.vertical, props.endReachedThreshold],
  () => {
    void nextTick(() => {
      const state = syncGeometry()
      syncEndReached(state)
    })
  },
)

defineExpose({
  setScrollTop,
  setScrollLeft,
  getScrollElement,
  getScrollTop,
  getScrollLeft,
})
</script>

<style scoped>
.scrollbar {
  --scrollbar-size: 8px;
  --scrollbar-track-inset: 2px;
  /* Overlay bar stays hidden until the user scrolls, drags, or hovers the track. */
  --scrollbar-idle-opacity: 0;
  --scrollbar-active-opacity: 1;
  --scrollbar-thumb-bg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 26%, transparent);
  --scrollbar-thumb-hover-bg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 42%, transparent);
  --scrollbar-thumb-active-bg: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 48%, transparent);

  position: relative;
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
}

.scrollbar:not(.has-natural-height) .scrollbar-viewport {
  height: 100%;
}

.scrollbar.has-natural-height .scrollbar-viewport {
  max-height: inherit;
}

.scrollbar-viewport {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 26%, transparent) transparent;
}

.scrollbar.is-horizontal .scrollbar-viewport {
  overflow-x: auto;
}

.scrollbar.is-native-scrollbar.is-stable-gutter .scrollbar-viewport {
  scrollbar-gutter: stable;
}

.scrollbar.is-vertical-disabled .scrollbar-viewport {
  overflow-y: hidden;
}

.scrollbar.is-overlay-scrollbar .scrollbar-viewport {
  scrollbar-width: none;
}

.scrollbar.is-overlay-scrollbar .scrollbar-viewport::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.scrollbar.is-native-scrollbar .scrollbar-viewport::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.scrollbar.is-native-scrollbar .scrollbar-viewport::-webkit-scrollbar-track,
.scrollbar.is-native-scrollbar .scrollbar-viewport::-webkit-scrollbar-corner {
  background: transparent;
}

.scrollbar.is-native-scrollbar .scrollbar-viewport::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 22%, transparent);
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}

.scrollbar.is-native-scrollbar:hover .scrollbar-viewport::-webkit-scrollbar-thumb,
.scrollbar.is-native-scrollbar:focus-within .scrollbar-viewport::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 36%, transparent);
  border: 2px solid transparent;
  background-clip: padding-box;
}

.scrollbar-content {
  min-width: 0;
}

.scrollbar-track {
  position: absolute;
  /* 滚动条压在内容之上,但仍属 sticky 档(内容最高到 5)。 */
  z-index: calc(var(--z-sticky) + 10);
  flex: none;
  border-radius: 999px;
  opacity: var(--scrollbar-idle-opacity);
  pointer-events: auto;
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
}

.scrollbar-track-vertical {
  top: 0;
  right: var(--scrollbar-track-inset);
  width: var(--scrollbar-size);
}

.scrollbar-track-horizontal {
  left: 0;
  bottom: var(--scrollbar-track-inset);
  height: var(--scrollbar-size);
}

.scrollbar-thumb {
  position: absolute;
  border-radius: 999px;
  background: var(--scrollbar-thumb-bg);
  transition:
    background 0.15s ease,
    opacity 0.15s ease;
}

.scrollbar-thumb-vertical {
  top: 0;
  right: 0;
  width: 100%;
}

.scrollbar-thumb-horizontal {
  bottom: 0;
  left: 0;
  height: 100%;
}

.scrollbar.is-scrolling .scrollbar-track,
.scrollbar.is-dragging .scrollbar-track,
.scrollbar-track:hover {
  opacity: var(--scrollbar-active-opacity);
}

.scrollbar.is-scrolling .scrollbar-thumb,
.scrollbar-track:hover .scrollbar-thumb {
  background: var(--scrollbar-thumb-hover-bg);
}

.scrollbar.is-dragging .scrollbar-thumb,
.scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-active-bg);
}
</style>
