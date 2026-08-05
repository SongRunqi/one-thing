<template>
  <div
    ref="rootRef"
    class="practice-strip"
  >
    <!-- Collapsed line: the seam (idle) or the live baseline (running) -->
    <div
      class="strip-line"
      :class="{ running: isRunning }"
      @click="toggleMenu"
    >
      <template v-if="!isRunning">
        <span
          class="seg seam-seg"
          aria-hidden="true"
        />
        <span class="hint">练</span>
      </template>

      <template v-else-if="snapshot.kind === 'kegel'">
        <span
          class="seg live"
          :class="{ resting: snapshot.phase === 'setRest', paused: snapshot.status === 'paused' }"
          :style="kegelSegStyle"
          aria-hidden="true"
        />
        <span class="meta">{{ kegelMetaText }}</span>
      </template>

      <template v-else>
        <span
          class="fill"
          :style="pomodoroFillStyle"
          aria-hidden="true"
        />
        <span class="meta">{{ pomodoroMetaText }}</span>
      </template>
    </div>

    <!-- Menu popover (SessionContextMenu family). Pure overlay: chat layout never moves. -->
    <div
      v-if="menuOpen"
      class="practice-menu"
      role="menu"
    >
      <!-- Running: control menu -->
      <template v-if="isRunning">
        <div class="run-head">
          <span class="run-phase">{{ runPhaseChar }}</span>{{ runHeadText }}
          <span class="run-sub">{{ runSubText }}</span>
        </div>
        <div
          v-for="(item, index) in runItems"
          :key="item.id"
          class="mi"
          :class="{ focused: focusIdx === index }"
          role="menuitem"
          @mouseenter="focusIdx = index"
          @click="item.run()"
        >
          <span class="glyph">{{ item.glyph }}</span>{{ item.label }}
          <span
            v-if="item.hint"
            class="mi-hint"
          >{{ item.hint }}</span>
        </div>
      </template>

      <!-- Quick log: the menu body morphs into one input row -->
      <template v-else-if="menuMode === 'log'">
        <div class="log-row">
          <span class="glyph">✎</span>
          <input
            ref="logInputRef"
            v-model="logDraft"
            class="log-input"
            placeholder="俯卧撑 3×20 或 跑步 30分"
            spellcheck="false"
            @keydown.enter.prevent="submitLog"
            @keydown.esc.stop.prevent="menuMode = 'start'"
          >
          <span
            class="log-verb"
            @click="submitLog"
          >记上</span>
        </div>
        <div class="log-hint">
          {{ logFeedback || '回车记上 · Esc 返回' }}
        </div>
      </template>

      <!-- Idle: start menu -->
      <template v-else>
        <div
          v-for="(item, index) in startItems"
          :key="item.id"
          class="mi"
          :class="{ focused: focusIdx === index, quiet: item.quiet, 'has-sub': item.id === 'pomodoro' }"
          role="menuitem"
          @mouseenter="onItemEnter(index, item)"
          @click="item.run()"
        >
          <span class="glyph">{{ item.glyph }}</span>{{ item.label }}
          <span
            v-if="item.hint"
            class="mi-hint"
          >{{ item.hint }}</span>

          <!-- Category submenu, anchored to the pomodoro item -->
          <div
            v-if="item.id === 'pomodoro' && submenuOpen"
            class="practice-submenu"
            role="menu"
          >
            <div
              v-for="(cat, catIndex) in categories"
              :key="cat"
              class="mi"
              :class="{ focused: subFocusIdx === catIndex }"
              role="menuitem"
              @mouseenter="subFocusIdx = catIndex"
              @click.stop="beginPomodoro(cat)"
            >
              {{ cat }}
              <span
                v-if="cat === defaultCategory"
                class="mi-hint"
              >上次</span>
            </div>
          </div>
        </div>
        <div class="mdiv" />
        <div
          v-for="(item, index) in footItems"
          :key="item.id"
          class="mi quiet"
          :class="{ focused: focusIdx === startItems.length + index }"
          role="menuitem"
          @mouseenter="onItemEnter(startItems.length + index, item)"
          @click="item.run()"
        >
          <span class="glyph">{{ item.glyph }}</span>{{ item.label }}
          <span
            v-if="item.hint"
            class="mi-hint"
          >{{ item.hint }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePracticeStore } from '@/stores/practice'
