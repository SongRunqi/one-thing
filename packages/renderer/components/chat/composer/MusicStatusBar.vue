<template>
  <Transition name="music-bar">
    <div
      v-if="visible"
      ref="barEl"
      class="music-bar"
      :class="{ 'is-quiet': standby || idle }"
      :data-status="nowPlaying?.status"
      role="group"
      aria-label="music player"
      @click="onBarClick"
    >
      <span
        class="music-frame-label"
        aria-hidden="true"
      >{{ (playing ? 'NOW PLAYING' : 'RADIO') + (pinned ? ' · 已固定' : '') }}</span>

      <!-- Login gone: nothing below can work (every play silently fails), so
           the bar says so instead of presenting healthy-looking controls. -->
      <template v-if="loginMissing">
        <span class="music-title"><span class="music-mark">⚠</span>{{ flash || '网易云未登录 · 电台无法播放' }}</span>
        <span class="music-actions">
          <button
            type="button"
            class="music-btn"
            title="打开设置 → 音乐,重新登录"
            @mousedown.prevent
            @click="openMusicSettings"
          >去登录</button>
        </span>
      </template>

      <!-- The host's spoken patter IS the station broadcasting: while the TTS
           line plays into the gap before a song, the bar shows the line as a
           caption instead of claiming the radio stopped. Long lines scroll
           like a radio ticker, paced to the voice (same chars/sec model the
           talk-over timing uses), so the whole sentence is readable. -->
      <template v-else-if="speaking">
        <span
          class="music-title music-patter"
          :title="musicStore.djPatter"
        ><span class="music-mark">◈</span><span class="music-patter-viewport"><span
          v-if="!flash"
          :key="musicStore.djPatter"
          class="music-patter-text"
          :style="{ animationDuration: `${patterScrollSeconds}s` }"
        >{{ musicStore.djPatter }}</span><template v-else>{{ flash }}</template></span></span>

        <span class="music-actions">
          <button
            type="button"
            class="music-btn"
            title="跳过口播,直接放歌"
            @mousedown.prevent
            @click="skipPatter"
          >⏭</button>
          <button
            type="button"
            class="music-btn"
            title="停止电台:切断口播与音乐,DJ 不再续排"
            :disabled="busy"
            @mousedown.prevent
            @click="stopRadio"
          >■</button>
        </span>
      </template>

      <!-- A deliberate transition gap: patter being synthesized, play
           spawning, verify pending. Named song when main knows it. -->
      <template v-else-if="transitioning">
        <span
          class="music-title"
          :title="musicStore.radio.starting"
        ><span class="music-mark">◈</span>换歌中{{ musicStore.radio.starting ? ` · ${musicStore.radio.starting}` : '…' }}</span>
      </template>

      <!-- 意图输入:开电台/新电台点开后的内联一行。 -->
      <template v-else-if="composingIntent">
        <input
          ref="intentInputEl"
          v-model="intentDraft"
          class="music-intent-input"
          type="text"
          spellcheck="false"
          placeholder="想听什么?一句话——留空让 DJ 看着办"
          @keydown.enter.prevent="submitIntent"
          @keydown.esc.prevent="composingIntent = false"
        >
        <span class="music-actions">
          <button
            type="button"
            class="music-btn"
            title="开台"
            :disabled="busy"
            @mousedown.prevent
            @click="submitIntent"
          >开台</button>
          <button
            type="button"
            class="music-btn"
            title="取消"
            @mousedown.prevent
            @click="composingIntent = false"
          >✕</button>
        </span>
      </template>

      <!-- 待命:无声但有节目单/onDeck——恢复,或换个方向重来。 -->
      <template v-else-if="standby">
        <span
          class="music-title"
          :title="radioIntent"
        ><span class="music-mark">◦</span>{{ flash || `电台待命 · 剩 ${musicStore.radio.programmeLength} 首` }}</span>

        <span class="music-actions">
          <button
            type="button"
            class="music-btn"
            title="从节目单继续播放"
            :disabled="busy"
            @mousedown.prevent
            @click="run('radio-resume')"
          >▶ 恢复</button>
          <button
            type="button"
            class="music-btn"
            title="换个方向,重新编排"
            :disabled="busy"
            @mousedown.prevent
            @click="startComposingIntent(true)"
          >⟳ 新电台</button>
        </span>
      </template>

      <!-- 空闲:什么都没有——这里就是开电台的入口。 -->
      <template v-else-if="idle">
        <span class="music-title"><span class="music-mark">◦</span>{{ flash || '电台' }}</span>

        <span class="music-actions">
          <button
            type="button"
            class="music-btn"
            title="开一台私人电台"
            :disabled="busy"
            @mousedown.prevent
            @click="startComposingIntent(false)"
          >+ 开电台</button>
        </span>
      </template>

      <template v-else>
        <span
          class="music-title"
          :title="nowPlaying?.title"
        ><span class="music-mark">{{ nowPlaying?.status === 'paused' ? '‖' : '▸' }}</span>{{ flash || nowPlaying?.title || '未知曲目' }}</span>

        <span
          class="music-track"
          :class="{ seekable: canSeek }"
          role="progressbar"
          :aria-valuenow="Math.round(progressRatio * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :title="canSeek ? '点击跳转' : undefined"
          @mousedown.prevent
          @click="onSeek"
        ><i class="music-track-line" /><i
          class="music-track-fill"
          :style="{ transform: `scaleX(${progressRatio})` }"
        /></span>

        <span class="music-time">{{ timeLabel }}</span>

        <span class="music-actions">
          <button
            type="button"
            class="music-btn"
            title="红心这首歌(写入你的网易云账号)"
            :disabled="busy"
            @mousedown.prevent
            @click="like"
          >♥</button>
          <button
            type="button"
            class="music-btn"
            title="上一首"
            :disabled="busy"
            @mousedown.prevent
            @click="run('prev')"
          >⏮</button>
          <button
            type="button"
            class="music-btn"
            :title="isPaused ? '继续' : '暂停'"
            :disabled="busy"
            @mousedown.prevent
            @click="toggle"
          >{{ isPaused ? '▶' : '‖' }}</button>
          <button
            type="button"
            class="music-btn"
            title="下一首"
            :disabled="busy"
            @mousedown.prevent
            @click="run('next')"
          >⏭</button>
          <button
            v-if="musicStore.radio.active"
            type="button"
            class="music-btn"
            title="换台:说个新方向,DJ 重新编排;新歌备好后自动切过去"
            :disabled="busy"
            @mousedown.prevent
            @click="startComposingIntent(true)"
          >⟳</button>
          <button
            v-if="musicStore.radio.active"
            type="button"
            class="music-btn"
            title="停止电台:停下音乐,DJ 不再续排(节目单保留)"
            :disabled="busy"
            @mousedown.prevent
            @click="stopRadio"
          >■</button>
        </span>

        <span
          v-if="volume !== undefined"
          class="music-vol"
          title="音量"
        >
          <button
            type="button"
            class="music-btn music-vol-btn"
            :disabled="busy || volume <= 0"
            @mousedown.prevent
            @click="stepVolume(-VOLUME_STEP)"
          >−</button>
          <span class="music-vol-value">{{ volume }}</span>
          <button
            type="button"
            class="music-btn music-vol-btn"
            :disabled="busy || volume >= 100"
            @mousedown.prevent
            @click="stepVolume(VOLUME_STEP)"
          >+</button>
        </span>

        <button
          type="button"
          class="music-mode"
          :title="modeTitle"
          :disabled="busy"
          @mousedown.prevent
          @click="toggleBackend"
        >
          {{ backendLabel }}
        </button>

        <span
          v-if="upNext"
          class="music-next"
          :title="upNext"
        >↳ 接下来 · {{ upNext }}</span>
      </template>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * The composer's music bar.
 *
 * A flyout on `.composer-anchor`, not a dock row: it is absolutely positioned
 * above the composer's top edge and never contributes height, so an idle chat
 * looks exactly as it did before music existed.
 *
 * It steers the song that is already playing — it never picks one. Choosing is
 * the model's job (ncm-cli through bash), and the bar deliberately never touches
 * the queue, so when the user and the model both act, the model's next
 * `queue add` simply wins.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { platformApi } from '@/platform'
