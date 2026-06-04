<template>
  <nav
    class="assistant-nav-rail"
    aria-label="Assistant message outline"
  >
    <div
      class="assistant-nav-card"
      :class="{ open: isOpen }"
      @mouseenter="openPanel"
      @mouseleave="closePanel"
      @focusin="openPanel"
      @pointerdown.stop
      @click.stop
    >
      <button
        v-if="showModeSwitch"
        type="button"
        class="assistant-nav-mode-switch"
        aria-label="Show message nav trail"
        title="Message nav trail"
        @click.stop="emit('switchMode')"
      >
        <span aria-hidden="true">&gt;</span>
      </button>
      <div
        class="assistant-nav-scroll"
        role="listbox"
        aria-label="Assistant outline"
        @wheel.prevent="handlePageWheel"
      >
        <Transition
          :name="pageTransitionName"
          mode="out-in"
        >
          <div
            :key="pageStartIndex"
            class="assistant-nav-page"
          >
            <button
              v-for="marker in visibleMarkers"
              :key="marker.anchorId"
              type="button"
              class="assistant-nav-row"
              :class="[
                `level-${Math.min(4, Math.max(1, marker.level))}`,
                `kind-${marker.kind}`,
                { active: marker.navIndex === currentIndex },
              ]"
              :aria-label="marker.label"
              :aria-current="marker.navIndex === currentIndex ? 'location' : undefined"
              :aria-selected="marker.navIndex === currentIndex"
              role="option"
              @mouseenter="openPanel"
              @focus="openPanel"
              @click.stop="handleNavigate(marker.navIndex)"
            >
              <span class="assistant-nav-label">{{ marker.preview || marker.label }}</span>
              <span class="assistant-nav-marker" />
            </button>
          </div>
        </Transition>
      </div>
      <span
        v-if="showScrollThumb"
        class="assistant-nav-scroll-thumb"
        :style="scrollThumbStyle"
        aria-hidden="true"
      />
      <button
        v-if="hasPreviousPage"
        type="button"
        class="assistant-nav-page-cue assistant-nav-page-cue-top"
        aria-label="Previous outline page"
        title="Previous page"
        @click.stop="goToPreviousPage"
      >
        <span class="assistant-nav-page-cue-icon" />
      </button>
      <button
        v-if="hasNextPage"
        type="button"
        class="assistant-nav-page-cue assistant-nav-page-cue-bottom"
        aria-label="Next outline page"
        title="Next page"
        @click.stop="goToNextPage"
      >
        <span class="assistant-nav-page-cue-icon" />
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AssistantMessageOutlineMarker } from './assistant-message-outline'

const props = defineProps<{
  markers: AssistantMessageOutlineMarker[]
  currentIndex: number
  showModeSwitch?: boolean
}>()

const emit = defineEmits<{
  navigate: [navIndex: number]
  switchMode: []
}>()

const sortedMarkers = computed(() => [...props.markers].sort((a, b) => a.navIndex - b.navIndex))
const isOpen = ref(false)
const pageStartIndex = ref(0)
const pageDirection = ref<1 | -1>(1)
let pageWheelLockTimer: ReturnType<typeof setTimeout> | null = null

const pageSize = 8
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

const pageTransitionName = computed(() => pageDirection.value > 0 ? 'assistant-nav-page-next' : 'assistant-nav-page-prev')

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
  { immediate: true, flush: 'sync' },
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
.assistant-nav-rail {
  --assistant-nav-row-height: 18px;
  --assistant-nav-row-gap: 7px;
  --assistant-nav-visible-count: 8;
  --assistant-nav-vertical-padding: 22px;
  --assistant-nav-collapsed-width: 34px;
  --assistant-nav-expanded-width: min(306px, calc(100vw - 64px));
  position: absolute;
  top: 50%;
  right: 12px;
  width: var(--assistant-nav-expanded-width);
  height: calc(
    var(--assistant-nav-row-height) * var(--assistant-nav-visible-count) +
    var(--assistant-nav-row-gap) * (var(--assistant-nav-visible-count) - 1) +
    var(--assistant-nav-vertical-padding) * 2
  );
  z-index: var(--z-dropdown);
  pointer-events: none;
  user-select: none;
  transform: translateY(-50%);
}

.assistant-nav-card {
  position: absolute;
  top: 50%;
  right: 0;
  box-sizing: border-box;
  width: var(--assistant-nav-expanded-width);
  height: 100%;
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

.assistant-nav-card.open {
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 62%, transparent);
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg))) 94%, white 6%);
  box-shadow:
    0 22px 48px rgba(0, 0, 0, 0.13),
    0 2px 8px rgba(0, 0, 0, 0.08);
  pointer-events: auto;
}

.assistant-nav-scroll {
  position: absolute;
  top: var(--assistant-nav-vertical-padding);
  right: 0;
  bottom: var(--assistant-nav-vertical-padding);
  left: 0;
  box-sizing: border-box;
  overflow: hidden;
  overscroll-behavior: contain;
  pointer-events: none;
}

.assistant-nav-card.open .assistant-nav-scroll {
  pointer-events: auto;
}

.assistant-nav-page {
  display: grid;
  grid-template-rows: repeat(var(--assistant-nav-visible-count), var(--assistant-nav-row-height));
  align-content: start;
  row-gap: var(--assistant-nav-row-gap);
  width: 100%;
  height: 100%;
  will-change: opacity, transform, filter;
}