import { ONETHING_PRACTICE_UI_DEFAULTS } from './practice-strip-defaults'

interface MenuItem {
  id: string
  glyph: string
  label: string
  hint?: string
  quiet?: boolean
  /** Executes the item; return false to keep the menu open. */
  run: () => void
}

const practiceStore = usePracticeStore()
const { snapshot, config, soundEnabled } = storeToRefs(practiceStore)

const rootRef = ref<HTMLElement | null>(null)
const logInputRef = ref<HTMLInputElement | null>(null)
const menuOpen = ref(false)
const menuMode = ref<'start' | 'log'>('start')
const submenuOpen = ref(false)
const focusIdx = ref(0)
const subFocusIdx = ref(0)
const logDraft = ref('')
const logFeedback = ref('')

const isRunning = computed(() => snapshot.value.status !== 'idle')
const kegelConfig = computed(() => config.value?.kegel ?? ONETHING_PRACTICE_UI_DEFAULTS.kegel)
const pomodoroConfig = computed(() => config.value?.pomodoro ?? ONETHING_PRACTICE_UI_DEFAULTS.pomodoro)
const categories = computed(() => pomodoroConfig.value.categories)
const defaultCategory = computed(() => {
  const last = pomodoroConfig.value.lastCategory
  if (last && categories.value.includes(last)) return last
  return categories.value[0] ?? ''
})

// ── Collapsed-line visuals (unchanged from the drawer era) ──

// The live seg is a fresh element on each idle→running swap, and an element
// that mounts already at its target width never transitions. Hold it at the
// 38px baseline for one painted frame, then arm the real phase style.
const segArmed = ref(false)
const isKegelRunning = computed(() => isRunning.value && snapshot.value.kind === 'kegel')

watch(isKegelRunning, (running) => {
  if (!running) {
    segArmed.value = false
    return
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    segArmed.value = true
  }))
}, { immediate: true })

const kegelSegStyle = computed(() => {
  const snap = snapshot.value
  if (!segArmed.value) {
    return { width: '38px', transitionDuration: '0s' }
  }
  if (snap.phase === 'hold') {
    return { width: '72%', transitionDuration: `${snap.phaseSecLeft ?? 0}s` }
  }
  return { width: '38px', transitionDuration: `${snap.phase === 'relax' ? snap.phaseSecLeft ?? 0 : 1}s` }
})

const phaseChar = computed(() => {
  switch (snapshot.value.phase) {
    case 'hold': return '收'
    case 'relax': return '放'
    case 'setRest': return `息 ${snapshot.value.phaseSecLeft ?? 0}″`
    default: return ''
  }
})

const kegelMetaText = computed(() => {
  const snap = snapshot.value
  const pauseMark = snap.status === 'paused' ? '‖ ' : ''
  return `${pauseMark}凯格尔 · ${snap.rep}/${snap.reps} · 组 ${snap.set}/${snap.sets} · ${phaseChar.value}`
})

const pomodoroFillStyle = computed(() => {
  const snap = snapshot.value
  const ratio = snap.totalSec ? Math.min(1, (snap.elapsedSec ?? 0) / snap.totalSec) : 0
  return { width: `${(ratio * 100).toFixed(2)}%` }
})

const pomodoroMetaText = computed(() => {
  const snap = snapshot.value
  const leftMin = Math.max(0, Math.ceil(((snap.totalSec ?? 0) - (snap.elapsedSec ?? 0)) / 60))
  const pauseMark = snap.status === 'paused' ? '‖ ' : ''
  return `${pauseMark}${snap.name} · 剩 ${leftMin}′`
})

// ── Running control menu ──

function formatElapsed(sec: number): string {
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  return `${minutes}′${String(seconds).padStart(2, '0')}″`
}