import { useMusicStore } from '@/stores/music'
import { useSettingsStore } from '@/stores/settings'
import type { MusicCommand } from '@/types'

const props = defineProps<{
  /** The composer's NOW PLAYING/RADIO tag is hovered or focused. */
  expanded: boolean
}>()

// Read through the store rather than storeToRefs: every InputBox test fakes its
// stores with plain objects and no pinia instance, and storeToRefs needs a real
// one. Not worth making the composer untestable over.
const musicStore = useMusicStore()
const settingsStore = useSettingsStore()
const nowPlaying = computed(() => musicStore.nowPlaying)
const livePosition = computed(() => musicStore.livePosition)
const progressRatio = computed(() => musicStore.progressRatio)

const busy = ref(false)
/** Keeps the bar up while the pointer is on it, so it cannot vanish mid-click. */
const held = ref(false)
/** A one-shot error line shown in place of the title — a button must never fail silently. */
const flash = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null
function showFlash(message: string) {
  flash.value = message
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = ''), 4_000)
}

const playing = computed(() => {
  const current = nowPlaying.value
  return !!current && current.status !== 'stopped'
})

/**
 * The NetEase login is gone: every play exits 0 with no sound, so the bar
 * leads with the one actionable fact instead of healthy-looking controls.
 * `loggedIn` is probed at boot and re-probed when a start-failure diagnosis
 * finds the login expired.
 */
