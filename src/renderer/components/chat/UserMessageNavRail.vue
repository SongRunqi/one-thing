<template>
  <nav
    class="user-nav-rail"
    :class="[
      `placement-${props.placement}`,
      { 'with-mode-tabs': showModeSwitch && effectivePanelAvailable && effectiveOpen },
    ]"
    aria-label="User message navigation"
  >
    <div
      class="user-nav-card"
      :class="{ open: effectiveOpen }"
      @mouseenter="openPanel"
      @mouseleave="closePanel"
      @focusin="openPanel"
      @pointerdown.stop
      @click.stop
    >
      <div
        v-if="showModeSwitch && effectivePanelAvailable && effectiveOpen"
        class="user-nav-mode-tabs"
        aria-label="Navigation mode"
      >
        <Button
          unstyled
          native-type="button"
          class="user-nav-mode-tab"
          aria-label="Show AI outline"
          title="AI outline"
          @click.stop="emit('switchMode')"
        >
          Outline
        </Button>
        <span
          class="user-nav-mode-tab active"
          aria-current="true"
        >
          Trail
        </span>
      </div>
      <Button
        v-if="!isSidePlacement && panelAvailable && effectiveOpen"
        unstyled
        native-type="button"
        class="user-nav-close"
        aria-label="Close navigation panel"
        title="Close panel"
        @click.stop="closePanel"
      >
        <X
          :size="12"
          :stroke-width="2.2"
          aria-hidden="true"
        />
      </Button>
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
            <Button
              v-for="marker in visibleMarkers"
              :key="marker.messageId"
              unstyled
              native-type="button"
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
            </Button>
          </div>
        </Transition>
      </div>
      <span
        v-if="showScrollThumb"
        class="user-nav-scroll-thumb"
        :style="scrollThumbStyle"
        aria-hidden="true"
      />
      <Button
        v-if="hasPreviousPage"
        unstyled
        native-type="button"
        class="user-nav-page-cue user-nav-page-cue-top"
        aria-label="Previous navigation page"
        title="Previous page"
        @click.stop="goToPreviousPage"
      >
        <span class="user-nav-page-cue-icon" />
      </Button>
      <Button
        v-if="hasNextPage"
        unstyled
        native-type="button"
        class="user-nav-page-cue user-nav-page-cue-bottom"
        aria-label="Next navigation page"
        title="Next page"
        @click.stop="goToNextPage"
      >
        <span class="user-nav-page-cue-icon" />
      </Button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { X } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'

export interface UserMessageNavMarker {
  navIndex: number
  messageId: string
  seq?: number
  position: number
  label: string
  preview?: string
}

const props = withDefaults(defineProps<{
  markers: UserMessageNavMarker[]
  currentIndex: number
  totalCount?: number
  showModeSwitch?: boolean
  panelAvailable?: boolean
  placement?: 'overlay' | 'side'
}>(), {
  panelAvailable: true,
  totalCount: 0,
  placement: 'overlay',
})

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

const pageTransitionName = computed(() => pageDirection.value > 0 ? 'nav-page-next' : 'nav-page-prev')
const isSidePlacement = computed(() => props.placement === 'side')
const effectivePanelAvailable = computed(() => isSidePlacement.value || props.panelAvailable)
const effectiveOpen = computed(() => isSidePlacement.value || isOpen.value)

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
.user-nav-rail {
  --user-nav-row-height: 18px;
  --user-nav-row-gap: 7px;
  --user-nav-visible-count: 8;
  --user-nav-vertical-padding: 22px;
  --user-nav-header-offset: 0px;
  --user-nav-header-offset-half: 0px;
  --user-nav-collapsed-width: 24px;
  --user-nav-expanded-width: min(286px, calc(100vw - 64px));
  position: absolute;
  top: calc(50% - var(--user-nav-header-offset-half));
  right: 6px;
  bottom: auto;
  width: var(--user-nav-expanded-width);
  height: calc(
    var(--user-nav-row-height) * var(--user-nav-visible-count) +
    var(--user-nav-row-gap) * (var(--user-nav-visible-count) - 1) +
    var(--user-nav-vertical-padding) * 2 +
    var(--user-nav-header-offset)
  );
  z-index: var(--z-dropdown);
  pointer-events: none;
  user-select: none;
  transform: translateY(-50%);
}

.user-nav-rail.with-mode-tabs {
  --user-nav-header-offset: 28px;
  --user-nav-header-offset-half: 14px;
}

.user-nav-rail.placement-side {
  --user-nav-expanded-width: 100%;
  position: relative;
  top: auto;
  right: auto;
  bottom: auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  z-index: auto;
  pointer-events: auto;
  transform: none;
}