.assistant-nav-row {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: var(--assistant-nav-collapsed-width);
  height: var(--assistant-nav-row-height);
  min-height: var(--assistant-nav-row-height);
  margin-left: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  cursor: pointer;
  font: inherit;
  overflow: visible;
  pointer-events: auto;
  text-align: left;
}

.assistant-nav-card.open .assistant-nav-row {
  width: 100%;
}

.assistant-nav-label {
  position: absolute;
  top: 50%;
  right: 48px;
  width: calc(var(--assistant-nav-expanded-width) - 82px);
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  font-size: 13px;
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

.assistant-nav-card.open .assistant-nav-label {
  opacity: 0.72;
  visibility: visible;
}

.assistant-nav-row.level-1 .assistant-nav-label,
.assistant-nav-row.level-2 .assistant-nav-label {
  font-weight: 600;
}

.assistant-nav-row.level-3 .assistant-nav-label,
.assistant-nav-row.level-4 .assistant-nav-label {
  opacity: 0.6;
}

.assistant-nav-card.open .assistant-nav-row:hover .assistant-nav-label,
.assistant-nav-card.open .assistant-nav-row:focus-visible .assistant-nav-label {
  color: var(--ui-accent-primary-fg, var(--accent));
  opacity: 1;
}

.assistant-nav-marker {
  position: absolute;
  top: 50%;
  right: 7px;
  width: 14px;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 34%, transparent);
  opacity: 0.74;
  transform: translateY(-50%);
  transition:
    width 0.12s ease,
    background-color 0.12s ease,
    opacity 0.12s ease,
    box-shadow 0.12s ease;
}

.assistant-nav-row.level-3 .assistant-nav-marker {
  width: 11px;
}

.assistant-nav-row.level-4 .assistant-nav-marker {
  width: 8px;
  opacity: 0.62;
}

.assistant-nav-row.kind-code .assistant-nav-marker,
.assistant-nav-row.kind-table .assistant-nav-marker,
.assistant-nav-row.kind-image .assistant-nav-marker {
  height: 4px;
}

.assistant-nav-row:hover .assistant-nav-marker,
.assistant-nav-row:focus-visible .assistant-nav-marker {
  opacity: 1;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 72%, var(--ui-text-muted-fg, var(--text-muted, var(--muted))));
}

.assistant-nav-row:focus-visible {
  outline: none;
}

.assistant-nav-card.open .assistant-nav-row.active .assistant-nav-label {
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 650;
  opacity: 1;
  visibility: visible;
}

.assistant-nav-row.active .assistant-nav-marker {
  width: 20px;
  opacity: 1;
  background: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
}

.assistant-nav-scroll-thumb {
  position: absolute;
  top: var(--assistant-nav-vertical-padding);
  right: 2px;
  display: none;
  width: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 36%, transparent);
  pointer-events: none;
}

.assistant-nav-card.open .assistant-nav-scroll-thumb {
  display: block;
}

.assistant-nav-mode-switch,
.assistant-nav-page-cue {
  position: absolute;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  width: var(--assistant-nav-collapsed-width);
  height: 18px;
  padding: 0 10px 0 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 58%, transparent);
  cursor: pointer;
  opacity: 0.42;
  pointer-events: auto;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    opacity 0.12s ease;
}

.assistant-nav-mode-switch {
  top: 2px;
  font-size: 15px;
  font-weight: 650;
  line-height: 1;
}

.assistant-nav-card.open .assistant-nav-mode-switch,
.assistant-nav-card.open .assistant-nav-page-cue {
  opacity: 0.55;
}

.assistant-nav-mode-switch:hover,
.assistant-nav-mode-switch:focus-visible,
.assistant-nav-page-cue:hover,
.assistant-nav-page-cue:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
  opacity: 0.9;
  outline: none;
}

.assistant-nav-page-cue-icon {
  width: 7px;
  height: 7px;
  border-top: 1.5px solid currentColor;
  border-left: 1.5px solid currentColor;
}

.assistant-nav-page-cue-top {
  top: 5px;
}

.assistant-nav-page-cue-top .assistant-nav-page-cue-icon {
  transform: rotate(45deg);
}

.assistant-nav-page-cue-bottom {
  bottom: 5px;
}

.assistant-nav-page-cue-bottom .assistant-nav-page-cue-icon {
  transform: rotate(225deg);
}

.assistant-nav-page-next-enter-active,
.assistant-nav-page-next-leave-active,
.assistant-nav-page-prev-enter-active,
.assistant-nav-page-prev-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
    filter 0.18s ease;
}

.assistant-nav-page-next-enter-from {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(14px) scale(0.985);
}

.assistant-nav-page-next-leave-to {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(-14px) scale(0.985);
}

.assistant-nav-page-prev-enter-from {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(-14px) scale(0.985);
}

.assistant-nav-page-prev-leave-to {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(14px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .assistant-nav-page-next-enter-active,
  .assistant-nav-page-next-leave-active,
  .assistant-nav-page-prev-enter-active,
  .assistant-nav-page-prev-leave-active {
    transition: opacity 0.08s ease;
  }

  .assistant-nav-page-next-enter-from,
  .assistant-nav-page-next-leave-to,
  .assistant-nav-page-prev-enter-from,
  .assistant-nav-page-prev-leave-to {
    filter: none;
    transform: none;
  }
}

@media (max-width: 768px) {
  .assistant-nav-rail {
    --assistant-nav-expanded-width: min(270px, calc(100vw - 44px));
    right: 6px;
  }
}

@media (max-width: 480px) {
  .assistant-nav-rail {
    display: none;
  }
}
</style>