const runPhaseChar = computed(() => {
  if (snapshot.value.kind !== 'kegel') return snapshot.value.name ?? ''
  return snapshot.value.phase === 'hold' ? '收' : snapshot.value.phase === 'relax' ? '放' : '息'
})

const runHeadText = computed(() => {
  const snap = snapshot.value
  if (snap.kind === 'kegel') {
    return ` ${snap.phaseSecLeft ?? 0}″ · 第 ${snap.rep}/${snap.reps} 次 · 组 ${snap.set}/${snap.sets}`
  }
  const leftMin = Math.max(0, Math.ceil(((snap.totalSec ?? 0) - (snap.elapsedSec ?? 0)) / 60))
  return ` · 剩 ${leftMin}′ / ${Math.round((snap.totalSec ?? 0) / 60)}′`
})

const runSubText = computed(() => {
  const snap = snapshot.value
  const kindName = snap.kind === 'kegel' ? '凯格尔' : '番茄'
  const paused = snap.status === 'paused' ? ' · 已暂停' : ''
  return `${kindName} · 已进行 ${formatElapsed(snap.elapsedSec ?? 0)}${paused}`
})

const runItems = computed<MenuItem[]>(() => [
  {
    id: 'pause',
    glyph: snapshot.value.status === 'paused' ? '▶' : '‖',
    label: snapshot.value.status === 'paused' ? '继续' : '暂停',
    run: () => {
      void (snapshot.value.status === 'paused' ? practiceStore.resume() : practiceStore.pause())
      closeMenu()
    },
  },
  {
    id: 'stop',
    glyph: '■',
    label: '结束',
    hint: '中途结束也记账',
    run: () => {
      void practiceStore.stop()
      closeMenu()
    },
  },
  {
    id: 'cancel',
    glyph: '✕',
    label: '取消',
    hint: '不记账',
    run: () => {
      void practiceStore.cancel()
      closeMenu()
    },
  },
  {
    id: 'progress',
    glyph: '☰',
    label: '查看进度',
    hint: '›',
    run: () => {
      openWorkspace()
      closeMenu()
    },
  },
])

// ── Start menu ──

const startItems = computed<MenuItem[]>(() => [
  {
    id: 'kegel',
    glyph: '▶',
    label: '开始凯格尔',
    hint: `收${kegelConfig.value.holdSec}″/放${kegelConfig.value.relaxSec}″ · ${kegelConfig.value.reps}×${kegelConfig.value.sets}`,
    run: () => void beginKegel(),
  },
  {
    id: 'pomodoro',
    glyph: '◔',
    label: '开始番茄',
    hint: `${defaultCategory.value} · ${pomodoroConfig.value.minutes}′ ›`,
    run: () => void beginPomodoro(defaultCategory.value),
  },
  {
    id: 'log',
    glyph: '✎',
    label: '补录一笔',
    run: () => openLog(),
  },
])

const footItems = computed<MenuItem[]>(() => [
  {
    id: 'sound',
    glyph: '♪',
    label: '音效',
    hint: soundEnabled.value ? '开' : '关',
    quiet: true,
    run: () => {
      void practiceStore.saveConfig({ kegel: { sound: !soundEnabled.value } })
    },
  },
  {
    id: 'settings',
    glyph: '☰',
    label: '参数与账页',
    hint: '›',
    quiet: true,
    run: () => {
      openWorkspace()
      closeMenu()
    },
  },
])

const allStartItems = computed(() => [...startItems.value, ...footItems.value])

function openWorkspace(): void {
  window.dispatchEvent(new CustomEvent('practice:open-workspace'))
}

async function beginKegel(): Promise<void> {
  closeMenu()
  await practiceStore.startKegel()
}

async function beginPomodoro(category: string): Promise<void> {
  if (!category) return
  closeMenu()
  await practiceStore.startPomodoro(category)
  void practiceStore.saveConfig({ pomodoro: { lastCategory: category } })
}

function openLog(): void {
  menuMode.value = 'log'
  logFeedback.value = ''
  void nextTick(() => logInputRef.value?.focus())
}

