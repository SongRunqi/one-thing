<template>
  <div class="room-time-capsule">
    <span class="capsule-rule" />
    <span class="capsule-label">{{ label }}</span>
    <span class="capsule-rule" />
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<style scoped>
/* A break in the conversation, drawn the way the drive hairline is: two
   dashed rules and a small mono-spaced stamp between them. It marks time —
   it must not read as a card. */
.room-time-capsule {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Zero, always: the capsule band (above AND below) is owned by MessageList's
     room gap table (W15). This 2px/12px pair was a second source for the same
     gap — masked today only because the table's blanket rule outranks it, and
     a silent 12px waiting to reappear the moment specificity shifted. */
  margin: 0;
  user-select: none;
}

.capsule-rule {
  flex: 1;
  border-top: 1px dashed color-mix(in srgb, var(--ui-text-muted-fg) 30%, transparent);
}

.capsule-label {
  flex-shrink: 0;
  font-size: 10px;
  letter-spacing: 0.06em;
  line-height: 1;
  color: var(--ui-text-muted-fg);
  font-variant-numeric: tabular-nums;
}
</style>
