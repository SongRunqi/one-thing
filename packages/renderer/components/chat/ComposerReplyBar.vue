<template>
  <div class="composer-reply">
    <span class="reply-author">{{ replyTo.authorLabel }}</span>
    <span class="reply-excerpt">{{ replyTo.excerpt }}</span>
    <button
      type="button"
      class="reply-cancel"
      title="取消引用"
      aria-label="取消引用"
      @click="emit('cancel')"
    >
      ×
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * The pending quote, shown above the composer (W7,
 * docs/design/multi-agent-collab-im.md §3.5 A / §3.6).
 *
 * A trace, not a panel: one hairline down the left edge, the author half-bold,
 * the excerpt clipped to a single line, and an × that drops it. It mirrors the
 * quote block that will end up on the sent message, so what you see before
 * sending is what the room gets.
 */
import type { ChatMessageReplyTo } from '@/types'

defineProps<{ replyTo: ChatMessageReplyTo }>()
const emit = defineEmits<{ cancel: [] }>()
</script>

<style scoped>
.composer-reply {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  padding: 2px 4px 2px 7px;
  border-left: 2px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 30%, transparent);
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 3%, transparent);
  font-size: 11px;
  line-height: 1.55;
  color: var(--ui-text-muted-fg, var(--text-muted));
  user-select: none;
}

.reply-author {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.reply-excerpt {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-cancel {
  flex-shrink: 0;
  appearance: none;
  border: none;
  background: transparent;
  padding: 0 2px;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.reply-cancel:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.reply-cancel:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 1px;
}
</style>
