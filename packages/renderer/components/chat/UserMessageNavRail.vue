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
let hasUserNavigatedManually = false
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
  hasUserNavigatedManually = true
  openPanel()
  setPageStart(pageStartIndex.value - pageSize, -1)
}

function goToNextPage() {
  hasUserNavigatedManually = true
  openPanel()
  setPageStart(pageStartIndex.value + pageSize, 1)
}

function handleNavigate(navIndex: number) {
  hasUserNavigatedManually = false
  emit('navigate', navIndex)
}

watch(
  [() => props.currentIndex, () => props.markers.length],
  () => {
    if (hasUserNavigatedManually) return
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

/* Ledger (墨线): the trail is a vertical rule at the right edge; rows hang
   off it via tick marks. No fills, no radii — state lives in the line.
   波 4 判定同 AssistantMessageNavRail:**保留自绘,不迁 Popover** —— 这是就地
   展开的卡(宽度过渡 + `placement-side` 的行内常驻形态),不是浮层。 */
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
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  pointer-events: auto;
  transform: translateY(-50%);
  /* Hidden at rest; fades in on right-edge hover so the system scrollbar
     stays the only resting scroll indicator. */
  opacity: 0;
  transition:
    opacity var(--duration-fast) var(--ease-default),
    width var(--duration-normal) var(--ease-default),
    border-color var(--duration-normal) var(--ease-default),
    background-color var(--duration-normal) var(--ease-default);
}

/* 主账目线：行刻度(.user-nav-marker)挂在这条线上 */
.user-nav-card::before {
  content: '';
  position: absolute;
  top: calc(var(--user-nav-vertical-padding) + var(--user-nav-header-offset) - 2px);
  right: 6px;
  bottom: calc(var(--user-nav-vertical-padding) - 2px);
  width: 1px;
  background: color-mix(
    in srgb,
    var(--ui-border-strong-border) 80%,
    transparent
  );
  pointer-events: none;
}

.user-nav-card:hover,
.user-nav-card:focus-within,
.user-nav-card.open {
  opacity: 1;
}

.user-nav-rail.placement-side .user-nav-card,
.user-nav-rail.placement-side .user-nav-card.open {
  opacity: 1;
}

.user-nav-card.open {
  width: var(--user-nav-expanded-width);
  border-color: color-mix(in srgb, var(--ui-border-strong-border) 55%, transparent);
  background: var(--ui-surface-elevated-bg);
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
  color: var(--ui-text-muted-fg);
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
  color: var(--ui-text-secondary-fg);
  font-size: 12.5px;
  line-height: 1;
  opacity: 0;
  text-align: right;
  visibility: hidden;
  transform: translateY(-50%);
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    opacity var(--duration-fast) var(--ease-default),
    visibility var(--duration-fast) var(--ease-default);
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
  color: var(--ui-text-primary-fg);
  opacity: 1;
}

/* Tick: connects the row to the ledger rule (rule sits at right 6px on the
   card, see .user-nav-card::before). Grows leftward from the rule. */
.user-nav-marker {
  position: absolute;
  top: 50%;
  right: 6px;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border);
  transform: translateY(-50%);
  transition:
    width var(--duration-fast) var(--ease-default),
    height var(--duration-fast) var(--ease-default),
    background-color var(--duration-fast) var(--ease-default);
}

.user-nav-row:hover .user-nav-marker,
.user-nav-row:focus-visible .user-nav-marker {
  width: 12px;
  background: var(--ui-text-muted-fg);
}

.user-nav-row:focus-visible {
  outline: none;
}

.user-nav-card.open .user-nav-row.active .user-nav-label {
  color: var(--ui-text-primary-fg);
  font-weight: 600;
  opacity: 1;
  visibility: visible;
}

.user-nav-row.active .user-nav-marker {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg);
}

/* Page position: a darker segment riding the ledger rule itself */
.user-nav-scroll-thumb {
  position: absolute;
  top: calc(var(--user-nav-vertical-padding) + var(--user-nav-header-offset));
  right: 6px;
  display: none;
  width: 1px;
  background: var(--ui-text-muted-fg);
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
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--ui-text-muted-fg) 62%, transparent);
  cursor: pointer;
  opacity: 0.42;
  pointer-events: auto;
  transition:
    color var(--duration-fast) var(--ease-default),
    opacity var(--duration-fast) var(--ease-default);
}

.user-nav-card.open .user-nav-page-cue {
  opacity: 0.58;
}

.user-nav-page-cue:hover,
.user-nav-page-cue:focus-visible {
  background: transparent;
  color: var(--ui-text-primary-fg);
  opacity: 0.9;
  outline: none;
}

/* Mode tabs：零填充文字页签，active 用下划线（画线语言） */
.user-nav-mode-tabs {
  position: absolute;
  top: 8px;
  right: 32px;
  z-index: 2;
  display: inline-grid;
  grid-template-columns: auto auto;
  column-gap: 12px;
  align-items: center;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  opacity: 0.5;
  pointer-events: auto;
  transition: opacity var(--duration-fast) var(--ease-default);
}

.user-nav-rail.placement-side .user-nav-mode-tabs {
  right: 0;
}

.user-nav-card.open .user-nav-mode-tabs {
  opacity: 0.72;
}

.user-nav-mode-tabs:hover,
.user-nav-mode-tabs:focus-within {
  opacity: 1;
}

.user-nav-mode-tab {
  box-sizing: border-box;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--ui-text-muted-fg) 72%, transparent);
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
  font-weight: 650;
  line-height: 16px;
  text-align: center;
}

.user-nav-mode-tab.active {
  color: var(--ui-text-primary-fg);
  cursor: default;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg);
}

.user-nav-mode-tab:not(.active):hover,
.user-nav-mode-tab:not(.active):focus-visible {
  color: var(--ui-text-primary-fg);
  outline: none;
  text-decoration: underline;
  text-underline-offset: 3px;
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
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--ui-text-muted-fg) 56%, transparent);
  cursor: pointer;
  opacity: 0.42;
  pointer-events: auto;
  transition:
    color var(--duration-fast) var(--ease-default),
    opacity var(--duration-fast) var(--ease-default);
}

.user-nav-close:hover,
.user-nav-close:focus-visible {
  background: transparent;
  color: var(--ui-text-primary-fg);
  opacity: 0.9;
  outline: none;
}

.user-nav-close.can-pin {
  color: color-mix(in srgb, var(--ui-accent-primary-fg) 76%, var(--ui-text-muted-fg));
  opacity: 0.7;
}

.user-nav-close.can-pin:hover,
.user-nav-close.can-pin:focus-visible {
  background: transparent;
  color: var(--ui-accent-primary-fg);
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
    opacity var(--duration-normal) var(--ease-default),
    transform var(--duration-normal) var(--ease-out),
    filter var(--duration-normal) var(--ease-default);
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
    transition: opacity var(--duration-fast) var(--ease-default);
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