.user-nav-card {
  position: absolute;
  top: 50%;
  right: 0;
  box-sizing: border-box;
  width: var(--user-nav-collapsed-width);
  height: 100%;
  padding: 0;
  overflow: visible;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  box-shadow: none;
  pointer-events: auto;
  transform: translateY(-50%);
  transition:
    opacity 0.14s ease,
    width 0.16s ease,
    border-color 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.user-nav-card.open {
  width: var(--user-nav-expanded-width);
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 34%, transparent);
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg))) 64%, transparent);
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.045),
    0 1px 3px rgba(0, 0, 0, 0.035);
}

.user-nav-rail.placement-side .user-nav-card {
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

.user-nav-rail.placement-side .user-nav-card.open {
  width: 100%;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.user-nav-scroll {
  position: absolute;
  top: calc(var(--user-nav-vertical-padding) + var(--user-nav-header-offset));
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

.user-nav-rail.placement-side .user-nav-scroll {
  pointer-events: auto;
}

.user-nav-page {
  display: grid;
  grid-template-rows: repeat(var(--user-nav-visible-count), var(--user-nav-row-height));
  align-content: start;
  row-gap: var(--user-nav-row-gap);
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
  color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  cursor: pointer;
  font: inherit;
  overflow: visible;
  pointer-events: auto;
  text-align: left;
}

.user-nav-card.open .user-nav-row {
  width: 100%;
}

.user-nav-rail.placement-side .user-nav-row {
  width: 100%;
}

.user-nav-label {
  position: absolute;
  top: 50%;
  right: 42px;
  width: calc(var(--user-nav-expanded-width) - 72px);
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  font-size: 12.5px;
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
  opacity: 0.7;
  visibility: visible;
}

.user-nav-rail.placement-side .user-nav-label {
  right: 30px;
  width: calc(100% - 48px);
  opacity: 0.74;
  text-align: left;
  visibility: visible;
}

.user-nav-card.open .user-nav-row:hover .user-nav-label,
.user-nav-card.open .user-nav-row:focus-visible .user-nav-label {
  color: var(--ui-accent-primary-fg, var(--accent));
  opacity: 1;
}

.user-nav-marker {
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

.user-nav-rail.placement-side .user-nav-marker {
  right: 6px;
}

.user-nav-row:hover .user-nav-marker,
.user-nav-row:focus-visible .user-nav-marker {
  opacity: 0.92;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 64%, var(--ui-text-muted-fg, var(--text-muted, var(--muted))));
}

.user-nav-row:focus-visible {
  outline: none;
}

.user-nav-card.open .user-nav-row.active .user-nav-label {
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 600;
  opacity: 1;
  visibility: visible;
}

.user-nav-row.active .user-nav-marker {
  width: 14px;
  opacity: 1;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 84%, var(--ui-text-muted-fg, var(--muted)));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 8%, transparent);
}

.user-nav-scroll-thumb {
  position: absolute;
  top: calc(var(--user-nav-vertical-padding) + var(--user-nav-header-offset));
  right: 1px;
  display: none;
  width: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 24%, transparent);
  pointer-events: none;
}

.user-nav-card.open .user-nav-scroll-thumb {
  display: block;
}

.user-nav-rail.placement-side .user-nav-scroll-thumb {
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

.user-nav-card.open .user-nav-page-cue {
  opacity: 0.58;
}

.user-nav-page-cue:hover,
.user-nav-page-cue:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
  opacity: 0.9;
  outline: none;
}

.user-nav-mode-tabs {
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

.user-nav-rail.placement-side .user-nav-mode-tabs {
  right: 0;
}

.user-nav-card.open .user-nav-mode-tabs {
  opacity: 0.72;
}

.user-nav-mode-tabs:hover,
.user-nav-mode-tabs:focus-within {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 22%, transparent);
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg))) 76%, transparent);
  opacity: 1;
}

.user-nav-mode-tab {
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

.user-nav-mode-tab.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 82%, var(--ui-accent-primary-fg, var(--accent)) 18%);
  cursor: default;
}

.user-nav-mode-tab:not(.active):hover,
.user-nav-mode-tab:not(.active):focus-visible {
  color: var(--ui-accent-primary-fg, var(--accent));
  outline: none;
}

.user-nav-close {
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

.user-nav-close:hover,
.user-nav-close:focus-visible {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 8%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
  opacity: 0.9;
  outline: none;
}

.user-nav-close.can-pin {
  color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 76%, var(--ui-text-muted-fg, var(--muted)));
  opacity: 0.7;
}

.user-nav-close.can-pin:hover,
.user-nav-close.can-pin:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
  opacity: 1;
}

.user-nav-page-cue-icon {
  width: 7px;
  height: 7px;
  border-top: 1.5px solid currentColor;
  border-left: 1.5px solid currentColor;
}

.user-nav-page-cue-top {
  top: calc(var(--user-nav-header-offset) + 5px);
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
    --user-nav-expanded-width: min(270px, calc(100vw - 44px));
    right: 6px;
  }
}

@media (max-width: 480px) {
  .user-nav-rail {
    display: none;
  }
}
</style>
