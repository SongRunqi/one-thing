<template>
  <Transition name="voice-call-fade">
    <div
      v-if="voice.callActive"
      class="voice-call-screen"
      :class="`is-${voice.status}`"
    >
      <header class="call-header">
        <span class="call-header-label">Voice call</span>
        <span class="call-header-elapsed">{{ formattedElapsed }}</span>
      </header>

      <main class="call-stage">
        <div
          class="call-orb"
          aria-hidden="true"
        >
          <span class="orb-ring ring-outer" />
          <span class="orb-ring ring-middle" />
          <span class="orb-ring ring-dashed" />
          <span class="orb-core" />
        </div>

        <p class="call-status">
          {{ statusLabel }}
        </p>
        <p class="call-transcript">
          {{ transcriptLine }}
        </p>
      </main>

      <footer class="call-footer">
        <Button
          unstyled
          class="call-hangup"
          native-type="button"
          title="Hang up (Esc)"
          @click="hangUp"
        >
          <PhoneOff :size="22" />
        </Button>
        <span class="call-hangup-hint">Hang up</span>
      </footer>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { PhoneOff } from 'lucide-vue-next'
import { useVoiceStore } from '@/stores/voice'

const voice = useVoiceStore()

const elapsedMs = ref(0)
let elapsedTimer: number | null = null

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    hangUp()
  }
}

watch(() => voice.callActive, active => {
  if (active) {
    const startedAt = Date.now()
    elapsedMs.value = 0
    elapsedTimer = window.setInterval(() => {
      elapsedMs.value = Date.now() - startedAt
    }, 1000)
    window.addEventListener('keydown', handleKeydown)
  } else {
    if (elapsedTimer !== null) {
      window.clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    window.removeEventListener('keydown', handleKeydown)
  }
}, { immediate: true })

onUnmounted(() => {
  if (elapsedTimer !== null) window.clearInterval(elapsedTimer)
  window.removeEventListener('keydown', handleKeydown)
})

const formattedElapsed = computed(() => {
  const totalSeconds = Math.floor(elapsedMs.value / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
})

const statusLabel = computed(() => {
  switch (voice.status) {
    case 'recording': return 'Listening'
    case 'transcribing': return 'Transcribing'
    case 'thinking': return 'Thinking'
    case 'speaking': return 'Speaking'
    default: return 'Connected'
  }
})

const transcriptLine = computed(() => {
  if (voice.lastTranscript) return voice.lastTranscript
  if (voice.status === 'recording') return 'Say something...'
  return ' '
})

function hangUp() {
  void voice.endCall()
}
</script>

<style scoped>
.voice-call-screen {
  position: fixed;
  inset: 0;
  /* 通话全屏面板压在悬浮胶囊(--z-overlay)之上,同属 overlay 档。 */
  z-index: calc(var(--z-overlay) + 10);
  display: flex;
  flex-direction: column;
  background: var(--ui-surface-app-bg, var(--bg-primary));
  color: var(--ui-text-primary-fg);
}

/* ---- header: single hairline rule, ledger caption ---- */
.call-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: calc(env(safe-area-inset-top, 0px) + 18px) 24px 12px;
  border-bottom: 1px solid var(--ui-border-default-border);
  -webkit-app-region: drag;
}

.call-header-label {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg);
}

.call-header-elapsed {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted-fg);
}

/* ---- stage: ink orb + status + live subtitle ---- */
.call-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 24px;
  min-height: 0;
}

.call-orb {
  position: relative;
  width: 168px;
  height: 168px;
}

.orb-ring,
.orb-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
}

.orb-ring {
  border: 1px solid var(--ui-border-default-border);
}

.ring-outer {
  width: 168px;
  height: 168px;
}

.ring-middle {
  width: 128px;
  height: 128px;
}

.ring-dashed {
  width: 96px;
  height: 96px;
  border-style: dashed;
}

.orb-core {
  width: 14px;
  height: 14px;
  background: var(--ui-text-muted-fg);
}

/* listening: core beats in danger ink, rings ripple outward */
.is-recording .orb-core {
  background: var(--ui-status-danger-fg);
  animation: orb-beat 1.6s ease-in-out infinite;
}

.is-recording .ring-outer,
.is-recording .ring-middle {
  border-color: var(--ui-status-danger-border, var(--ui-border-default-border));
  animation: orb-ripple 1.6s ease-out infinite;
}

.is-recording .ring-middle {
  animation-delay: 0.35s;
}

/* thinking / transcribing: dashed ring slowly rotates */
.is-thinking .ring-dashed,
.is-transcribing .ring-dashed {
  border-color: var(--ui-text-muted-fg);
  animation: orb-rotate 5s linear infinite;
}

/* speaking: accent core with breathing rings */
.is-speaking .orb-core {
  background: var(--ui-accent-primary-fg);
  animation: orb-beat 1.1s ease-in-out infinite;
}

.is-speaking .ring-outer,
.is-speaking .ring-middle {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg) 45%, var(--ui-border-default-border));
  animation: orb-ripple 1.1s ease-out infinite;
}

.is-speaking .ring-middle {
  animation-delay: 0.25s;
}

@keyframes orb-beat {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.35); }
}

@keyframes orb-ripple {
  0% { transform: translate(-50%, -50%) scale(0.86); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.06); opacity: 0.25; }
}

@keyframes orb-rotate {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

.call-status {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg);
}

.call-transcript {
  margin: 0;
  max-width: min(560px, 82vw);
  min-height: 2.7em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: center;
  font-size: 13px;
  line-height: 1.35;
  color: var(--ui-text-muted-fg);
}

/* ---- footer: hairline rule + round ink hang-up ---- */
.call-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 24px calc(env(safe-area-inset-bottom, 0px) + 30px);
  border-top: 1px solid var(--ui-border-default-border);
}

.call-hangup {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border: 1px solid var(--ui-status-danger-fg);
  border-radius: 50%;
  background: transparent;
  color: var(--ui-status-danger-fg);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.call-hangup:hover {
  background: var(--ui-status-danger-bg, transparent);
  transform: scale(1.04);
}

.call-hangup:active {
  transform: scale(0.97);
}

.call-hangup-hint {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg);
}

.voice-call-fade-enter-active,
.voice-call-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.voice-call-fade-enter-from,
.voice-call-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
