<template>
  <div
    v-if="toasts.length > 0"
    class="app-toast-host"
    role="status"
    aria-live="polite"
    @pointerenter="paused = true"
    @pointerleave="paused = false"
  >
    <TransitionGroup name="toast">
      <div
        v-for="item in toasts"
        :key="item.id"
        class="toast app-toast"
        :class="item.type"
        @click="dismissToast(item.id)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <template v-if="item.type === 'success'">
            <path d="M20 6 9 17l-5-5" />
          </template>
          <template v-else-if="item.type === 'error'">
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <path d="M12 8v5M12 16h.01" />
          </template>
          <template v-else>
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <path d="M12 16v-5M12 8h.01" />
          </template>
        </svg>
        <span class="app-toast-message">{{ item.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
/**
 * The single toast renderer. Mounted once by `services/ui-overlay-host`.
 *
 * Timing lives here rather than in the service so that "pause while the pointer
 * is over the stack" is a property of what is on screen, not of who posted it.
 * One rAF-free interval drives every item: N timers that each have to be
 * cancelled and re-armed on hover is where per-page toast code kept leaking.
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { dismissToast, toasts } from '@/composables/useToast'

const TICK_MS = 100

const paused = ref(false)
/** id → ms still owed. `Infinity` for a toast that must be clicked away. */
const remaining = new Map<number, number>()
let timer: ReturnType<typeof setInterval> | null = null

function sync() {
  const live = new Set(toasts.value.map(item => item.id))
  for (const id of remaining.keys()) {
    if (!live.has(id)) remaining.delete(id)
  }
  for (const item of toasts.value) {
    if (remaining.has(item.id)) continue
    remaining.set(item.id, item.duration > 0 ? item.duration : Number.POSITIVE_INFINITY)
  }
  if (toasts.value.length === 0) stop()
  else start()
}

function tick() {
  if (paused.value) return
  for (const [id, left] of remaining) {
    if (left === Number.POSITIVE_INFINITY) continue
    const next = left - TICK_MS
    if (next <= 0) dismissToast(id)
    else remaining.set(id, next)
  }
}

function start() {
  if (timer !== null) return
  timer = setInterval(tick, TICK_MS)
}

function stop() {
  if (timer === null) return
  clearInterval(timer)
  timer = null
}

watch(toasts, sync, { immediate: true, deep: false })

onBeforeUnmount(stop)
</script>

<style scoped>
/* The host owns placement; `.toast` (components.css) still owns the skin, which
   is why `.app-toast` only has to undo the fixed positioning the standalone
   version needed. */
.app-toast-host {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 8px;
  z-index: var(--z-toast);
  pointer-events: none;
  -webkit-app-region: no-drag;
}

.app-toast-host > * {
  pointer-events: auto;
}

.app-toast {
  position: static;
  left: auto;
  bottom: auto;
  transform: none;
  max-width: min(520px, calc(100vw - 48px));
  cursor: pointer;
}

.app-toast-message {
  white-space: pre-wrap;
  word-break: break-word;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--duration-normal) var(--ease-default),
    transform var(--duration-normal) var(--ease-default);
}

.toast-leave-active {
  position: absolute;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.toast-move {
  transition: transform var(--duration-normal) var(--ease-default);
}
</style>
