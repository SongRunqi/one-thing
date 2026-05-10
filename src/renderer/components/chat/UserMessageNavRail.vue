<template>
  <nav
    class="user-nav-rail"
    aria-label="User message navigation"
  >
    <div
      class="user-nav-card"
      :class="{ open: isOpen }"
      @mouseenter="openPanel"
      @mouseleave="closePanel"
      @focusin="openPanel"
      @pointerdown.stop
      @click.stop
    >
      <div
        ref="scrollRef"
        class="user-nav-scroll"
        role="listbox"
        aria-label="User messages"
        @scroll="updateScrollThumb"
      >
        <div
          class="user-nav-count"
          aria-hidden="true"
        >
          {{ totalCount }} turns
        </div>
        <button
          v-for="marker in sortedMarkers"
          :key="marker.messageId"
          :ref="el => setItemRef(el, marker.navIndex)"
          type="button"
          class="user-nav-row"
          :class="{ active: marker.navIndex === currentIndex }"
          :aria-label="marker.label"
          :aria-current="marker.navIndex === currentIndex ? 'step' : undefined"
          :aria-selected="marker.navIndex === currentIndex"
          role="option"
          @mouseenter="openPanel"
          @focus="openPanel"
          @click.stop="handleNavigate(marker.navIndex)"
        >
          <span class="user-nav-label">{{ marker.preview || marker.label }}</span>
          <span class="user-nav-marker" />
        </button>
      </div>
      <span
        v-if="showScrollThumb"
        class="user-nav-scroll-thumb"
        :style="scrollThumbStyle"
        aria-hidden="true"
      />
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUpdate, onMounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'

export interface UserMessageNavMarker {
  navIndex: number
  messageId: string
  seq?: number
  position: number
  label: string
  preview?: string
}

const props = defineProps<{
  markers: UserMessageNavMarker[]
  currentIndex: number
  totalCount?: number
}>()

const totalCount = computed(() => props.totalCount ?? props.markers.length)

const emit = defineEmits<{
  navigate: [navIndex: number]
}>()

const sortedMarkers = computed(() => [...props.markers].sort((a, b) => a.navIndex - b.navIndex))

const scrollRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const scrollTop = ref(0)
const scrollHeight = ref(0)
const clientHeight = ref(0)
const itemRefs = new Map<number, HTMLElement>()

const showScrollThumb = computed(() => scrollHeight.value > clientHeight.value + 1)

const scrollThumbStyle = computed(() => {
  if (!showScrollThumb.value) return undefined
  const trackPadding = 8
  const trackHeight = Math.max(1, clientHeight.value - trackPadding * 2)
  const ratio = clientHeight.value / scrollHeight.value
  const thumbHeight = Math.max(28, Math.round(trackHeight * ratio))
  const maxTop = trackHeight - thumbHeight
  const scrollable = Math.max(1, scrollHeight.value - clientHeight.value)
  const thumbTop = trackPadding + Math.round((scrollTop.value / scrollable) * maxTop)
  return {
    height: `${thumbHeight}px`,
    transform: `translateY(${thumbTop}px)`,
  }
})

function updateScrollThumb() {
  const el = scrollRef.value
  if (!el) return
  scrollTop.value = el.scrollTop
  scrollHeight.value = el.scrollHeight
  clientHeight.value = el.clientHeight
}

function openPanel() {
  isOpen.value = true
  nextTick(updateScrollThumb)
}

function closePanel() {
  isOpen.value = false
  nextTick(updateScrollThumb)
}

function setItemRef(el: Element | ComponentPublicInstance | null, navIndex: number) {
  if (el instanceof HTMLElement) {
    itemRefs.set(navIndex, el)
  } else {
    itemRefs.delete(navIndex)
  }
}

function scrollCurrentIntoView() {
  scrollMarkerIntoView(props.currentIndex)
}

function scrollMarkerIntoView(navIndex: number) {
  nextTick(() => {
    const item = itemRefs.get(navIndex)
    item?.scrollIntoView({ block: 'center' })
    updateScrollThumb()
  })
}

function handleNavigate(navIndex: number) {
  emit('navigate', navIndex)
}

onBeforeUpdate(() => itemRefs.clear())

onMounted(() => {
  nextTick(updateScrollThumb)
})

watch(
  [() => props.currentIndex, () => props.markers.length],
  () => {
    if (!isOpen.value) {
      scrollCurrentIntoView()
    }
    nextTick(updateScrollThumb)
  },
  { immediate: true, flush: 'post' },
)
</script>

<style scoped>
.user-nav-rail {
  --user-nav-row-height: 18px;
  --user-nav-row-gap: 8px;
  --user-nav-visible-count: 9;
  --user-nav-vertical-padding: 22px;
  --user-nav-collapsed-width: 34px;
  --user-nav-expanded-width: min(286px, calc(100vw - 64px));
  position: absolute;
  top: 50%;
  right: 12px;
  bottom: auto;
  width: var(--user-nav-expanded-width);
  height: calc(
    var(--user-nav-row-height) * var(--user-nav-visible-count) +
    var(--user-nav-row-gap) * (var(--user-nav-visible-count) - 1) +
    var(--user-nav-vertical-padding) * 2
  );
  z-index: var(--z-dropdown);
  pointer-events: none;
  user-select: none;
  transform: translateY(-50%);
}

