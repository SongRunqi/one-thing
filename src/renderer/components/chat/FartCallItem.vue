<template>
  <div :class="['arcade-cabinet', `status-${toolCall.status}`]">
    <!-- Marquee (arcade cabinet top) -->
    <div class="marquee">
      <span class="marquee-stars">★</span>
      <span class="marquee-title">{{ marqueeTitle }}</span>
      <span class="marquee-stars">★</span>
    </div>

    <!-- CRT screen -->
    <div class="crt">
      <div class="crt-inner">
        <!-- Status bar: only the play/ready state, no frame counter clutter -->
        <div class="hud">
          <span class="hud-label">1P</span>
          <span class="spacer" />
          <span class="hud-label">{{ isPlaying ? 'PLAY' : statusHud }}</span>
        </div>

        <!-- Speech bubble (typewriter) — positioned above the sprite stage -->
        <Transition name="bubble">
          <div
            v-if="bubbleVisible && spokenText"
            class="bubble"
          >
            <span class="bubble-text">{{ typedText }}<span
              v-if="typing"
              class="caret"
            >▍</span></span>
            <span class="bubble-tail" />
          </div>
        </Transition>

        <!-- Sprite stage — Stage 1: static pixel cat (Canvas, 4× scale) -->
        <div class="stage">
          <PixelSprite
            :frame="CAT_IDLE_FRAME_1"
            :scale="4"
          />
        </div>

        <!-- Scanlines + vignette overlay -->
        <div class="scanlines" />
        <div class="vignette" />
      </div>
    </div>

    <!-- Control panel (arcade buttons) -->
    <div class="controls">
      <button
        class="arcade-btn btn-start"
        :title="isPlaying ? 'Playing…' : 'START / Replay'"
        :disabled="isPlaying || frames.length === 0"
        @click="play"
      >
        <span class="btn-label">START</span>
      </button>
      <button
        class="arcade-btn btn-sound"
        :title="muted ? 'Sound OFF' : 'Sound ON'"
        @click="muted = !muted"
      >
        <span class="btn-label">{{ muted ? 'SND OFF' : 'SND ON' }}</span>
      </button>
      <div class="credits">
        CREDIT {{ playCount.toString().padStart(2, '0') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { ToolCall } from '@/types'
import PixelSprite from './PixelSprite.vue'
import { CAT_IDLE_FRAME_1 } from '@/composables/pixelPet/sprites'

interface Props {
  toolCall: ToolCall
}

const props = defineProps<Props>()

interface Frame {
  label: string
  art: string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const frames = ref<Frame[]>([])
const frameIndex = ref(0)
const isPlaying = ref(false)
const muted = ref(true)
const playCount = ref(0)

// Typewriter state for the speech bubble.
const typedText = ref('')
const typing = ref(false)
const bubbleVisible = ref(false)

let playTimer: ReturnType<typeof setTimeout> | null = null
let typeTimer: ReturnType<typeof setTimeout> | null = null
let bubbleHideTimer: ReturnType<typeof setTimeout> | null = null
let audioCtx: AudioContext | null = null

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseFrames(output: unknown): Frame[] {
  if (typeof output !== 'string') return []
  const re = /--- frame \d+\/\d+\s+"([^"]*)"\s*---\n([\s\S]*?)(?=\n--- frame |\n```|$)/g
  const out: Frame[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(output)) !== null) {
    out.push({
      label: match[1],
      art: match[2].replace(/```\s*$/, '').trimEnd(),
    })
  }
  return out
}

function extractResult(): { output: string | undefined; metadata: Record<string, unknown> | undefined } {
  const r = props.toolCall.result as unknown
  if (r && typeof r === 'object') {
    const obj = r as { output?: unknown; metadata?: unknown }
    const output = typeof obj.output === 'string' ? obj.output : undefined
    const metadata = obj.metadata && typeof obj.metadata === 'object'
      ? (obj.metadata as Record<string, unknown>)
      : undefined
    return { output, metadata }
  }
  return { output: undefined, metadata: undefined }
}

// ---------------------------------------------------------------------------
// Derived state — declared BEFORE the immediate watch below, since play()
// (called synchronously by the watch) reads spokenText.value.
// ---------------------------------------------------------------------------

const currentArt = computed(() => {
  if (frames.value.length === 0) {
    const { metadata } = extractResult()
    const live = metadata?.currentFrame
    return typeof live === 'string' ? live : ''
  }
  return frames.value[frameIndex.value]?.art ?? ''
})

const spokenText = computed(() => {
  const args = props.toolCall.arguments as Record<string, unknown> | undefined
  const t = args?.text
  return typeof t === 'string' && t.trim() ? t.trim() : ''
})

const marqueeTitle = computed(() => {
  const args = (props.toolCall.arguments || {}) as Record<string, unknown>
  const action = typeof args.action === 'string' ? args.action : 'fart'
  return `CAT :: ${action.toUpperCase()}`
})

const statusHud = computed(() => {
  switch (props.toolCall.status) {
    case 'executing':
    case 'input-streaming':
      return 'WARMUP'
    case 'failed':
      return 'ERROR'
    case 'cancelled':
      return 'ABORT'
    case 'completed':
      return 'READY'
    default:
      return '...'
  }
})

watch(
  () => props.toolCall.result,
  () => {
    const { output } = extractResult()
    const parsed = parseFrames(output)
    if (parsed.length > 0) {
      frames.value = parsed
      play()
    }
  },
  { immediate: true, deep: true },
)

onMounted(() => {
  if (frames.value.length === 0) {
    const { output } = extractResult()
    frames.value = parseFrames(output)
  }
})

onUnmounted(() => {
  stopPlayback()
  stopTypewriter()
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  if (audioCtx) {
    audioCtx.close().catch(() => { /* ignore */ })
    audioCtx = null
  }
})

// ---------------------------------------------------------------------------
// Playback — sprite animation + typewriter bubble run in parallel
// ---------------------------------------------------------------------------

function stopPlayback() {
  if (playTimer) {
    clearTimeout(playTimer)
    playTimer = null
  }
  isPlaying.value = false
}

function stopTypewriter() {
  if (typeTimer) {
    clearTimeout(typeTimer)
    typeTimer = null
  }
  typing.value = false
}

function play() {
  if (frames.value.length === 0) return
  stopPlayback()
  stopTypewriter()
  if (bubbleHideTimer) {
    clearTimeout(bubbleHideTimer)
    bubbleHideTimer = null
  }
  frameIndex.value = 0
  isPlaying.value = true
  playCount.value += 1
  maybePlayAudio()

  // Kick off the sprite animation
  tick()

  // Kick off the typewriter bubble (starts slightly after first frame)
  if (spokenText.value) {
    typedText.value = ''
    bubbleVisible.value = true
    setTimeout(() => startTypewriter(spokenText.value), 120)
  } else {
    bubbleVisible.value = false
  }
}

function tick() {
  const perFrameMs = Math.max(120, Math.round(1200 / Math.max(1, frames.value.length)))
  if (frameIndex.value >= frames.value.length - 1) {
    isPlaying.value = false
    return
  }
  playTimer = setTimeout(() => {
    frameIndex.value++
    tick()
  }, perFrameMs)
}

function startTypewriter(text: string) {
  const perCharMs = 55
  let i = 0
  typing.value = true
  typedText.value = ''
  const step = () => {
    if (i >= text.length) {
      typing.value = false
      typeTimer = null
      // Let the finished bubble linger, then fade.
      bubbleHideTimer = setTimeout(() => { bubbleVisible.value = false }, 1800)
      return
    }
    typedText.value += text.charAt(i)
    i++
    typeTimer = setTimeout(step, perCharMs)
  }
  step()
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

function maybePlayAudio() {
  if (muted.value) return
  try {
    if (!audioCtx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      if (!Ctor) return
      audioCtx = new Ctor()
    }
    const ctx = audioCtx
    const duration = 0.7
    const sampleRate = ctx.sampleRate
    const bufferSize = Math.floor(duration * sampleRate)
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
    const data = buffer.getChannelData(0)
    let lastSample = 0
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize
      const noise = Math.random() * 2 - 1
      lastSample = 0.98 * lastSample + 0.02 * noise
      const env = Math.pow(1 - t, 1.8) * (t < 0.05 ? t / 0.05 : 1)
      data[i] = lastSample * env * 0.7
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(400, ctx.currentTime)
    lp.frequency.linearRampToValueAtTime(140, ctx.currentTime + duration)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.55, ctx.currentTime)
    src.connect(lp).connect(gain).connect(ctx.destination)
    src.start()
    src.stop(ctx.currentTime + duration + 0.05)
  } catch (err) {
    console.warn('[FartCallItem] Audio synthesis failed:', err)
  }
}

</script>

<style scoped>
/* =========================================================================
   Arcade cabinet — dark bezel, neon CRT screen, scanlines, retro controls
   ========================================================================= */

.arcade-cabinet {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0;
  padding: 10px;
  background:
    linear-gradient(
      180deg,
      var(--ui-surface-floating-bg, #18181b) 0%,
      var(--ui-surface-app-bg, #0c0c0e) 100%
    );
  border: 1px solid var(--ui-border-strong-border, #3f3f46);
  border-radius: 8px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 4px 16px rgba(0, 0, 0, 0.45);
  font-family: 'Press Start 2P', 'VT323', 'SF Mono', Monaco, 'Cascadia Code', monospace;
  color: var(--ui-status-success-fg, #00ff88);
}

.arcade-cabinet.status-failed {
  border-color: var(--ui-status-danger-border, #7f1d1d);
}

/* ── Marquee ── */
.marquee {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 6px 10px;
  background:
    linear-gradient(180deg, var(--ui-accent-primary-fg, #db2777) 0%, var(--ui-accent-subtle-fg, #7e22ce) 100%);
  border-radius: 4px;
  color: var(--ui-text-inverse-fg, #fff);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.6);
  box-shadow:
    inset 0 -1px 0 rgba(0, 0, 0, 0.35),
    0 0 12px rgba(219, 39, 119, 0.35);
}

.marquee-stars {
  font-size: 12px;
  animation: twinkle 1.2s ease-in-out infinite alternate;
}

@keyframes twinkle {
  0%   { opacity: 0.4; transform: scale(0.9); }
  100% { opacity: 1;   transform: scale(1.1); }
}

.marquee-title {
  white-space: nowrap;
}

/* ── CRT screen ── */
.crt {
  position: relative;
  padding: 6px;
  background: var(--ui-surface-app-bg, #000);
  border-radius: 10px;
  border: 2px solid var(--ui-border-strong-border, #27272a);
  box-shadow:
    inset 0 0 20px rgba(0, 255, 136, 0.15),
    inset 0 0 60px rgba(0, 0, 0, 0.8);
}

.crt-inner {
  position: relative;
  min-height: 180px;
  padding: 14px 16px 18px;
  border-radius: 8px;
  background:
    radial-gradient(
      ellipse at center,
      var(--ui-surface-code-block-bg, #0b1b13) 0%,
      var(--ui-surface-app-bg, #000) 80%
    );
  overflow: hidden;
}

/* HUD bar: 1P / frame counter / status */
.hud {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--ui-status-success-fg, #a3e635);
  margin-bottom: 8px;
  text-shadow: 0 0 6px rgba(163, 230, 53, 0.5);
}

.hud-label {
  color: var(--ui-status-warning-fg, #facc15);
  text-shadow: 0 0 6px rgba(250, 204, 21, 0.5);
}

.hud-value {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--ui-text-inverse-fg, #fff);
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
}

.spacer { flex: 1; }

/* ── Sprite stage ── */
/* Stage holds the pixel sprite, centered in the CRT screen */
.stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  padding: 4px 0;
}

/* Subtle green-glow tint on the sprite to match the CRT aesthetic.
   Pure pixel art, no blur — drop-shadow stays at 0 spread for sharpness. */
.stage :deep(.pixel-sprite) {
  filter: drop-shadow(0 0 4px rgba(0, 255, 136, 0.18));
}

/* ── Speech bubble (pixel-style, typewriter) ── */
.bubble {
  position: relative;
  align-self: flex-start;
  max-width: 80%;
  margin: 0 auto 8px;
  padding: 8px 12px;
  background: var(--ui-surface-floating-bg, #fff);
  color: var(--ui-text-primary-fg, #111);
  border: 2px solid var(--ui-border-strong-border, #000);
  border-radius: 6px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.45;
  box-shadow:
    2px 2px 0 var(--ui-border-strong-border, #000),
    4px 4px 0 rgba(0, 0, 0, 0.2);
  text-shadow: none;
}

.bubble-text {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Pixel-looking tail pointing down */
.bubble-tail {
  position: absolute;
  bottom: -10px;
  left: 20px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 10px solid var(--ui-surface-floating-bg, #fff);
  filter: drop-shadow(0 2px 0 var(--ui-border-strong-border, #000));
}

.bubble-tail::after {
  content: '';
  position: absolute;
  top: -12px;
  left: -8px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 10px solid var(--ui-border-strong-border, #000);
  z-index: -1;
}

.caret {
  display: inline-block;
  color: var(--ui-accent-primary-fg, #db2777);
  animation: caret-blink 0.6s steps(2, end) infinite;
  margin-left: 1px;
}

@keyframes caret-blink {
  50% { opacity: 0; }
}

/* Bubble entrance */
.bubble-enter-active {
  transition: opacity 0.18s ease-out, transform 0.22s cubic-bezier(0.32, 1.4, 0.3, 1);
}
.bubble-leave-active {
  transition: opacity 0.18s ease-in, transform 0.18s ease-in;
}
.bubble-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.92);
}
.bubble-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.96);
}

/* ── Scanlines overlay ── */
.scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0px,
    rgba(0, 0, 0, 0) 2px,
    rgba(0, 0, 0, 0.22) 2px,
    rgba(0, 0, 0, 0.22) 3px
  );
  mix-blend-mode: multiply;
}

.vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    transparent 55%,
    rgba(0, 0, 0, 0.55) 100%
  );
}

/* ── Control panel ── */
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px 0;
}

.arcade-btn {
  position: relative;
  min-width: 70px;
  height: 30px;
  padding: 0 10px;
  border: 2px solid var(--ui-border-strong-border, #0f172a);
  border-radius: 14px;
  background:
    linear-gradient(180deg, var(--ui-status-danger-fg, #ef4444) 0%, var(--ui-status-danger-fg, #b91c1c) 100%);
  color: var(--ui-text-inverse-fg, #fff);
  font-family: inherit;
  font-size: 9px;
  letter-spacing: 1.5px;
  font-weight: 700;
  cursor: pointer;
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.25),
    inset 0 -2px 0 rgba(0, 0, 0, 0.3),
    0 2px 0 var(--ui-border-strong-border, #0f172a);
  transition: transform 0.06s ease, box-shadow 0.06s ease;
}

.arcade-btn:active {
  transform: translateY(2px);
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.2),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3),
    0 0 0 var(--ui-border-strong-border, #0f172a);
}

.arcade-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.btn-start {
  background: linear-gradient(180deg, var(--ui-status-success-fg, #22c55e) 0%, var(--ui-status-success-fg, #15803d) 100%);
}

.btn-sound {
  background: linear-gradient(180deg, var(--ui-accent-primary-fg, var(--accent)) 0%, var(--ui-accent-primary-fg, var(--accent)) 100%);
}

.btn-label {
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
}

.credits {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid var(--ui-border-strong-border, #3f3f46);
  border-radius: 4px;
  background: var(--ui-surface-app-bg, #000);
  color: var(--ui-status-warning-fg, #facc15);
  font-size: 9px;
  letter-spacing: 2px;
  font-family: inherit;
  text-shadow: 0 0 6px rgba(250, 204, 21, 0.55);
}

/* ── Status tints ── */
.arcade-cabinet.status-failed .stage {
  color: var(--ui-status-danger-fg, #ef4444);
  text-shadow:
    0 0 8px rgba(239, 68, 68, 0.6),
    0 0 16px rgba(239, 68, 68, 0.35);
}
</style>
