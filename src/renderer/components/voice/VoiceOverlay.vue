<template>
  <Transition name="voice-pop">
    <div
      v-if="shouldShowOverlay"
      class="voice-overlay"
      :class="`is-${overlayStatus}`"
    >
      <div class="voice-dot" />
      <div class="voice-copy">
        <span class="voice-status">{{ statusLabel }}</span>
        <span
          v-if="voice.lastTranscript"
          class="voice-transcript"
        >{{ voice.lastTranscript }}</span>
        <span
          v-else-if="voice.lastError"
          class="voice-error"
        >{{ voice.lastError }}</span>
      </div>
      <Button
        unstyled
        class="voice-stop"
        native-type="button"
        :title="voice.lastError ? 'Dismiss' : 'Stop voice playback'"
        @click="handleOverlayAction"
      >
        <X
          v-if="voice.lastError"
          :size="14"
        />
        <Volume2
          v-else
          :size="14"
        />
      </Button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed } from 'vue'
import { Volume2, X } from 'lucide-vue-next'
import { useVoiceStore } from '@/stores/voice'

const voice = useVoiceStore()

const overlayStatus = computed(() => (voice.lastError ? 'error' : voice.status))
const shouldShowOverlay = computed(() => {
  if (!voice.isEnabled) return false
  if (voice.lastError) return true
  return voice.status === 'speaking'
})

const statusLabel = computed(() => {
  switch (overlayStatus.value) {
    case 'wake-listening': return 'Waiting for wake phrase'
    case 'recording': return 'Recording'
    case 'transcribing': return 'Transcribing'
    case 'thinking': return 'Thinking'
    case 'speaking': return 'Speaking'
    case 'error': return 'Voice needs attention'
    default: return 'Voice ready'
  }
})

function handleOverlayAction() {
  if (voice.lastError) {
    voice.dismissError()
    return
  }
  void voice.stop('overlay')
}
</script>

<style scoped>
.voice-overlay {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 900;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 10px;
  width: min(360px, calc(100vw - 36px));
  padding: 10px 10px 10px 12px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-app-bg, var(--bg-primary, var(--bg)));
  box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.24));
  color: var(--ui-text-primary-fg, var(--text));
}

.voice-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ui-text-muted-fg, var(--muted));
}

.is-recording .voice-dot,
.is-transcribing .voice-dot {
  background: var(--ui-status-danger-fg, #ef4444);
  box-shadow: 0 0 0 4px var(--ui-status-danger-bg, transparent);
}

.is-speaking .voice-dot {
  background: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 18%, transparent);
}

.voice-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.voice-status {
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}

.voice-transcript,
.voice-error {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.3;
  color: var(--ui-text-muted-fg, var(--muted));
}

.voice-error {
  color: var(--ui-status-danger-fg, var(--danger, #ef4444));
}

.voice-stop {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
}

.voice-pop-enter-active,
.voice-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.voice-pop-enter-from,
.voice-pop-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
