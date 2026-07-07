<template>
  <nav
    class="assistant-nav-rail"
    :class="[
      `placement-${props.placement}`,
      { 'with-mode-tabs': showModeSwitch && effectivePanelAvailable && effectiveOpen },
    ]"
    aria-label="Assistant message outline"
  >
    <div
      class="assistant-nav-card"
      :class="{ open: effectiveOpen }"
      @mouseenter="openPanel"
      @mouseleave="closePanel"
      @focusin="openPanel"
      @pointerdown.stop
      @click.stop
    >
      <div
        v-if="showModeSwitch && effectivePanelAvailable && effectiveOpen"
        class="assistant-nav-mode-tabs"
        aria-label="Navigation mode"
      >
        <span
          class="assistant-nav-mode-tab active"
          aria-current="true"
        >
          Outline
        </span>
        <Button
          unstyled
          native-type="button"
          class="assistant-nav-mode-tab"
          aria-label="Show message nav trail"
          title="Message nav trail"
          @click.stop="emit('switchMode')"
        >
          Trail
        </Button>
      </div>
      <Button
        v-if="!isSidePlacement && panelAvailable && effectiveOpen"
        unstyled
        native-type="button"
        class="assistant-nav-close"
        :class="{ 'can-pin': isAutoPanelDismissed }"
        :aria-label="isAutoPanelDismissed ? 'Pin navigation panel' : 'Close navigation panel'"
        :title="isAutoPanelDismissed ? 'Pin panel' : 'Close panel'"
        @click.stop="toggleAutoPanelPin"
      >
        <Pin
          v-if="isAutoPanelDismissed"
          :size="12"
          :stroke-width="2.2"
          aria-hidden="true"
        />
        <X
          v-else
          :size="12"
          :stroke-width="2.2"
          aria-hidden="true"
        />
      </Button>
      <Scrollbar
        v-if="isSidePlacement"
        ref="sideScrollbarRef"
        class="assistant-nav-side-scroll"
      >
        <div
          class="assistant-nav-side-list"
          role="listbox"
          aria-label="Assistant outline"
        >
          <Button
            v-for="marker in sortedMarkers"
            :key="marker.anchorId"
            unstyled
            native-type="button"
            class="assistant-nav-row"
            :class="[
              `level-${Math.min(4, Math.max(1, marker.level))}`,
              `kind-${marker.kind}`,
              { active: marker.navIndex === currentIndex },
            ]"
            :data-assistant-nav-index="marker.navIndex"
            :aria-label="marker.label"
            :aria-current="marker.navIndex === currentIndex ? 'location' : undefined"
            :aria-selected="marker.navIndex === currentIndex"
            role="option"
            @click.stop="handleNavigate(marker.navIndex)"
          >
            <span class="assistant-nav-label">{{ marker.preview || marker.label }}</span>
            <span class="assistant-nav-marker" />
          </Button>
        </div>
      </Scrollbar>

      <div
        v-else
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
            <Button
              v-for="marker in visibleMarkers"
              :key="marker.anchorId"
              unstyled
              native-type="button"
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
            </Button>
          </div>
        </Transition>
      </div>
      <span
        v-if="!isSidePlacement && showScrollThumb"
        class="assistant-nav-scroll-thumb"
        :style="scrollThumbStyle"
        aria-hidden="true"
      />
      <Button
        v-if="!isSidePlacement && hasPreviousPage"
        unstyled
        native-type="button"
        class="assistant-nav-page-cue assistant-nav-page-cue-top"
        aria-label="Previous outline page"
        title="Previous page"
        @click.stop="goToPreviousPage"
      >
        <span class="assistant-nav-page-cue-icon" />
      </Button>
      <Button
        v-if="!isSidePlacement && hasNextPage"
        unstyled
        native-type="button"
        class="assistant-nav-page-cue assistant-nav-page-cue-bottom"
        aria-label="Next outline page"
        title="Next page"
        @click.stop="goToNextPage"
      >
        <span class="assistant-nav-page-cue-icon" />
      </Button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import Scrollbar from '@/components/common/Scrollbar.vue'
import { Pin, X } from 'lucide-vue-next'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { AssistantMessageOutlineMarker } from './assistant-message-outline'

