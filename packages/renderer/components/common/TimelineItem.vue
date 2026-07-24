<template>
  <li
    class="app-timeline-item"
    :class="itemClasses"
    :style="itemStyle"
  >
    <div
      class="app-timeline-item__rail"
      aria-hidden="true"
    >
      <span class="app-timeline-item__line app-timeline-item__line--before" />
      <span class="app-timeline-item__line app-timeline-item__line--after" />
      <span class="app-timeline-item__dot-wrapper">
        <slot name="dot">
          <component
            :is="resolvedIcon"
            v-if="resolvedIcon"
            class="app-timeline-item__icon"
          />
          <span
            v-else
            class="app-timeline-item__dot"
          />
        </slot>
      </span>
    </div>

    <div class="app-timeline-item__content">
      <div
        v-if="showTopTimestamp"
        class="app-timeline-item__timestamp app-timeline-item__timestamp--top"
        :title="timestamp"
      >
        {{ timestamp }}
      </div>
      <div class="app-timeline-item__body">
        <slot />
      </div>
      <div
        v-if="showBottomTimestamp"
        class="app-timeline-item__timestamp app-timeline-item__timestamp--bottom"
        :title="timestamp"
      >
        {{ timestamp }}
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, inject, toRaw, useSlots, type StyleValue } from 'vue'
import {
  normalizeTimelineItemSize,
  normalizeTimelineMode,
  normalizeTimelinePlacement,
  timelineContextKey,
  type TimelineItemIcon,
  type TimelineItemNodeSize,
  type TimelineItemPlacement,
  type TimelineItemType,
} from './timeline'

defineOptions({
  name: 'TimelineItem',
})

const props = withDefaults(defineProps<{
  timestamp?: string
  hideTimestamp?: boolean
  center?: boolean
  placement?: TimelineItemPlacement
  type?: TimelineItemType
  color?: string
  size?: TimelineItemNodeSize
  icon?: TimelineItemIcon
  hollow?: boolean
}>(), {
  timestamp: '',
  hideTimestamp: false,
  center: false,
  placement: 'bottom',
  type: '',
  color: undefined,
  size: 'normal',
  icon: undefined,
  hollow: false,
})

const slots = useSlots()
const timeline = inject(timelineContextKey, null)

const resolvedMode = computed(() => normalizeTimelineMode(timeline?.mode.value))
const resolvedPlacement = computed(() => normalizeTimelinePlacement(props.placement))
const resolvedNodeSize = computed(() => normalizeTimelineItemSize(props.size))
const resolvedIcon = computed(() => props.icon ? toRaw(props.icon) : undefined)
const hasTimestamp = computed(() => !props.hideTimestamp && Boolean(props.timestamp))
const showTopTimestamp = computed(() => hasTimestamp.value && resolvedPlacement.value === 'top')
const showBottomTimestamp = computed(() => hasTimestamp.value && resolvedPlacement.value === 'bottom')
const sizeClass = computed(() => props.size === 'large' || props.size === 'normal' ? props.size : 'custom')

const itemClasses = computed(() => [
  `app-timeline-item--mode-${resolvedMode.value}`,
  `app-timeline-item--placement-${resolvedPlacement.value}`,
  `app-timeline-item--size-${sizeClass.value}`,
  props.type ? `app-timeline-item--${props.type}` : '',
  {
    'is-center': props.center,
    'is-hollow': props.hollow,
    'has-custom-color': Boolean(props.color),
    'has-dot-slot': Boolean(slots.dot),
    'has-icon': Boolean(resolvedIcon.value),
  },
])

const itemStyle = computed<StyleValue>(() => {
  const style: Record<string, string> = {
    '--app-timeline-node-size': resolvedNodeSize.value,
  }

  if (props.color) {
    style['--app-timeline-node-color'] = props.color
  }

  return style
})
</script>

<style scoped>
.app-timeline-item {
  --app-timeline-node-size: 12px;
  --app-timeline-node-color: var(--app-timeline-node-default-color, var(--ui-text-muted-fg, var(--muted)));
  --app-timeline-node-anchor: 4px;
  --app-timeline-dot-border-color: var(--ui-surface-app-bg, var(--bg));
  --app-timeline-line-width: 1px;

  position: relative;
  display: grid;
  min-width: 0;
  grid-template-columns: var(--app-timeline-rail-width, 18px) minmax(0, 1fr);
  column-gap: var(--app-timeline-gap, 12px);
  padding: 0 0 var(--app-timeline-item-gap, 18px);
  list-style: none;
}

.app-timeline-item:last-child {
  padding-bottom: 0;
}

.app-timeline-item--primary {
  --app-timeline-node-color: var(--ui-accent-primary-fg, var(--accent));
}

.app-timeline-item--success {
  --app-timeline-node-color: var(--ui-status-success-fg, var(--color-success));
}

.app-timeline-item--warning {
  --app-timeline-node-color: var(--ui-status-warning-fg, var(--color-warning));
}

.app-timeline-item--danger {
  --app-timeline-node-color: var(--ui-status-danger-fg, var(--color-danger));
}

.app-timeline-item--info {
  --app-timeline-node-color: var(--ui-status-info-fg, var(--color-info));
}

.app-timeline-item__rail {
  position: relative;
  grid-column: 1;
  grid-row: 1;
  display: flex;
  justify-content: center;
  min-height: max(24px, var(--app-timeline-node-size));
}

