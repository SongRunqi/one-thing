<template>
  <nav
    class="user-nav-rail"
    aria-label="User message navigation"
  >
    <div
      class="user-nav-card"
    >
      <button
        v-for="marker in sortedMarkers"
        :key="marker.messageId"
        type="button"
        class="user-nav-row"
        :class="{ active: marker.navIndex === currentIndex }"
        :style="{ top: `${marker.position * 100}%` }"
        :aria-label="marker.label"
        :aria-current="marker.navIndex === currentIndex ? 'step' : undefined"
        @click.stop="$emit('navigate', marker.navIndex)"
      >
        <span class="user-nav-marker" />
        <span class="user-nav-tooltip">
          <span class="user-nav-tooltip-text">{{ marker.preview || marker.label }}</span>
        </span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface UserMessageNavMarker {
  navIndex: number
  messageId: string
  position: number
  label: string
  preview?: string
}

const props = defineProps<{
  markers: UserMessageNavMarker[]
  currentIndex: number
}>()

const emit = defineEmits<{
  navigate: [navIndex: number]
}>()

const sortedMarkers = computed(() => [...props.markers].sort((a, b) => a.navIndex - b.navIndex))
</script>

<style scoped>
.user-nav-rail {
  position: absolute;
  top: 50%;
  right: 12px;
  bottom: auto;
  width: 34px;
  height: min(42%, 360px);
  z-index: var(--z-dropdown);
  pointer-events: none;
  user-select: none;
  transform: translateY(-50%);
}

.user-nav-card {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  background: transparent;
  pointer-events: auto;
}

.user-nav-row {
  position: absolute;
  right: 0;
  width: 34px;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted, var(--muted));
  font: inherit;
  transform: translateY(-50%);
}

.user-nav-marker {
  position: absolute;
  top: 50%;
  right: 7px;
  width: 10px;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted, var(--muted)) 34%, transparent);
  opacity: 0.74;
  transform: translateY(-50%);
  transition:
    width 0.12s ease,
    height 0.12s ease,
    background-color 0.12s ease,
    opacity 0.12s ease;
}

.user-nav-tooltip {
  position: absolute;
  top: 50%;
  right: 34px;
  width: min(260px, 28vw);
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 94%, white 6%);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.10),
    0 1px 2px rgba(0, 0, 0, 0.08);
  text-align: left;
  opacity: 0;
  transform: translate(4px, -50%);
  pointer-events: none;
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.user-nav-tooltip::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -5px;
  width: 9px;
  height: 9px;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  background: inherit;
  transform: translateY(-50%) rotate(45deg);
}

.user-nav-tooltip-text {
  display: block;
  overflow: hidden;
  color: var(--text-secondary, var(--text));
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.user-nav-row:hover .user-nav-tooltip,
.user-nav-row:focus-visible .user-nav-tooltip {
  opacity: 1;
  transform: translate(0, -50%);
}

.user-nav-row:hover .user-nav-marker {
  width: 10px;
  opacity: 1;
  background: color-mix(in srgb, var(--accent) 72%, var(--text-muted, var(--muted)));
}

.user-nav-row.active {
  color: var(--accent);
}

.user-nav-row.active .user-nav-marker {
  width: 10px;
  height: 2px;
  opacity: 1;
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
}

@media (max-width: 768px) {
  .user-nav-rail {
    right: 6px;
  }
}

@media (max-width: 480px) {
  .user-nav-rail {
    display: none;
  }
}
</style>