const loginMissing = computed(() => !musicStore.state.loggedIn)

function openMusicSettings() {
  void platformApi.openSettingsWindow({ tab: 'music' })
}

/**
 * The radio is on and curated, but nothing is coming out of the speakers —
 * the one state where a "resume" belongs. It goes through the keepalive
 * restart flow in main, not a bare cold start.
 */
/**
 * The station is on air through the host's voice: the patter TTS is playing
 * while the song player is silent (speak-before-play, or the gap of a skip).
 * Field feedback: showing 电台停了 here reads as a breakdown — the DJ talking
 * is the radio working exactly as designed.
 */
const speaking = computed(
  () => !playing.value && musicStore.radio.active && !!musicStore.djPatter,
)

/**
 * A deliberate transition spends seconds silent (patter synthesis, play
 * spawn, verify), so an ACTIVE station's silence has two layers: main's
 * in-flight signal (radio.starting) is authoritative; otherwise a short
 * grace absorbs push/poll latency around song boundaries. Silence that
 * outlives the grace is a real standby, not a transition.
 */
const STALL_CONFIRM_MS = 2_500

const hasContent = computed(() => musicStore.radio.canResume)

const activeSilence = computed(
  () =>
    !playing.value &&
    !speaking.value &&
    musicStore.radio.active &&
    hasContent.value,
)

const stallConfirmed = ref(false)
let stallTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => activeSilence.value && !musicStore.radio.starting,
  candidate => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = null
    if (!candidate) {
      stallConfirmed.value = false
      return
    }
    stallTimer = setTimeout(() => {
      stallConfirmed.value = true
    }, STALL_CONFIRM_MS)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (stallTimer) clearTimeout(stallTimer)
})

const transitioning = computed(() => activeSilence.value && !stallConfirmed.value)

/** No sound, songs waiting (station open or previously closed): offer resume. */
const standby = computed(
  () =>
    !playing.value && !speaking.value && !transitioning.value && hasContent.value,
)

/** Nothing at all — the bar IS the launcher. */
const idle = computed(
  () =>
    !playing.value && !speaking.value && !transitioning.value && !hasContent.value,
)

// --- 开电台/新电台 inline intent composer -----------------------------------
const composingIntent = ref(false)
const intentDraft = ref('')
const intentInputEl = ref<HTMLInputElement | null>(null)
/** 新电台 discards the old programme (retune); 开电台 keeps whatever exists. */
let composeClearsProgramme = false

function startComposingIntent(clearProgramme: boolean) {
  composeClearsProgramme = clearProgramme
  intentDraft.value = ''
  composingIntent.value = true
  void nextTick(() => intentInputEl.value?.focus())
}

async function submitIntent() {
  const intent = intentDraft.value.trim()
  composingIntent.value = false
  busy.value = true
  try {
    const response = await musicStore.openRadio(intent, composeClearsProgramme)
    if (!response.success && response.error) showFlash(response.error)
  } finally {
    busy.value = false
  }
}

/**
 * Ticker pace for the caption: the same ~4.2 chars/sec the talk-over timing
 * assumes for the TTS voice, so the scroll and the speech finish together.
 */
const patterScrollSeconds = computed(() =>
  Math.max(3, musicStore.djPatter.length / 4.2),
)

const radioIntent = computed(() => musicStore.radio.intent || '电台')

/**
 * Hover-to-summon (field-requested revert): the bar stays hidden — even while
 * a song plays — until the composer's music tag or the bar itself is hovered.
 * Leaving retracts it immediately (the 4s linger was field-rejected); the
 * only grace left is a beat long enough for the pointer to TRAVEL from the
 * summon tag into the bar — at zero the bar dies before it can be reached.
 */