function parseLogDraft(raw: string): { name: string; sets?: number; repsPerSet?: number; durationMin?: number } | null {
  const text = raw.trim()
  if (!text) return null
  const setsMatch = text.match(/^(.+?)\s+(\d+)\s*[x×*]\s*(\d+)$/i)
  if (setsMatch) {
    return { name: setsMatch[1].trim(), sets: Number(setsMatch[2]), repsPerSet: Number(setsMatch[3]) }
  }
  const durationMatch = text.match(/^(.+?)\s+(\d+)\s*(?:分钟|分|min|m)$/i)
  if (durationMatch) {
    return { name: durationMatch[1].trim(), durationMin: Number(durationMatch[2]) }
  }
  return { name: text }
}

async function submitLog(): Promise<void> {
  const parsed = parseLogDraft(logDraft.value)
  if (!parsed) return
  try {
    await practiceStore.logExercise(parsed)
    logDraft.value = ''
    logFeedback.value = '已记上'
    setTimeout(() => {
      logFeedback.value = ''
      closeMenu()
    }, 900)
  } catch {
    logFeedback.value = '记录失败'
  }
}

// ── Menu lifecycle ──

function toggleMenu(): void {
  if (menuOpen.value) {
    closeMenu()
    return
  }
  menuMode.value = 'start'
  submenuOpen.value = false
  focusIdx.value = 0
  subFocusIdx.value = 0
  menuOpen.value = true
}

function closeMenu(): void {
  menuOpen.value = false
  submenuOpen.value = false
  menuMode.value = 'start'
}

function onItemEnter(index: number, item: MenuItem): void {
  focusIdx.value = index
  submenuOpen.value = item.id === 'pomodoro'
  if (submenuOpen.value) {
    subFocusIdx.value = Math.max(0, categories.value.indexOf(defaultCategory.value))
  }
}

function onDocPointerDown(event: PointerEvent): void {
  if (!menuOpen.value) return
  if (!rootRef.value?.contains(event.target as Node)) closeMenu()
}

function onDocKeydown(event: KeyboardEvent): void {
  if (!menuOpen.value) return
  if (menuMode.value === 'log') return // the input handles its own keys

  if (event.key === 'Escape') {
    event.preventDefault()
    if (submenuOpen.value) submenuOpen.value = false
    else closeMenu()
    return
  }

  const items = isRunning.value ? runItems.value : allStartItems.value

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    if (submenuOpen.value) {
      const count = categories.value.length
      subFocusIdx.value = (subFocusIdx.value + delta + count) % count
    } else {
      focusIdx.value = (focusIdx.value + delta + items.length) % items.length
    }
    return
  }

  if (event.key === 'ArrowRight' && !isRunning.value && items[focusIdx.value]?.id === 'pomodoro') {
    event.preventDefault()
    submenuOpen.value = true
    subFocusIdx.value = Math.max(0, categories.value.indexOf(defaultCategory.value))
    return
  }

  if (event.key === 'ArrowLeft' && submenuOpen.value) {
    event.preventDefault()
    submenuOpen.value = false
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    if (submenuOpen.value) {
      void beginPomodoro(categories.value[subFocusIdx.value])
    } else {
      items[focusIdx.value]?.run()
    }
  }
}

// Running state changes flip the menu between its two forms; reset focus.
watch(isRunning, () => {
  focusIdx.value = 0
  submenuOpen.value = false
  menuMode.value = 'start'
})

onMounted(() => {
  void practiceStore.init()
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onDocKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKeydown)
})
</script>

<style scoped>
.practice-strip {
  --ps-ink: var(--ui-text-primary-fg, var(--text));
  --ps-muted: var(--ui-text-muted-fg, var(--muted));
  --ps-hairline: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 55%, transparent);
  position: relative;
  flex-shrink: 0;
  user-select: none;
  -webkit-app-region: no-drag;
}

/* ── Collapsed line ── */
.strip-line {
  position: relative;
  height: 10px;
  cursor: pointer;
}

.strip-line.running {
  height: 18px;
}

