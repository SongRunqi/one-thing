<template>
  <div
    v-if="error"
    class="error-boundary"
  >
    <div class="error-container">
      <ErrorNote
        variant="block"
        label="应用出错"
        :message="error"
        :details="errorDetails"
      >
        <template #actions>
          <Button
            unstyled
            class="error-btn primary"
            @click="handleRetry"
          >
            Retry
          </Button>
          <Button
            unstyled
            class="error-btn"
            @click="handleRefresh"
          >
            Refresh Page
          </Button>
          <Button
            unstyled
            class="error-btn"
            @click="handleCopyLog"
          >
            {{ copied ? 'Copied' : 'Copy Log' }}
          </Button>
        </template>
      </ErrorNote>
    </div>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { computed, ref, onErrorCaptured } from 'vue'
import { recordCrash, componentChainOf, dumpCrashLog } from '@/services/crash-log'

const error = ref<string | null>(null)
const firstErrorChain = ref<string | null>(null)
const firstErrorInfo = ref<string | null>(null)
const laterErrorCount = ref(0)
const copied = ref(false)

// A crash mid-patch usually cascades: the primary error breaks the tree,
// then the cleanup unmount throws secondary TypeErrors. Latch the FIRST
// error for display — it's the root cause; later ones only get counted.
// Every capture (first or not) goes to the crash log in full.
onErrorCaptured((err, instance, info) => {
  recordCrash('error-boundary', err, { instance, info })
  if (error.value === null) {
    error.value = (err instanceof Error && err.message) || String(err) || 'An unexpected error occurred'
    firstErrorChain.value = componentChainOf(instance) ?? null
    firstErrorInfo.value = info ?? null
  } else {
    laterErrorCount.value++
  }
  return false // Prevent further propagation
})

const errorDetails = computed(() => {
  const lines: string[] = []
  if (firstErrorChain.value) lines.push(`components: ${firstErrorChain.value}`)
  if (firstErrorInfo.value) lines.push(`info: ${firstErrorInfo.value}`)
  if (laterErrorCount.value > 0) {
    lines.push(`+${laterErrorCount.value} follow-up error(s) — Copy Log for the full sequence`)
  }
  return lines.length > 0 ? lines.join('\n') : undefined
})

function handleRetry() {
  error.value = null
  firstErrorChain.value = null
  firstErrorInfo.value = null
  laterErrorCount.value = 0
}

function handleRefresh() {
  window.location.reload()
}

async function handleCopyLog() {
  try {
    await navigator.clipboard.writeText(dumpCrashLog())
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Clipboard unavailable — the log is still at window.__onethingCrashLog.dump().
  }
}
</script>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text));
  padding: 20px;
}

/* A crash screen still centres in the viewport, but the note inside it is the
   same ink rule used everywhere else — left-aligned against its own stroke. */
.error-container {
  width: 100%;
  max-width: 400px;
  text-align: left;
}

/* Ghost/outline mono buttons — matches .error-btn in chat/message/MessageError.vue. */
.error-btn {
  padding: 2px 10px;
  border: 1px solid var(--ui-border-default-border, var(--border-color));
  border-radius: 2px;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  line-height: 1.6;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color var(--transition-fast, 0.15s) ease,
    border-color var(--transition-fast, 0.15s) ease;
}

.error-btn:hover {
  border-color: currentcolor;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.error-btn.primary {
  border-color: var(--ui-status-danger-border, var(--border-error));
  color: var(--ui-status-danger-fg, var(--text-error, rgb(220, 68, 68)));
}

.error-btn.primary:hover {
  border-color: currentcolor;
}
</style>
