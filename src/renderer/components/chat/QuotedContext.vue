<template>
  <div
    v-if="text"
    class="quoted-context"
  >
    <div class="quoted-bar" />
    <div class="quoted-content-wrapper">
      <div class="quoted-text">
        {{ text }}
      </div>
      <button
        class="remove-quote-btn"
        title="Remove"
        @click="emit('clear')"
      >
        <X
          :size="16"
          :stroke-width="2.5"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  text: string
}>()

const emit = defineEmits<{
  (e: 'clear'): void
}>()
</script>

<style scoped>
.quoted-context {
  display: flex;
  gap: 10px;
  padding: 9px 10px;
  margin-bottom: 0;
  background: color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 38%, transparent);
  border: 0.5px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  position: relative;
  animation: slideInDown 0.2s ease-out;
}

@keyframes slideInDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.quoted-bar {
  width: 3px;
  background: linear-gradient(to bottom, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 60%, transparent), color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 30%, transparent));
  border-radius: 2px;
  flex-shrink: 0;
}

.quoted-content-wrapper {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.quoted-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-primary-fg, var(--text));
  opacity: 0.75;
  max-height: 80px;
  overflow-y: auto;
  min-width: 0;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.quoted-text::-webkit-scrollbar { width: 3px; }
.quoted-text::-webkit-scrollbar-track { background: transparent; }
.quoted-text::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

.remove-quote-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
  opacity: 0.6;
}

.remove-quote-btn:hover {
  background: var(--ui-state-hover-bg, var(--bg-hover));
  color: var(--ui-text-primary-fg, var(--text-primary));
  opacity: 1;
}
</style>