.seg {
  position: absolute;
  top: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 38px;
  height: 3px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--ps-ink) 45%, transparent);
}

.strip-line:hover .seam-seg {
  background: var(--ps-ink);
}

.hint {
  position: absolute;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--ps-muted);
  opacity: 0;
  transition: opacity var(--duration-fast, 0.12s) var(--ease-default, ease);
  pointer-events: none;
}

.strip-line:hover .hint {
  opacity: 1;
}

.seg.live {
  background: var(--ps-ink);
  transition-property: width;
  transition-timing-function: linear;
}

.seg.live.resting {
  animation: ps-breathe 3s ease-in-out infinite;
}

.seg.live.paused {
  transition: none;
  opacity: 0.4;
}

@keyframes ps-breathe {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.9; }
}

.fill {
  position: absolute;
  top: -2px;
  left: 0;
  height: 3px;
  border-radius: 0 1px 1px 0;
  background: var(--ps-ink);
  transition: width 1s linear;
}

.meta {
  position: absolute;
  right: 18px;
  top: 4px;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ps-muted);
  white-space: nowrap;
}

/* ── Menu (SessionContextMenu family) ── */
.practice-menu {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-modal);
  min-width: 248px;
  padding: 6px;
  background: var(--ui-surface-menu-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  border-radius: 10px;
  box-shadow: var(--ui-surface-tooltip-shadow, 0 4px 14px rgb(0 0 0 / 0.12));
}

.mi {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  font-family: var(--type-label-font, inherit);
  font-size: 12.5px;
  white-space: nowrap;
  color: var(--ps-ink);
  cursor: pointer;
}

.mi.quiet {
  color: var(--ui-text-secondary-fg, var(--ps-muted));
}

.mi.focused {
  color: var(--ps-ink);
  background: var(--ui-surface-menu-hover-bg, color-mix(in srgb, var(--ps-ink) 6%, transparent));
}

.mi .glyph {
  width: 14px;
  flex: 0 0 14px;
  text-align: center;
  color: var(--ps-muted);
  font-size: 11px;
}

.mi-hint {
  margin-left: auto;
  padding-left: 18px;
  font-size: 11px;
  color: var(--ps-muted);
}

.mdiv {
  height: 1px;
  margin: 5px 8px;
  background: var(--ps-hairline);
}

.practice-submenu {
  position: absolute;
  left: calc(100% + 4px);
  top: -6px;
  min-width: 128px;
  padding: 6px;
  background: var(--ui-surface-menu-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  border-radius: 10px;
  box-shadow: var(--ui-surface-tooltip-shadow, 0 4px 14px rgb(0 0 0 / 0.12));
}

/* ── Running head ── */
.run-head {
  padding: 9px 12px 7px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--ps-ink);
  border-bottom: 1px solid var(--ps-hairline);
}

.run-phase {
  font-weight: 600;
  font-size: 14px;
}

.run-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--ps-muted);
}

/* ── Quick log ── */
.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 4px;
  font-size: 12.5px;
}

.log-row .glyph {
  color: var(--ps-muted);
  font-size: 11px;
}

.log-input {
  flex: 1;
  min-width: 190px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ps-ink);
  font-size: 12.5px;
  font-family: inherit;
  border-bottom: 1px dashed color-mix(in srgb, var(--ps-muted) 60%, transparent);
  padding: 2px 0;
}

.log-input::placeholder {
  color: color-mix(in srgb, var(--ps-muted) 55%, transparent);
}

.log-verb {
  cursor: pointer;
  color: var(--ps-ink);
  border-bottom: 1.5px dotted color-mix(in srgb, var(--ps-muted) 75%, transparent);
  padding-bottom: 1px;
}

.log-hint {
  padding: 2px 12px 6px;
  font-size: 10.5px;
  color: var(--ps-muted);
}

@media (prefers-reduced-motion: reduce) {
  .seg.live,
  .fill {
    transition: none !important;
  }

  .seg.live.resting {
    animation: none;
    opacity: 0.6;
  }
}
</style>
