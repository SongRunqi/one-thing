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
          v-if="showTranscript"
          class="voice-transcript"
        >{{ voice.lastTranscript }}</span>
        <span
          v-else-if="voice.lastError"
          class="voice-error"
        >{{ voice.lastError }}</span>
      </div>
      <Tooltip
        :text="overlayActionTitle"
        position="left"
      >
        <Button
          unstyled
          class="voice-stop"
          native-type="button"
          :aria-label="overlayActionTitle"
          @click="handleOverlayAction"
        >
          <X
            v-if="voice.lastError || isCapturing"
            :size="14"
          />
          <Volume2
            v-else
            :size="14"
          />
        </Button>
      </Tooltip>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import { computed } from 'vue'
import { Volume2, X } from 'lucide-vue-next'
import { useVoiceStore } from '@/stores/voice'

const voice = useVoiceStore()

const overlayStatus = computed(() => (voice.lastError ? 'error' : voice.status))
const shouldShowOverlay = computed(() => {
  if (!voice.isEnabled) return false
  // The call panel owns the UI during a call, and the composer's capture
  // bar owns listening/transcribing — no floating pill for those.
  if (voice.callActive) return false
  if (voice.lastError) return true
  return voice.status === 'speaking'
})

const isCapturing = computed(() => voice.status === 'recording' || voice.status === 'transcribing')

// Live subtitles belong to the listening phase; while the reply is being
// spoken the overlay stays a minimal status pill instead of popping text.
const showTranscript = computed(() => Boolean(voice.lastTranscript) && isCapturing.value)

const overlayActionTitle = computed(() => {
  if (voice.lastError) return 'Dismiss'
  if (isCapturing.value) return 'Cancel — discard this recording'
  return 'Stop voice playback'
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
  z-index: var(--z-overlay);
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 10px;
  width: min(360px, calc(100vw - 36px));
  padding: 10px 10px 10px 12px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  background: var(--ui-surface-app-bg, var(--bg-primary));
  box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.24));
  color: var(--ui-text-primary-fg);
}

.voice-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ui-text-muted-fg);
}

.is-recording .voice-dot,
.is-transcribing .voice-dot {
  background: var(--ui-status-danger-fg);
  box-shadow: 0 0 0 4px var(--ui-status-danger-bg, transparent);
}

.is-speaking .voice-dot {
  background: var(--ui-accent-primary-fg);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-accent-primary-fg) 18%, transparent);
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
  color: var(--ui-text-muted-fg);
}

.voice-error {
  color: var(--ui-status-danger-fg);
}

.voice-stop {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 6px;
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
  cursor: pointer;
}

.voice-pop-enter-active,
.voice-pop-leave-active {
  transition: opacity var(--duration-normal) var(--ease-default), transform var(--duration-normal) var(--ease-default);
}

.voice-pop-enter-from,
.voice-pop-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
