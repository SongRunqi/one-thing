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
        class="user-nav-scroll"
        role="listbox"
        aria-label="User messages"
        @wheel.prevent="handlePageWheel"
      >
        <Transition
          :name="pageTransitionName"
          mode="out-in"
        >
          <div
            :key="pageStartIndex"
            class="user-nav-page"
          >
            <button
              v-for="marker in visibleMarkers"
              :key="marker.messageId"
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
        </Transition>
      </div>
      <span
        v-if="showScrollThumb"
        class="user-nav-scroll-thumb"
        :style="scrollThumbStyle"
        aria-hidden="true"
      />
      <button
        v-if="hasPreviousPage"
        type="button"
        class="user-nav-page-cue user-nav-page-cue-top"
        aria-label="Previous navigation page"
        title="Previous page"
        @click.stop="goToPreviousPage"
      >
        <span class="user-nav-page-cue-icon" />
      </button>
      <button
        v-if="hasNextPage"
        type="button"
        class="user-nav-page-cue user-nav-page-cue-bottom"
        aria-label="Next navigation page"
        title="Next page"
        @click.stop="goToNextPage"
      >
        <span class="user-nav-page-cue-icon" />
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

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

const emit = defineEmits<{
  navigate: [navIndex: number]
}>()

const sortedMarkers = computed(() => [...props.markers].sort((a, b) => a.navIndex - b.navIndex))
const isOpen = ref(false)
const pageStartIndex = ref(0)
const pageDirection = ref<1 | -1>(1)
let pageWheelLockTimer: ReturnType<typeof setTimeout> | null = null

const pageSize = 6
const maxPageStartIndex = computed(() => {
  const total = sortedMarkers.value.length
  if (total <= pageSize) return 0
  return Math.floor((total - 1) / pageSize) * pageSize
})

const visibleMarkers = computed(() => {
  return sortedMarkers.value.slice(pageStartIndex.value, pageStartIndex.value + pageSize)
})

const hasPreviousPage = computed(() => pageStartIndex.value > 0)
const hasNextPage = computed(() => pageStartIndex.value + pageSize < sortedMarkers.value.length)
const showScrollThumb = computed(() => sortedMarkers.value.length > pageSize)

const scrollThumbStyle = computed(() => {
  if (!showScrollThumb.value) return undefined
  const trackPadding = 8
  const trackHeight = 100 - trackPadding * 2
  const ratio = pageSize / Math.max(pageSize, sortedMarkers.value.length)
  const thumbHeight = Math.max(18, Math.round(trackHeight * ratio))
  const maxTop = trackHeight - thumbHeight
  const progress = maxPageStartIndex.value === 0
    ? 0
    : pageStartIndex.value / maxPageStartIndex.value
  const thumbTop = trackPadding + Math.round(progress * maxTop)
  return {
    height: `${thumbHeight}%`,
    top: `${thumbTop}%`,
  }
})

const pageTransitionName = computed(() => pageDirection.value > 0 ? 'nav-page-next' : 'nav-page-prev')

function openPanel() {
  isOpen.value = true
}

function closePanel() {
  isOpen.value = false
}

function getPageStartForIndex(navIndex: number): number {
  if (navIndex < 0) return 0
  return Math.min(maxPageStartIndex.value, Math.floor(navIndex / pageSize) * pageSize)
}

function setPageStart(nextStart: number, direction: 1 | -1) {
  const bounded = Math.max(0, Math.min(maxPageStartIndex.value, nextStart))
  if (bounded === pageStartIndex.value) return
  pageDirection.value = direction
  pageStartIndex.value = bounded
}

function handlePageWheel(event: WheelEvent) {
  if (Math.abs(event.deltaY) < 8) return
  if (pageWheelLockTimer) return

  const direction: 1 | -1 = event.deltaY > 0 ? 1 : -1
  setPageStart(pageStartIndex.value + direction * pageSize, direction)
  pageWheelLockTimer = setTimeout(() => {
    pageWheelLockTimer = null
  }, 260)
}

function goToPreviousPage() {
  openPanel()
  setPageStart(pageStartIndex.value - pageSize, -1)
}

function goToNextPage() {
  openPanel()
  setPageStart(pageStartIndex.value + pageSize, 1)
}

function handleNavigate(navIndex: number) {
  emit('navigate', navIndex)
}

watch(
  [() => props.currentIndex, () => props.markers.length],
  () => {
    if (!isOpen.value) {
      const nextStart = getPageStartForIndex(props.currentIndex)
      const direction = nextStart >= pageStartIndex.value ? 1 : -1
      setPageStart(nextStart, direction)
    }
  },
  { immediate: true, flush: 'post' },
)

watch(maxPageStartIndex, maxStart => {
  if (pageStartIndex.value > maxStart) {
    pageStartIndex.value = maxStart
  }
})

onUnmounted(() => {
  if (pageWheelLockTimer) {
    clearTimeout(pageWheelLockTimer)
    pageWheelLockTimer = null
  }
})
</script>

<style scoped>
.user-nav-rail {
  --user-nav-row-height: 18px;
  --user-nav-row-gap: 8px;
  --user-nav-visible-count: 6;
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
  border-radius: 18px;
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
}

.user-nav-card.open .user-nav-scroll {
  pointer-events: auto;
}

.user-nav-page {
  display: grid;
  grid-template-rows: repeat(var(--user-nav-visible-count), var(--user-nav-row-height));
  align-content: space-between;
  width: 100%;
  height: 100%;
  will-change: opacity, transform, filter;
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

.user-nav-page-cue {
  position: absolute;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  width: var(--user-nav-collapsed-width);
  height: 18px;
  padding: 0 10px 0 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--text-muted, var(--muted)) 58%, transparent);
  cursor: pointer;
  opacity: 0.42;
  pointer-events: auto;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    opacity 0.12s ease;
}

.user-nav-card.open .user-nav-page-cue {
  opacity: 0.55;
}

.user-nav-page-cue:hover,
.user-nav-page-cue:focus-visible {
  background: color-mix(in srgb, var(--accent, #3b82f6) 10%, transparent);
  color: var(--accent, #3b82f6);
  opacity: 0.9;
  outline: none;
}

.user-nav-page-cue-icon {
  width: 7px;
  height: 7px;
  border-top: 1.5px solid currentColor;
  border-left: 1.5px solid currentColor;
}

.user-nav-page-cue-top {
  top: 5px;
}

.user-nav-page-cue-top .user-nav-page-cue-icon {
  transform: rotate(45deg);
}

.user-nav-page-cue-bottom {
  bottom: 5px;
}

.user-nav-page-cue-bottom .user-nav-page-cue-icon {
  transform: rotate(225deg);
}

.nav-page-next-enter-active,
.nav-page-next-leave-active,
.nav-page-prev-enter-active,
.nav-page-prev-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
    filter 0.18s ease;
}

.nav-page-next-enter-from {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(14px) scale(0.985);
}

.nav-page-next-leave-to {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(-14px) scale(0.985);
}

.nav-page-prev-enter-from {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(-14px) scale(0.985);
}

.nav-page-prev-leave-to {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(14px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .nav-page-next-enter-active,
  .nav-page-next-leave-active,
  .nav-page-prev-enter-active,
  .nav-page-prev-leave-active {
    transition: opacity 0.08s ease;
  }

  .nav-page-next-enter-from,
  .nav-page-next-leave-to,
  .nav-page-prev-enter-from,
  .nav-page-prev-leave-to {
    filter: none;
    transform: none;
  }
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
