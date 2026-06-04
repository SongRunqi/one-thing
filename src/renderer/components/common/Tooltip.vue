<template>
  <div
    ref="wrapperRef"
    class="tooltip-wrapper"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <slot />
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div
          v-if="visible"
          class="tooltip"
          :style="tooltipStyle"
        >
          {{ text }}
          <div
            class="tooltip-arrow"
            :style="arrowStyle"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface Props {
  text: string
  delay?: number
  position?: 'top' | 'bottom' | 'left' | 'right'
}

const props = withDefaults(defineProps<Props>(), {
  delay: 400,
  position: 'top'
})

const wrapperRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const tooltipPosition = ref({ top: 0, left: 0 })
const actualPosition = ref<'top' | 'bottom' | 'left' | 'right'>('top')

let showTimer: ReturnType<typeof setTimeout> | null = null

function handleMouseEnter() {
  showTimer = setTimeout(() => {
    updatePosition()
    visible.value = true
  }, props.delay)
}

function handleMouseLeave() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  visible.value = false
}

function updatePosition() {
  if (!wrapperRef.value) return

  const rect = wrapperRef.value.getBoundingClientRect()
  const padding = 8

  // Handle left/right positions
  if (props.position === 'left') {
    actualPosition.value = 'left'
    tooltipPosition.value = {
      top: rect.top + rect.height / 2,
      left: rect.left - padding
    }
    return
  }

  if (props.position === 'right') {
    actualPosition.value = 'right'
    tooltipPosition.value = {
      top: rect.top + rect.height / 2,
      left: rect.right + padding
    }
    return
  }

  // Handle top/bottom positions
  const tooltipHeight = 32 // approximate tooltip height
  const spaceAbove = rect.top

  // Determine position based on available space
  if (props.position === 'top' && spaceAbove > tooltipHeight + padding) {
    actualPosition.value = 'top'
    tooltipPosition.value = {
      top: rect.top - padding,
      left: rect.left + rect.width / 2
    }
  } else if (props.position === 'bottom' || spaceAbove <= tooltipHeight + padding) {
    actualPosition.value = 'bottom'
    tooltipPosition.value = {
      top: rect.bottom + padding,
      left: rect.left + rect.width / 2
    }
  } else {
    actualPosition.value = 'top'
    tooltipPosition.value = {
      top: rect.top - padding,
      left: rect.left + rect.width / 2
    }
  }
}

const tooltipStyle = computed(() => {
  const pos = actualPosition.value
  if (pos === 'left') {
    return {
      top: `${tooltipPosition.value.top}px`,
      left: `${tooltipPosition.value.left}px`,
      transform: 'translate(-100%, -50%)'
    }
  }
  if (pos === 'right') {
    return {
      top: `${tooltipPosition.value.top}px`,
      left: `${tooltipPosition.value.left}px`,
      transform: 'translate(0, -50%)'
    }
  }
  return {
    top: `${tooltipPosition.value.top}px`,
    left: `${tooltipPosition.value.left}px`,
    transform: pos === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
  }
})

const arrowStyle = computed(() => {
  const pos = actualPosition.value
  if (pos === 'left') {
    return {
      top: '50%',
      left: '100%',
      transform: 'translateY(-50%) rotate(90deg)'
    }
  }
  if (pos === 'right') {
    return {
      top: '50%',
      right: '100%',
      left: 'auto',
      transform: 'translateY(-50%) rotate(-90deg)'
    }
  }
  return {
    top: pos === 'top' ? '100%' : 'auto',
    bottom: pos === 'bottom' ? '100%' : 'auto',
    left: '50%',
    transform: pos === 'top' ? 'translateX(-50%)' : 'translateX(-50%) rotate(180deg)'
  }
})

onUnmounted(() => {
  if (showTimer) {
    clearTimeout(showTimer)
  }
})
</script>

<style scoped>
.tooltip-wrapper {
  display: inline-flex;
  flex-shrink: 0;
}

.tooltip {
  --tooltip-bg: var(--ui-surface-tooltip-bg, var(--bg-tooltip, rgba(24, 24, 27, 0.95)));
  --tooltip-fg: var(--ui-surface-tooltip-fg, var(--ui-text-inverse-fg, #fff));
  --tooltip-border: var(--ui-surface-tooltip-border, color-mix(in srgb, var(--tooltip-fg) 14%, transparent));
  --tooltip-shadow: var(--ui-surface-tooltip-shadow, 0 2px 8px rgba(0, 0, 0, 0.25));

  position: fixed;
  z-index: var(--z-tooltip);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--tooltip-fg);
  background: var(--tooltip-bg);
  border: 0.5px solid var(--tooltip-border);
  border-radius: 6px;
  white-space: pre-line;
  pointer-events: none;
  box-shadow: var(--tooltip-shadow);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.tooltip-arrow {
  position: absolute;
  left: 50%;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid var(--tooltip-bg);
}

/* Transition */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
}
</style>