const props = withDefaults(defineProps<{
  markers: AssistantMessageOutlineMarker[]
  currentIndex: number
  showModeSwitch?: boolean
  panelAvailable?: boolean
  placement?: 'overlay' | 'side'
}>(), {
  panelAvailable: true,
  placement: 'overlay',
})

const emit = defineEmits<{
  navigate: [navIndex: number]
  switchMode: []
}>()

const sortedMarkers = computed(() => [...props.markers].sort((a, b) => a.navIndex - b.navIndex))
const sideScrollbarRef = ref<InstanceType<typeof Scrollbar> | null>(null)
const isOpen = ref(false)
const isAutoPanelDismissed = ref(false)
const pageStartIndex = ref(0)
const pageDirection = ref<1 | -1>(1)
let pageWheelLockTimer: ReturnType<typeof setTimeout> | null = null

const SIDE_ACTIVE_MARKER_OFFSET_PX = 16
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
const isSidePlacement = computed(() => props.placement === 'side')
const effectivePanelAvailable = computed(() => isSidePlacement.value || props.panelAvailable)
const effectiveOpen = computed(() => isSidePlacement.value || isOpen.value || (props.panelAvailable && !isAutoPanelDismissed.value))

function openPanel() {
  if (isSidePlacement.value) return
  isOpen.value = true
}

function closePanel() {
  if (isSidePlacement.value) return
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

function scrollActiveSideMarkerIntoView() {
  if (!isSidePlacement.value || props.currentIndex < 0) return
  const scroller = sideScrollbarRef.value?.getScrollElement()
  if (!scroller) return

  const row = scroller.querySelector<HTMLElement>(`[data-assistant-nav-index="${props.currentIndex}"]`)
  if (!row) return

  const rowTop = row.offsetTop
  const rowBottom = rowTop + row.offsetHeight
  const viewTop = scroller.scrollTop
  const viewBottom = viewTop + scroller.clientHeight
  let nextTop: number | null = null

  if (rowTop < viewTop + SIDE_ACTIVE_MARKER_OFFSET_PX) {
    nextTop = rowTop - SIDE_ACTIVE_MARKER_OFFSET_PX
  } else if (rowBottom > viewBottom - SIDE_ACTIVE_MARKER_OFFSET_PX) {
    nextTop = rowBottom - scroller.clientHeight + SIDE_ACTIVE_MARKER_OFFSET_PX
  }

  if (nextTop === null) return
  const top = Math.max(0, nextTop)
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({
      top,
      behavior: 'smooth',
    })
  } else {
    scroller.scrollTop = top
  }
}

function dismissAutoPanel() {
  isAutoPanelDismissed.value = true
  isOpen.value = false
}

function toggleAutoPanelPin() {
  if (isAutoPanelDismissed.value) {
    isAutoPanelDismissed.value = false
    isOpen.value = false
    return
  }

  dismissAutoPanel()
}

watch(
  () => props.panelAvailable,
  available => {
    if (!available && !isSidePlacement.value) {
      isAutoPanelDismissed.value = false
    }
  },
)

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