.user-nav-card {
  position: absolute;
  top: 50%;
  right: 0;
  box-sizing: border-box;
  width: var(--user-nav-expanded-width);
  height: 100%;
  padding: 0;
  overflow: visible;
  border: 1px solid transparent;
  border-radius: 24px;
  background: transparent;
  box-shadow: none;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    opacity 0.14s ease,
    border-color 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.user-nav-card.open {
  border-color: color-mix(in srgb, var(--border) 62%, transparent);
  background: color-mix(in srgb, var(--bg-elevated, var(--bg)) 94%, white 6%);
  box-shadow:
    0 22px 48px rgba(0, 0, 0, 0.13),
    0 2px 8px rgba(0, 0, 0, 0.08);
  pointer-events: auto;
}

.user-nav-scroll {
  position: absolute;
  top: var(--user-nav-vertical-padding);
  right: 0;
  bottom: var(--user-nav-vertical-padding);
  left: 0;
  box-sizing: border-box;
  width: 100%;
  height: auto;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  pointer-events: none;
  scroll-padding-block: 0;
  scrollbar-width: none;
}

.user-nav-card.open .user-nav-scroll {
  overflow-y: auto;
  pointer-events: auto;
}

.user-nav-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.user-nav-count {
  box-sizing: border-box;
  width: 100%;
  height: var(--user-nav-row-height);
  margin-bottom: var(--user-nav-row-gap);
  padding-right: 48px;
  overflow: hidden;
  color: var(--text-muted, var(--muted));
  font-size: 12px;
  line-height: var(--user-nav-row-height);
  opacity: 0;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
  visibility: hidden;
  transition:
    opacity 0.12s ease,
    visibility 0.12s ease;
}

.user-nav-card.open .user-nav-count {
  opacity: 0.7;
  visibility: visible;
}

.user-nav-row {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: var(--user-nav-collapsed-width);
  height: var(--user-nav-row-height);
  min-height: var(--user-nav-row-height);
  margin-left: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted, var(--muted));
  cursor: pointer;
  font: inherit;
  overflow: visible;
  pointer-events: auto;
  text-align: left;
}

.user-nav-card.open .user-nav-row {
  width: 100%;
}

.user-nav-row + .user-nav-row {
  margin-top: var(--user-nav-row-gap);
}

.user-nav-label {
  position: absolute;
  top: 50%;
  right: 48px;
  width: calc(var(--user-nav-expanded-width) - 76px);
  min-width: 0;
  padding-right: 8px;
  overflow: hidden;
  color: var(--text-secondary, var(--text));
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  text-align: right;
  visibility: hidden;
  transform: translateY(-50%);
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    opacity 0.12s ease,
    visibility 0.12s ease;
}

.user-nav-card.open .user-nav-label {
  opacity: 0.72;
  visibility: visible;
}

.user-nav-card.open .user-nav-row:hover .user-nav-label,
.user-nav-card.open .user-nav-row:focus-visible .user-nav-label {
  color: var(--accent, #3b82f6);
  opacity: 1;
}

.user-nav-marker {
  position: absolute;
  top: 50%;
  right: 7px;
  width: 14px;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted, var(--muted)) 34%, transparent);
  opacity: 0.74;
  transform: translateY(-50%);
  transition:
    width 0.12s ease,
    background-color 0.12s ease,
    opacity 0.12s ease,
    box-shadow 0.12s ease;
}

.user-nav-row:hover .user-nav-marker,
.user-nav-row:focus-visible .user-nav-marker {
  opacity: 1;
  background: color-mix(in srgb, var(--accent, #3b82f6) 72%, var(--text-muted, var(--muted)));
}

.user-nav-row:focus-visible {
  outline: none;
}

.user-nav-card.open .user-nav-row.active .user-nav-label {
  color: var(--accent, #3b82f6);
  font-weight: 600;
  opacity: 1;
  visibility: visible;
}

.user-nav-row.active .user-nav-marker {
  width: 18px;
  opacity: 1;
  background: var(--accent, #3b82f6);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #3b82f6) 10%, transparent);
}

.user-nav-scroll-thumb {
  position: absolute;
  top: var(--user-nav-vertical-padding);
  right: 2px;
  display: none;
  width: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 36%, transparent);
  pointer-events: none;
}

.user-nav-card.open .user-nav-scroll-thumb {
  display: block;
}

@media (max-width: 768px) {
  .user-nav-rail {
    --user-nav-expanded-width: min(260px, calc(100vw - 44px));
    right: 6px;
  }
}

@media (max-width: 480px) {
  .user-nav-rail {
    display: none;
  }
}
</style>
