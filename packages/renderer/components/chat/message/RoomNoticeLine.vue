<template>
  <div
    class="room-notice-line"
    :title="content"
  >
    {{ content }}
  </div>
</template>

<script setup lang="ts">
/**
 * Room system notice (docs/design/multi-agent-collab-im.md §3.6, W15).
 *
 * A room's system lines are bookkeeping — a task started, a member joined, a
 * budget froze. The product's generic system card (icon disc + tinted panel +
 * trailing timestamp) turns each of them into an announcement, and a stream of
 * announcements is exactly the noise the user called out. So in a room they
 * render as a trace: centred, 11px muted ink, no card, no frame, no icon, no
 * timestamp. Same family as the time capsule, minus the dashed rules — the
 * capsule marks time, this marks an event.
 *
 * Long copy clamps to two lines and keeps the full text in the tooltip: a
 * notice must never be able to out-shout the conversation around it.
 */
defineProps<{ content: string }>()
</script>

<style scoped>
.room-notice-line {
  /* Spacing is the room's, not this component's: every vertical gap in the
     room stream comes from MessageList's gap table (W15). A margin here would
     stack on top of the table value and reintroduce the ragged rhythm. */
  margin: 0;
  text-align: center;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: 0.02em;
  color: var(--ui-text-muted-fg);
  user-select: none;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
</style>