const LINGER_MS = 250
const lingering = ref(false)
let lingerTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => props.expanded || held.value,
  hovered => {
    if (lingerTimer) clearTimeout(lingerTimer)
    lingerTimer = null
    if (hovered) {
      lingering.value = true
      return
    }
    lingerTimer = setTimeout(() => {
      lingering.value = false
    }, LINGER_MS)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (lingerTimer) clearTimeout(lingerTimer)
})

const configured = computed(
  () =>
    settingsStore.settings.music?.enabled === true &&
    musicStore.state.configured === true,
)

/**
 * Click-to-pin: a click on the bar's inert body (not its buttons/track/input)
 * pins it on screen regardless of hover; a second click unpins, returning it
 * to hover rules — with the pointer still inside it simply stays.
 */
const pinned = ref(false)
// Pinning turns the flyout into a fixture, and a fixture must not sit on top of
// the conversation: the composer reads this to reserve real height for the bar
// (see .composer-anchor's margin-top) so the chat area is pushed up instead.
watch(pinned, value => (musicStore.barPinned = value), { immediate: true })
onBeforeUnmount(() => {
  musicStore.barPinned = false
})
function onBarClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, input, .music-track, .music-vol')) return
  pinned.value = !pinned.value
}

const visible = computed(
  () =>
    configured.value &&
    (pinned.value ||
      props.expanded ||
      held.value ||
      lingering.value ||
      // Mid-interaction the bar must never vanish: an open intent input (the
      // hands are on the keyboard, not the pointer), a command in flight, or
      // an error line that still owes the user its readable seconds.
      composingIntent.value ||
      busy.value ||
      flash.value !== ''),
)

/**
 * Geometric hold: "the pointer is inside the bar" is judged by coordinates
 * against the bar's rect, NOT by DOM hover. Floating overlays (the chat's
 * scroll-to-bottom button lands right on top of the bar) swallow
 * mouseenter/mouseleave, and the bar used to vanish while the pointer was
 * visibly inside it (field complaint). A stationary pointer keeps the last
 * verdict — no event fires, so `held` simply stays true.
 */
const HOLD_PADDING_PX = 12
function onWindowPointerMove(event: PointerEvent) {
  const el = barEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  held.value =
    event.clientX >= rect.left - HOLD_PADDING_PX &&
    event.clientX <= rect.right + HOLD_PADDING_PX &&
    event.clientY >= rect.top - HOLD_PADDING_PX &&
    event.clientY <= rect.bottom + HOLD_PADDING_PX
}
/** The pointer left the window entirely (app switch, screen edge). */
function onWindowBlurOrLeave() {
  held.value = false
}
onMounted(() => {
  window.addEventListener('pointermove', onWindowPointerMove, { passive: true })
  window.addEventListener('blur', onWindowBlurOrLeave)
  document.documentElement.addEventListener('pointerleave', onWindowBlurOrLeave)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('blur', onWindowBlurOrLeave)
  document.documentElement.removeEventListener('pointerleave', onWindowBlurOrLeave)
})

// Report the bar's live height to the store while it is on screen, so the goal
// bar (a sibling in the composer column that this out-of-flow flyout floats over)
// can lift clear and sit above it. Measured with a ResizeObserver because the bar
// wraps to a second row for the 接下来 line; 0 whenever the bar is not rendered.
const barEl = ref<HTMLElement | null>(null)
let barResize: ResizeObserver | null = null
watch(barEl, el => {
  barResize?.disconnect()
  barResize = null
  if (el) {
    if (typeof ResizeObserver !== 'undefined') {
      barResize = new ResizeObserver(() => {
        if (barEl.value) musicStore.barHeight = barEl.value.offsetHeight
      })
      barResize.observe(el)
    }
    musicStore.barHeight = el.offsetHeight
  } else {
    musicStore.barHeight = 0
    // No rect to test against: a stale "inside" verdict from the bar's last
    // on-screen moment must not resurrect it out of nowhere.
    held.value = false
  }
})
onBeforeUnmount(() => {
  barResize?.disconnect()
  musicStore.barHeight = 0
})

const isPaused = computed(() => nowPlaying.value?.status === 'paused')

const canSeek = computed(() => !!nowPlaying.value?.duration && !busy.value)