.app-timeline-item__content {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  max-width: 100%;
  color: var(--ui-text-primary-fg, var(--text));
  font-family: var(--type-body-font, var(--font-sans));
  font-size: var(--type-body-size);
  line-height: var(--type-body-line-height);
}

.app-timeline-item__body {
  min-width: 0;
}

.app-timeline-item__timestamp {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--type-caption-muted-color, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--type-caption-muted-font, var(--font-sans));
  font-size: var(--type-caption-muted-size, var(--type-caption-size));
  font-weight: var(--type-caption-muted-weight, 500);
  line-height: var(--type-caption-muted-line-height, var(--type-caption-line-height));
}

.app-timeline-item__timestamp--top {
  margin-bottom: 4px;
}

.app-timeline-item__timestamp--bottom {
  margin-top: 4px;
}

.app-timeline-item__line {
  position: absolute;
  left: 50%;
  width: var(--app-timeline-line-width);
  transform: translateX(-50%);
  background: var(--app-timeline-line-color, var(--ui-border-default-border, var(--border)));
  pointer-events: none;
}

.app-timeline-item__line--before {
  top: 0;
  bottom: calc(100% - var(--app-timeline-node-anchor));
}

.app-timeline-item__line--after {
  top: var(--app-timeline-node-anchor);
  bottom: calc(-1 * var(--app-timeline-item-gap, 18px));
}

.app-timeline-item:first-child > .app-timeline-item__rail > .app-timeline-item__line--before,
.app-timeline-item:last-child > .app-timeline-item__rail > .app-timeline-item__line--after {
  display: none;
}

.app-timeline-item__dot-wrapper {
  position: absolute;
  z-index: 1;
  top: var(--app-timeline-node-anchor);
  left: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--app-timeline-node-size);
  height: var(--app-timeline-node-size);
  border: 2px solid var(--app-timeline-dot-border-color);
  border-radius: 50%;
  background: var(--app-timeline-node-color);
  color: var(--ui-text-inverse-fg, #fff);
  transform: translateX(-50%);
}

.app-timeline-item__dot {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.app-timeline-item__icon {
  display: block;
  width: 72%;
  height: 72%;
  flex: 0 0 auto;
  color: currentColor;
}

.app-timeline-item.is-hollow > .app-timeline-item__rail > .app-timeline-item__dot-wrapper {
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--app-timeline-node-color);
  border-color: var(--app-timeline-node-color);
}

.app-timeline-item.has-dot-slot > .app-timeline-item__rail > .app-timeline-item__dot-wrapper {
  width: auto;
  height: auto;
  min-width: var(--app-timeline-node-size);
  min-height: var(--app-timeline-node-size);
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--app-timeline-node-color);
}

.app-timeline-item.is-center {
  --app-timeline-node-anchor: 50%;
}

.app-timeline-item.is-center > .app-timeline-item__rail > .app-timeline-item__dot-wrapper {
  transform: translate(-50%, -50%);
}

.app-timeline-item--mode-end {
  grid-template-columns: minmax(0, 1fr) var(--app-timeline-rail-width, 18px);
}

.app-timeline-item--mode-end > .app-timeline-item__rail {
  grid-column: 2;
}

.app-timeline-item--mode-end > .app-timeline-item__content {
  grid-column: 1;
  text-align: right;
}

.app-timeline-item--mode-alternate,
.app-timeline-item--mode-alternate-reverse {
  grid-template-columns: minmax(0, 1fr) var(--app-timeline-rail-width, 18px) minmax(0, 1fr);
}

.app-timeline-item--mode-alternate > .app-timeline-item__rail,
.app-timeline-item--mode-alternate-reverse > .app-timeline-item__rail {
  grid-column: 2;
}

.app-timeline-item--mode-alternate > .app-timeline-item__content {
  grid-column: 3;
}

.app-timeline-item--mode-alternate:nth-child(even) > .app-timeline-item__content {
  grid-column: 1;
  text-align: right;
}

.app-timeline-item--mode-alternate-reverse > .app-timeline-item__content {
  grid-column: 1;
  text-align: right;
}

.app-timeline-item--mode-alternate-reverse:nth-child(even) > .app-timeline-item__content {
  grid-column: 3;
  text-align: left;
}

@media (max-width: 640px) {
  .app-timeline-item--mode-alternate,
  .app-timeline-item--mode-alternate-reverse,
  .app-timeline-item--mode-end {
    grid-template-columns: var(--app-timeline-rail-width, 18px) minmax(0, 1fr);
  }

  .app-timeline-item--mode-alternate > .app-timeline-item__rail,
  .app-timeline-item--mode-alternate-reverse > .app-timeline-item__rail,
  .app-timeline-item--mode-end > .app-timeline-item__rail {
    grid-column: 1;
  }

  .app-timeline-item--mode-alternate > .app-timeline-item__content,
  .app-timeline-item--mode-alternate:nth-child(even) > .app-timeline-item__content,
  .app-timeline-item--mode-alternate-reverse > .app-timeline-item__content,
  .app-timeline-item--mode-alternate-reverse:nth-child(even) > .app-timeline-item__content,
  .app-timeline-item--mode-end > .app-timeline-item__content {
    grid-column: 2;
    text-align: left;
  }
}
</style>
