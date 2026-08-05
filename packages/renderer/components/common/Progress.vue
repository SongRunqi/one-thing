<template>
  <div
    :class="progressClasses"
    :style="progressStyle"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="isIndeterminate ? undefined : boundedPercentage"
    :aria-valuetext="isIndeterminate ? displayText : undefined"
    :aria-label="ariaLabel"
  >
    <div
      v-if="isLine"
      class="app-progress-line"
    >
      <div class="app-progress-line-track">
        <div class="app-progress-line-bar">
          <span
            v-if="showInsideText"
            class="app-progress-text app-progress-text--inside"
          >
            <slot :percentage="boundedPercentage">
              {{ displayText }}
            </slot>
          </span>
        </div>
      </div>

      <span
        v-if="showOutsideText"
        class="app-progress-text app-progress-text--outside"
      >
        <slot :percentage="boundedPercentage">
          {{ displayText }}
        </slot>
      </span>
    </div>

    <div
      v-else
      class="app-progress-radial"
    >
      <svg
        class="app-progress-svg"
        :width="radialSize"
        :height="radialSize"
        :viewBox="radialViewBox"
        aria-hidden="true"
      >
        <circle
          class="app-progress-radial-track"
          :cx="radialCenter"
          :cy="radialCenter"
          :r="radialRadius"
          fill="none"
          :stroke-width="strokeWidth"
          :stroke-linecap="strokeLinecap"
          :stroke-dasharray="radialTrackDashArray"
          :transform="radialTransform"
        />
        <circle
          class="app-progress-radial-bar"
          :cx="radialCenter"
          :cy="radialCenter"
          :r="radialRadius"
          fill="none"
          :stroke-width="strokeWidth"
          :stroke-linecap="strokeLinecap"
          :stroke-dasharray="radialTrackDashArray"
          :stroke-dashoffset="radialDashOffset"
          :transform="radialTransform"
        />
      </svg>

      <div
        v-if="showText"
        class="app-progress-text app-progress-text--radial"
      >
        <slot :percentage="boundedPercentage">
          {{ displayText }}
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from 'vue'
import {
  normalizeProgressPercentage,
  resolveProgressColor,
  type ProgressColor,
  type ProgressStatus,
  type ProgressStrokeLinecap,
  type ProgressType,
} from './progress'

defineOptions({
  name: 'AppProgress',
})

const props = withDefaults(defineProps<{
  percentage?: number
  type?: ProgressType
  strokeWidth?: number
  textInside?: boolean
  status?: ProgressStatus
  indeterminate?: boolean
  duration?: number
  color?: ProgressColor
  width?: number
  showText?: boolean
  strokeLinecap?: ProgressStrokeLinecap
  format?: (percentage: number) => string | number
  striped?: boolean
  stripedFlow?: boolean
  ariaLabel?: string
}>(), {
  percentage: 0,
  type: 'line',
  strokeWidth: 6,
  textInside: false,
  status: undefined,
  indeterminate: false,
  duration: 3,
  color: undefined,
  width: 126,
  showText: true,
  strokeLinecap: 'round',
  format: undefined,
  striped: false,
  stripedFlow: false,
  ariaLabel: 'Progress',
})

const boundedPercentage = computed(() => normalizeProgressPercentage(props.percentage))
const isLine = computed(() => props.type === 'line')
const isDashboard = computed(() => props.type === 'dashboard')
const isIndeterminate = computed(() => props.indeterminate)
const showInsideText = computed(() => props.showText && props.textInside && isLine.value)
const showOutsideText = computed(() => props.showText && (!props.textInside || !isLine.value) && isLine.value)
const safeStrokeWidth = computed(() => Math.max(1, props.strokeWidth))
const safeDuration = computed(() => Math.max(0.1, props.duration))
const radialSize = computed(() => Math.max(props.width, safeStrokeWidth.value * 2))
const radialCenter = computed(() => radialSize.value / 2)
const radialRadius = computed(() => Math.max(0, (radialSize.value - safeStrokeWidth.value) / 2))
const radialCircumference = computed(() => 2 * Math.PI * radialRadius.value)
const radialTrackLength = computed(() => radialCircumference.value * (isDashboard.value ? 0.75 : 1))
const radialGapLength = computed(() => radialCircumference.value - radialTrackLength.value)
const radialTrackDashArray = computed(() => `${radialTrackLength.value} ${radialGapLength.value}`)
const radialDashOffset = computed(() => radialTrackLength.value * (1 - boundedPercentage.value / 100))
const radialTransform = computed(() => {
  const rotation = isDashboard.value ? 135 : -90
  return `rotate(${rotation} ${radialCenter.value} ${radialCenter.value})`
})
const radialViewBox = computed(() => `0 0 ${radialSize.value} ${radialSize.value}`)
const resolvedColor = computed(() => resolveProgressColor(props.color, boundedPercentage.value, props.status))
const displayText = computed(() => {
  if (props.format) return String(props.format(boundedPercentage.value))
  return `${boundedPercentage.value}%`
})