function onSeek(event: MouseEvent) {
  const duration = nowPlaying.value?.duration
  if (!duration || busy.value) return
  const track = event.currentTarget as HTMLElement
  const ratio = Math.max(0, Math.min(1, event.offsetX / track.clientWidth))
  void run('seek', ratio * duration)
}

/**
 * Optimistic overlay over the persisted volume (user-prefs.json via getRadio):
 * shown immediately on a step, dropped once the store's refresh brings the
 * real number back.
 */
const pendingVolume = ref<number | null>(null)
const volume = computed(() => pendingVolume.value ?? musicStore.radio.volume)
// Once the persisted number catches up, stop overlaying it — otherwise a
// volume change made elsewhere (the model, ncm-cli itself) would stay hidden.
watch(
  () => musicStore.radio.volume,
  next => {
    if (pendingVolume.value !== null && next === pendingVolume.value) pendingVolume.value = null
  },
)

/** Fine enough to actually tune with (±10 was a sledgehammer — field feedback). */
const VOLUME_STEP = 5

/** Cut the host mid-sentence; the ack lets main proceed straight to the song. */
function skipPatter() {
  musicStore.stopDjPatter()
}

/**
 * The full stop: close the station FIRST (main flips active=false and stops
 * the player), THEN cut the patter — the cut's ack unblocks the in-flight
 * start, which now sees the closed station and aborts instead of playing.
 */
async function stopRadio() {
  await run('radio-stop')
  musicStore.stopDjPatter()
}

async function stepVolume(delta: number) {
  const base = volume.value
  if (base === undefined || busy.value) return
  const target = Math.max(0, Math.min(100, base + delta))
  pendingVolume.value = target
  const response = await run('volume', target)
  if (!response?.success) pendingVolume.value = null
}

/** What plays after this song, when the programme actually is next in line. */
const upNext = computed(() => {
  const current = nowPlaying.value
  if (!current || !musicStore.radio.active) return undefined
  // The player's own queue is opaque; the programme's first entry is only
  // truthfully "next" while the player holds no fed-ahead track.
  const remaining = current.queueLength - current.currentIndex - 1
  return remaining <= 0 ? musicStore.radio.upNext : undefined
})

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const timeLabel = computed(() => {
  const duration = nowPlaying.value?.duration
  if (!duration) return clock(livePosition.value)
  return `${clock(livePosition.value)} / ${clock(duration)}`
})

const backendLabel = computed(() => (musicStore.playerBackend === 'orpheus' ? '网易云 App' : '内置'))
const modeTitle = computed(() =>
  musicStore.playerBackend === 'orpheus'
    ? '当前由网易云音乐 App 播放（没有进度与控制）— 点击切回内置播放器'
    : '当前由内置播放器播放 — 点击切换到网易云音乐 App（仅 macOS）',
)

async function run(command: MusicCommand, value?: number) {
  if (busy.value) return
  busy.value = true
  try {
    const response = await musicStore.sendCommand(command, value)
    if (!response.success) showFlash(response.error || '没有成功,可以再试一次')
    return response
  } finally {
    busy.value = false
  }
}

// `pause`, never `stop`: stop tears the play session down, and the next start
// has to cold-start the daemon — which is unreliable. A pause button that
// sometimes loses the music is worse than none.
const toggle = () => run(isPaused.value ? 'resume' : 'pause')

async function like() {
  const response = await run('like')
  if (response?.success) showFlash('♥ 已红心,DJ 会多排这个方向')
}

async function toggleBackend() {
  if (busy.value) return
  busy.value = true
  try {
    await musicStore.setPlayer(musicStore.playerBackend === 'orpheus' ? 'mpv' : 'orpheus')
  } finally {
    busy.value = false
  }
}


let releaseClock: (() => void) | null = null
onMounted(() => {
  void musicStore.initialize()
  releaseClock = musicStore.useClock()
})
onBeforeUnmount(() => {
  releaseClock?.()
  if (flashTimer) clearTimeout(flashTimer)
})
</script>

<style scoped>
/* Anchored to the composer's top edge and out of flow entirely: the bar must
   cost zero layout, or every chat pays for a feature most sessions never use. */
.music-bar {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  /* Above the message list's scroll-to-bottom button, which overlaps the
     bar visually (z-index 4) — hovering "inside the bar" must stay on the bar. */
  z-index: var(--z-sticky);
  margin-bottom: 9px;
  display: flex;
  align-items: center;
  flex-wrap: wrap; /* the optional 接下来 line wraps to its own row */
  gap: 6px 12px;
  padding: 8px 12px 7px;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 52%, transparent);
  border-radius: 3px;
  background: var(--ui-surface-chat-bg);
}

