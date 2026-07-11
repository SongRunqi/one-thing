<template>
  <div
    v-if="text"
    class="quoted-context"
    :class="{ expanded }"
  >
    <span
      class="dock-frame-label"
      aria-hidden="true"
    >QUOTE</span>
    <button
      type="button"
      class="quoted-text"
      :title="expanded ? 'Collapse quote' : 'Expand quote'"
      @click="expanded = !expanded"
    >
      {{ text }}
    </button>
    <Button
      unstyled
      class="remove-quote-btn"
      title="Remove"
      @click="emit('clear')"
    >
      <X
        :size="13"
        :stroke-width="2.5"
      />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  text: string
}>()

const emit = defineEmits<{
  (e: 'clear'): void
}>()

const expanded = ref(false)

// A new quote always starts in the compact one-line form.
watch(() => props.text, () => {
  expanded.value = false
})
</script>

<style scoped>
/* Blueprint frame: outlined annotation block with a floating title tag. */
.quoted-context {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 32px;
  padding: 6px 8px 6px 12px;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 52%, transparent);
  border-radius: var(--radius-xs, 4px);
}

.dock-frame-label {
  position: absolute;
  top: -7px;
  left: 10px;
  z-index: 1;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  pointer-events: none;
  user-select: none;
}

.quoted-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  opacity: 0.85;
  font-family: var(--font-display, serif);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quoted-text:hover {
  opacity: 1;
}

.quoted-context.expanded .quoted-text {
  max-height: 120px;
  overflow-y: auto;
  overscroll-behavior: contain;
  white-space: pre-wrap;
  word-wrap: break-word;
  text-overflow: clip;
  scrollbar-width: thin;
}

.quoted-context.expanded .quoted-text::-webkit-scrollbar { width: 3px; }
.quoted-context.expanded .quoted-text::-webkit-scrollbar-track { background: transparent; }
.quoted-context.expanded .quoted-text::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

.remove-quote-btn {
  width: 20px;
  height: 20px;
  align-self: center;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
  flex-shrink: 0;
  opacity: 0.6;
}

.remove-quote-btn:hover {
  background: var(--ui-state-hover-bg, var(--bg-hover));
  color: var(--ui-text-primary-fg, var(--text-primary));
  opacity: 1;
}
</style>
