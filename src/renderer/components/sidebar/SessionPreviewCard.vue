<template>
  <div class="session-preview">
    <div class="preview-head">
      <span class="preview-name">{{ sessionName || 'New chat' }}</span>
      <span
        v-if="segments.length"
        class="preview-count"
      >{{ segments.length }}</span>
    </div>

    <div
      v-if="loading"
      class="preview-empty"
    >
      …
    </div>

    <!-- No segments is the common case for short or brand-new sessions, so it
         falls back to the first-message preview rather than showing nothing. -->
    <div
      v-else-if="!segments.length"
      class="preview-empty"
    >
      {{ fallbackText || 'No activity yet' }}
    </div>

    <SessionSegmentList
      v-else
      :segments="visibleSegments"
    />

    <div
      v-if="hiddenCount > 0"
      class="preview-more"
    >
      +{{ hiddenCount }} more
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SessionSegmentList from '@/components/common/SessionSegmentList.vue'
import type { SessionSegment } from '@/types'

interface Props {
  sessionName?: string
  segments: SessionSegment[]
  loading?: boolean
  /** Shown when the session has no segments — usually the first user message. */
  fallbackText?: string
  maxItems?: number
}

const props = withDefaults(defineProps<Props>(), {
  sessionName: '',
  loading: false,
  fallbackText: '',
  maxItems: 14,
})

// Newest last reads as a timeline, but a long session should show the recent
// end rather than where it started. The cap is generous because the card
// scrolls; it exists to bound the DOM, not to hide content.
const visibleSegments = computed(() => props.segments.slice(-props.maxItems))
const hiddenCount = computed(() => Math.max(0, props.segments.length - props.maxItems))
</script>

<style scoped>
/* 账页画线风:纸面 + 细墨边,不用 tooltip 的深色胶囊 */
.session-preview {
  --preview-ink: var(--ui-text-primary-fg, var(--text));
  --preview-muted: var(--ui-text-muted-fg, var(--muted));

  box-sizing: border-box;
  width: 380px;
  /* Reachable via the tooltip's safe triangle, so scrolling is usable again —
     a long session can show every segment instead of only the newest few. */
  max-height: min(60vh, 460px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 12px 11px;
  font-family: var(--type-label-font);
  font-size: 12px;
  line-height: 1.5;
  color: var(--preview-ink);
  background: var(--ui-surface-panel-bg, var(--bg-panel, var(--bg)));
  border: 1px solid color-mix(
    in srgb,
    var(--ui-border-strong-border, var(--border-strong, var(--border))) 52%,
    transparent
  );
  border-radius: var(--radius-xs, 4px);
  box-shadow: var(--ui-surface-tooltip-shadow, 0 4px 16px rgba(0, 0, 0, 0.18));
  text-align: left;
}

.preview-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 7px;
  margin-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--preview-muted) 24%, transparent);
}

.preview-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-count,
.preview-more {
  font-family: var(--type-mono-font, monospace);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--preview-muted);
  flex-shrink: 0;
}

.preview-empty {
  color: var(--preview-muted);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
}

.preview-more {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid color-mix(in srgb, var(--preview-muted) 24%, transparent);
}
</style>