/* Blueprint frame tag, same as the composer's own. */
.music-frame-label {
  position: absolute;
  top: -7px;
  left: 12px;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg);
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  pointer-events: none;
  user-select: none;
}

.music-title {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12.5px;
  color: var(--ui-text-primary-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.music-mark {
  margin-right: 6px;
  color: var(--ui-text-muted-fg);
}

/* Idle/standby: present but quiet — less ink until the pointer arrives. */
/* No translucent states: the bar is a solid surface whenever it shows —
   the 62% quiet-dimming read as "transparent and broken" (field-rejected). */

.music-intent-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  border-bottom: 1px dashed color-mix(in srgb, var(--ui-border-strong-border) 45%, transparent);
  background: transparent;
  color: var(--ui-text-primary-fg);
  font-size: 12.5px;
  padding: 2px 0;
  outline: none;
}

/* The patter caption: a radio ticker. The viewport clips; the text slides by
   its overflow only (min() clamps short lines to a static 0), holding briefly
   at the head and tail so both ends are readable. inline-size containment is
   what hands 100cqw to the keyframes AND keeps a long line from stretching
   the bar. */
.music-patter {
  flex: 1 1 auto;
  display: inline-flex;
  /* center, not baseline: the contained viewport has no usable text baseline */
  align-items: center;
}

.music-patter-viewport {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  container-type: inline-size;
}

.music-patter-text {
  display: inline-block;
  white-space: nowrap;
  animation-name: music-patter-scroll;
  animation-timing-function: linear;
  animation-fill-mode: both;
}

@keyframes music-patter-scroll {
  0%,
  12% {
    transform: translateX(0);
  }

  88%,
  100% {
    transform: translateX(min(0px, calc(100cqw - 100%)));
  }
}

.music-bar[data-status='paused'] .music-title {
  color: var(--ui-text-muted-fg);
}

/* A drawn line, not a rounded pill — the progress is 1px of ink. The span is
   13px tall purely as a click target for seeking; the ink stays a hairline. */
.music-track {
  flex: 1 1 auto;
  min-width: 40px;
  height: 13px;
  position: relative;
}

.music-track.seekable {
  cursor: pointer;
}

.music-track-line,
.music-track-fill {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  pointer-events: none; /* clicks land on the track, offsetX stays honest */
}

.music-track-line {
  background: color-mix(in srgb, var(--ui-border-strong-border) 40%, transparent);
}

.music-track-fill {
  transform-origin: left center;
  background: var(--ui-text-muted-fg);
  transition: transform 0.25s linear;
}

.music-track.seekable:hover .music-track-fill {
  background: var(--ui-text-primary-fg);
}

.music-time {
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.music-actions {
  display: flex;
  gap: 6px;
}

.music-btn,
.music-mode {
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  line-height: 1;
  color: var(--ui-text-muted-fg);
  background: none;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 32%, transparent);
  border-radius: 2px;
  padding: 3px 7px;
  cursor: pointer;
  transition: color 0.12s ease, border-color 0.12s ease;
}

.music-btn:hover:not(:disabled),
.music-mode:hover:not(:disabled) {
  color: var(--ui-text-primary-fg);
  border-color: color-mix(in srgb, var(--ui-border-strong-border) 70%, transparent);
}

.music-btn:disabled,
.music-mode:disabled {
  opacity: 0.45;
  cursor: default;
}

.music-mode {
  border: none;
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 32%, transparent);
  border-radius: 0;
  padding: 2px 0 2px 10px;
  font-size: 10px;
  white-space: nowrap;
}

.music-vol {
  display: flex;
  align-items: center;
  gap: 4px;
}

.music-vol-btn {
  padding: 3px 5px;
}

.music-vol-value {
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  font-variant-numeric: tabular-nums;
  min-width: 2ch;
  text-align: center;
}

/* The programme peek, wrapped onto its own drawn row. */
.music-next {
  flex-basis: 100%;
  min-width: 0;
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-top: 1px dashed color-mix(in srgb, var(--ui-border-strong-border) 24%, transparent);
  padding-top: 5px;
}

/* Same vocabulary as the dock rows: 0.18s, a 6px lift. */
.music-bar-enter-active,
.music-bar-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.music-bar-enter-from,
.music-bar-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