watch(
  [() => props.currentIndex, () => props.markers.length, isSidePlacement],
  () => nextTick(scrollActiveSideMarkerIntoView),
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
.assistant-nav-rail {
  --assistant-nav-row-height: 18px;
  --assistant-nav-row-gap: 7px;
  --assistant-nav-visible-count: 8;
  --assistant-nav-vertical-padding: 22px;
  --assistant-nav-header-offset: 0px;
  --assistant-nav-header-offset-half: 0px;
  --assistant-nav-collapsed-width: 24px;
  --assistant-nav-expanded-width: min(286px, calc(100vw - 64px));
  position: absolute;
  top: calc(50% - var(--assistant-nav-header-offset-half));
  right: 6px;
  width: var(--assistant-nav-expanded-width);
  height: calc(
    var(--assistant-nav-row-height) * var(--assistant-nav-visible-count) +
    var(--assistant-nav-row-gap) * (var(--assistant-nav-visible-count) - 1) +
    var(--assistant-nav-vertical-padding) * 2 +
    var(--assistant-nav-header-offset)
  );
  z-index: var(--z-dropdown);
  pointer-events: none;
  user-select: none;
  transform: translateY(-50%);
}

.assistant-nav-rail.with-mode-tabs {
  --assistant-nav-header-offset: 28px;
  --assistant-nav-header-offset-half: 14px;
}

.assistant-nav-rail.placement-side {
  --assistant-nav-expanded-width: 100%;
  position: relative;
  top: auto;
  right: auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  z-index: auto;
  pointer-events: auto;
  transform: none;
}

.assistant-nav-card {
  position: absolute;
  top: 50%;
  right: 0;
  box-sizing: border-box;
  width: var(--assistant-nav-collapsed-width);
  height: 100%;
  overflow: visible;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  box-shadow: none;
  pointer-events: auto;
  transform: translateY(-50%);
  /* Single scroll indicator at rest: the outline only fades in when the
     pointer reaches the right edge, so it never doubles the system
     scrollbar. */
  opacity: 0;
  transition:
    opacity 0.14s ease,
    width 0.16s ease,
    border-color 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.assistant-nav-card:hover,
.assistant-nav-card:focus-within,
.assistant-nav-card.open {
  opacity: 1;
}

.assistant-nav-rail.placement-side .assistant-nav-card,
.assistant-nav-rail.placement-side .assistant-nav-card.open {
  opacity: 1;
}

.assistant-nav-card.open {
  width: var(--assistant-nav-expanded-width);
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 34%, transparent);
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg))) 64%, transparent);
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.045),
    0 1px 3px rgba(0, 0, 0, 0.035);
}

.assistant-nav-rail.placement-side .assistant-nav-card {
  position: relative;
  top: auto;
  right: auto;
  width: 100%;
  min-width: 0;
  border-color: transparent;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}

.assistant-nav-rail.placement-side .assistant-nav-card.open {
  width: 100%;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.assistant-nav-scroll {
  position: absolute;
  top: calc(var(--assistant-nav-vertical-padding) + var(--assistant-nav-header-offset));
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

.assistant-nav-rail.placement-side .assistant-nav-scroll {
  pointer-events: auto;
}

.assistant-nav-side-scroll {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.assistant-nav-side-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
  padding: 2px 9px 2px 0;
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

.assistant-nav-rail.placement-side .assistant-nav-row {
  width: 100%;
  height: 24px;
  min-height: 24px;
  padding: 0 26px 0 8px;
  overflow: hidden;
  border-radius: 6px;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.assistant-nav-rail.placement-side .assistant-nav-row:hover,
.assistant-nav-rail.placement-side .assistant-nav-row:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 8%, transparent);
}

.assistant-nav-rail.placement-side .assistant-nav-row.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
}

.assistant-nav-label {
  position: absolute;
  top: 50%;
  right: 42px;
  width: calc(var(--assistant-nav-expanded-width) - 72px);
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  font-size: 12px;
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
  opacity: 0.7;
  visibility: visible;
}

.assistant-nav-rail.placement-side .assistant-nav-label {
  position: static;
  display: block;
  width: 100%;
  opacity: 0.74;
  text-align: left;
  visibility: visible;
  transform: none;
  line-height: 24px;
}

.assistant-nav-row.level-1 .assistant-nav-label,
.assistant-nav-row.level-2 .assistant-nav-label {
  font-weight: 600;
}

.assistant-nav-row.level-3 .assistant-nav-label,
.assistant-nav-row.level-4 .assistant-nav-label {
  opacity: 0.68;
}

.assistant-nav-rail.placement-side .assistant-nav-row.level-3 .assistant-nav-label,
.assistant-nav-rail.placement-side .assistant-nav-row.level-4 .assistant-nav-label {
  opacity: 0.68;
}

.assistant-nav-card.open .assistant-nav-row:hover .assistant-nav-label,
.assistant-nav-card.open .assistant-nav-row:focus-visible .assistant-nav-label {
  color: var(--ui-accent-primary-fg, var(--accent));
  opacity: 1;
}

.assistant-nav-marker {
  position: absolute;
  top: 50%;
  right: 5px;
  width: 14px;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 42%, transparent);
  opacity: 0.62;
  transform: translateY(-50%);
  transition:
    width 0.12s ease,
    background-color 0.12s ease,
    opacity 0.12s ease,
    box-shadow 0.12s ease;
}

