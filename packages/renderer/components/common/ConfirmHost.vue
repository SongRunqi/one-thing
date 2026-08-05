<template>
  <Dialog
    v-for="(request, index) in confirmStack"
    :key="request.id"
    :open="true"
    :title="request.options.title"
    :danger="request.options.danger"
    :variant="request.options.variant ?? 'default'"
    size="sm"
    :close-on-overlay="request.kind === 'notice'"
    :z-offset="10 + index"
    @update:open="value => { if (!value) settle(request, false) }"
  >
    <p
      v-if="request.options.message"
      class="app-dialog-message"
    >
      {{ request.options.message }}
    </p>

    <template #actions>
      <button
        v-if="request.kind === 'confirm'"
        type="button"
        :class="isLedger(request) ? 'app-dialog-text-btn' : 'btn secondary'"
        @click="settle(request, false)"
      >
        {{ request.options.cancelText ?? 'Cancel' }}
      </button>
      <button
        type="button"
        :class="confirmButtonClass(request)"
        @click="settle(request, true)"
      >
        {{ request.options.confirmText ?? (request.kind === 'notice' ? 'OK' : 'Confirm') }}
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
/**
 * Renders whatever `useConfirm()` has queued. Mounted once by
 * `services/ui-overlay-host` — never placed in a page by hand.
 *
 * Every entry in the stack renders, each one stop higher than the last, so a
 * confirm raised from inside another dialog lands on top instead of behind it.
 * Esc is arbitrated by Dialog's own stack, so only the topmost answers.
 */
import Dialog from '@/components/common/Dialog.vue'
import { confirmStack, settleConfirm, type ConfirmRequest } from '@/composables/useConfirm'

function settle(request: ConfirmRequest, value: boolean) {
  // A notice has no "no": dismissing it (Esc, overlay, OK) is acknowledgement.
  settleConfirm(request.id, request.kind === 'notice' ? true : value)
}

/**
 * The settings area's confirms are mono text buttons, the rest of the app's are
 * the filled global ones. A service dialog cannot inherit a caller's scoped
 * button skin, so it picks between the two published recipes — and the two are
 * never combined on one element, which is what keeps `.btn` and
 * `.app-dialog-text-btn` from ever competing for the same declaration.
 */
function isLedger(request: ConfirmRequest): boolean {
  return request.options.variant === 'paper'
}

function confirmButtonClass(request: ConfirmRequest): string {
  if (isLedger(request)) {
    return request.options.danger ? 'app-dialog-text-btn is-danger' : 'app-dialog-text-btn is-primary'
  }
  return request.options.danger ? 'btn danger' : 'btn primary'
}
</script>

<style scoped>
/* Mirrors the global `.dialog-message` this replaces (components.css). */
.app-dialog-message {
  margin: 0;
  font-size: var(--type-body-size);
  line-height: var(--type-body-line-height);
  color: var(--ui-text-muted-fg);
  white-space: pre-wrap;
  word-break: break-word;
}

</style>