const progressClasses = computed(() => [
  'app-progress',
  `app-progress--${props.type}`,
  `app-progress--linecap-${props.strokeLinecap}`,
  {
    [`app-progress--${props.status}`]: Boolean(props.status),
    'is-text-inside': showInsideText.value,
    'is-without-text': !props.showText,
    'is-indeterminate': isIndeterminate.value,
    'is-striped': props.striped,
    'is-striped-flow': props.striped && props.stripedFlow,
  },
])

const progressStyle = computed<StyleValue>(() => ({
  '--app-progress-percentage': String(boundedPercentage.value),
  '--app-progress-bar-width': `${boundedPercentage.value}%`,
  '--app-progress-stroke-width': `${safeStrokeWidth.value}px`,
  '--app-progress-duration': `${safeDuration.value}s`,
  '--app-progress-size': `${radialSize.value}px`,
  '--app-progress-fill': resolvedColor.value,
}))
</script>

<style scoped>
.app-progress {
  --app-progress-track-bg: var(--ui-surface-panel-bg);
  --app-progress-track-border: var(--ui-border-subtle-border, var(--ui-border-default-border));
  --app-progress-text-fg: var(--ui-text-secondary-fg);
  --app-progress-inside-text-fg: var(--ui-text-inverse-fg, var(--ui-surface-app-bg));
  --app-progress-radial-text-fg: var(--ui-text-primary-fg);

  display: inline-flex;
  max-width: 100%;
  color: var(--app-progress-text-fg);
  font-family: var(--type-label-font, var(--font-body));
  font-size: var(--type-meta-size);
  font-weight: var(--type-label-weight);
  line-height: var(--type-leading-control);
  letter-spacing: 0;
  vertical-align: middle;
}

.app-progress-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.app-progress-line-track {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: var(--app-progress-stroke-width);
  overflow: hidden;
  background: var(--app-progress-track-bg);
  border: 1px solid var(--app-progress-track-border);
  border-radius: 999px;
}

.app-progress-line-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: var(--app-progress-bar-width);
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--app-progress-fill);
  border-radius: inherit;
  transition:
    width var(--duration-normal) var(--ease-default),
    background-color var(--duration-normal) var(--ease-default);
}

.app-progress-text {
  flex: 0 0 auto;
  min-width: 0;
  color: var(--app-progress-text-fg);
  font-size: inherit;
  font-weight: inherit;
  line-height: 1;
  white-space: nowrap;
}

.app-progress-text--inside {
  max-width: 100%;
  padding: 0 8px;
  overflow: hidden;
  color: var(--app-progress-inside-text-fg);
  font-size: var(--type-caption-size);
  text-overflow: clip;
}

.app-progress-text--outside {
  min-width: 34px;
  text-align: end;
}

.app-progress-radial {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--app-progress-size);
  height: var(--app-progress-size);
}

.app-progress-svg {
  display: block;
  width: var(--app-progress-size);
  height: var(--app-progress-size);
}

.app-progress-radial-track {
  stroke: var(--app-progress-track-bg);
}

.app-progress-radial-bar {
  stroke: var(--app-progress-fill);
  transition:
    stroke-dashoffset var(--duration-normal) var(--ease-default),
    stroke var(--duration-normal) var(--ease-default);
}

.app-progress-text--radial {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14%;
  overflow: hidden;
  color: var(--app-progress-radial-text-fg);
  font-size: var(--type-title-size);
  font-weight: var(--type-title-sm-weight);
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
}

.app-progress--dashboard .app-progress-text--radial {
  align-items: flex-end;
  padding-bottom: 24%;
}

.app-progress--linecap-butt .app-progress-line-track,
.app-progress--linecap-butt .app-progress-line-bar {
  border-radius: 0;
}

.app-progress.is-striped .app-progress-line-bar {
  background-image: linear-gradient(
    45deg,
    color-mix(in srgb, var(--ui-text-inverse-fg, var(--ui-surface-app-bg)) 18%, transparent) 25%,
    transparent 25%,
    transparent 50%,
    color-mix(in srgb, var(--ui-text-inverse-fg, var(--ui-surface-app-bg)) 18%, transparent) 50%,
    color-mix(in srgb, var(--ui-text-inverse-fg, var(--ui-surface-app-bg)) 18%, transparent) 75%,
    transparent 75%,
    transparent
  );
  background-size: 18px 18px;
}

.app-progress.is-striped-flow .app-progress-line-bar {
  animation: app-progress-striped-flow var(--app-progress-duration) linear infinite;
}

.app-progress.is-indeterminate .app-progress-line-bar {
  width: 38%;
  animation: app-progress-indeterminate var(--app-progress-duration) ease-in-out infinite;
}

.app-progress.is-indeterminate.is-striped-flow .app-progress-line-bar {
  animation:
    app-progress-indeterminate var(--app-progress-duration) ease-in-out infinite,
    app-progress-striped-flow var(--app-progress-duration) linear infinite;
}

@keyframes app-progress-indeterminate {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(270%);
  }
}

@keyframes app-progress-striped-flow {
  0% {
    background-position: 0 0;
  }

  100% {
    background-position: 18px 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-progress-line-bar,
  .app-progress-radial-bar {
    transition: none;
  }

  .app-progress.is-striped-flow .app-progress-line-bar,
  .app-progress.is-indeterminate .app-progress-line-bar,
  .app-progress.is-indeterminate.is-striped-flow .app-progress-line-bar {
    animation: none;
  }
}
</style>