.assistant-nav-rail.placement-side .assistant-nav-marker {
  right: 8px;
}

.assistant-nav-row.level-3 .assistant-nav-marker {
  width: 14px;
}

.assistant-nav-row.level-4 .assistant-nav-marker {
  width: 14px;
  opacity: 0.62;
}

.assistant-nav-row.kind-code .assistant-nav-marker,
.assistant-nav-row.kind-table .assistant-nav-marker,
.assistant-nav-row.kind-image .assistant-nav-marker {
  height: 4px;
}

.assistant-nav-row:hover .assistant-nav-marker,
.assistant-nav-row:focus-visible .assistant-nav-marker {
  opacity: 0.92;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 64%, var(--ui-text-muted-fg, var(--text-muted, var(--muted))));
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
  width: 14px;
  opacity: 1;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 84%, var(--ui-text-muted-fg, var(--muted)));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 8%, transparent);
}

.assistant-nav-scroll-thumb {
  position: absolute;
  top: calc(var(--assistant-nav-vertical-padding) + var(--assistant-nav-header-offset));
  right: 1px;
  display: none;
  width: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 24%, transparent);
  pointer-events: none;
}

.assistant-nav-card.open .assistant-nav-scroll-thumb {
  display: block;
}

.assistant-nav-rail.placement-side .assistant-nav-scroll-thumb {
  display: block;
}

.assistant-nav-page-cue {
  position: absolute;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  width: var(--assistant-nav-collapsed-width);
  height: 18px;
  padding: 0 7px 0 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 62%, transparent);
  cursor: pointer;
  opacity: 0.42;
  pointer-events: auto;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    opacity 0.12s ease;
}

.assistant-nav-card.open .assistant-nav-page-cue {
  opacity: 0.58;
}

.assistant-nav-page-cue:hover,
.assistant-nav-page-cue:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
  opacity: 0.9;
  outline: none;
}

.assistant-nav-mode-tabs {
  position: absolute;
  top: 8px;
  right: 32px;
  z-index: 2;
  display: inline-grid;
  grid-template-columns: auto auto;
  align-items: center;
  height: 20px;
  padding: 1px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg))) 52%, transparent);
  opacity: 0.5;
  pointer-events: auto;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    opacity 0.12s ease;
}

.assistant-nav-rail.placement-side .assistant-nav-mode-tabs {
  right: 0;
}

.assistant-nav-card.open .assistant-nav-mode-tabs {
  opacity: 0.72;
}

.assistant-nav-mode-tabs:hover,
.assistant-nav-mode-tabs:focus-within {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 22%, transparent);
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg))) 76%, transparent);
  opacity: 1;
}

.assistant-nav-mode-tab {
  box-sizing: border-box;
  min-width: 42px;
  height: 16px;
  padding: 0 7px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 72%, transparent);
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
  font-weight: 650;
  line-height: 16px;
  text-align: center;
}

.assistant-nav-mode-tab.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 82%, var(--ui-accent-primary-fg, var(--accent)) 18%);
  cursor: default;
}

.assistant-nav-mode-tab:not(.active):hover,
.assistant-nav-mode-tab:not(.active):focus-visible {
  color: var(--ui-accent-primary-fg, var(--accent));
  outline: none;
}

.assistant-nav-close {
  position: absolute;
  top: 7px;
  left: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 56%, transparent);
  cursor: pointer;
  opacity: 0.42;
  pointer-events: auto;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    opacity 0.12s ease;
}

.assistant-nav-close:hover,
.assistant-nav-close:focus-visible {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 8%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
  opacity: 0.9;
  outline: none;
}

.assistant-nav-close.can-pin {
  color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 76%, var(--ui-text-muted-fg, var(--muted)));
  opacity: 0.7;
}

.assistant-nav-close.can-pin:hover,
.assistant-nav-close.can-pin:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
  opacity: 1;
}

.assistant-nav-page-cue-icon {
  width: 7px;
  height: 7px;
  border-top: 1.5px solid currentColor;
  border-left: 1.5px solid currentColor;
}

.assistant-nav-page-cue-top {
  top: calc(var(--assistant-nav-header-offset) + 5px);
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
