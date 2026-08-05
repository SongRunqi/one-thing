<template>
  <Dialog
    :open="visible"
    title="Reject reason"
    :width="420"
    :auto-focus="false"
    :style="rejectDialogVars"
    @update:open="value => { if (!value) emit('cancel') }"
  >
    <template #header-extra>
      <button
        type="button"
        class="reject-dialog-close"
        @click="emit('cancel')"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </template>

    <textarea
      ref="rejectReasonInputRef"
      v-model="rejectReason"
      class="reject-reason-input"
      placeholder="Reason for rejection (optional)..."
      rows="3"
      @keydown.enter.ctrl="confirm"
      @keydown.enter.meta="confirm"
    />
    <div class="reject-dialog-hint">
      Ctrl+Enter to confirm · Esc to cancel
    </div>

    <template #actions>
      <button
        type="button"
        class="reject-dialog-btn reject-dialog-btn-cancel"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="button"
        class="reject-dialog-btn reject-dialog-btn-confirm"
        @click="confirm"
      >
        Reject
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
/**
 * 拒绝理由对话框 —— 从 `MessageList.vue` 原样抬出的组件(去复用重构 R1)。
 *
 * markup / 样式 / 快捷键(Ctrl|⌘+Enter 确认、Esc 取消)逐字搬运,抬出来只为让
 * 房面(`RoomSurface`)与旧壳共用一份:账页栏位上那颗 `REJECT` 打开的就是它,
 * 房里房外必须是同一个东西。
 */
import { nextTick, ref, watch, type CSSProperties } from 'vue'
import Dialog from '@/components/common/Dialog.vue'

const props = defineProps<{ visible: boolean }>()

/**
 * Was `--z-max`; P2 puts it back on `--z-modal` with the rest of the dialogs.
 * Nothing it has to out-stack lives above modal — the permission card it is
 * raised from is ordinary page content (docs/design/ui-system.md §3).
 */
const rejectDialogVars: CSSProperties = {
  '--app-dialog-bg': 'var(--ui-surface-panel-bg)',
  // Pre-P2 this title was a `<span class="reject-dialog-title">` with no
  // font-family, i.e. the body sans — not the display serif that the global
  // `.dialog-header h3` convention (and therefore Dialog's default) carries.
  '--app-dialog-title-font': 'inherit',
  '--app-dialog-header-padding': '16px 20px',
  '--app-dialog-body-padding': '20px',
  '--app-dialog-actions-padding': '16px 20px',
} as CSSProperties

const emit = defineEmits<{
  confirm: [reason: string | undefined]
  cancel: []
}>()

const rejectReason = ref('')
const rejectReasonInputRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.visible, open => {
  if (!open) {
    rejectReason.value = ''
    return
  }
  rejectReason.value = ''
  // Focus the textarea after dialog opens
  nextTick(() => {
    rejectReasonInputRef.value?.focus()
  })
})

function confirm() {
  emit('confirm', rejectReason.value.trim() || undefined)
}
</script>

<style scoped>
/* The overlay / panel / header / footer skeleton is Dialog's since P2; the
   header title now comes from Dialog's own `title`, so `.reject-dialog-title`
   went with it. */
.reject-dialog-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted-fg);
  transition: all 0.15s ease;
}

.reject-dialog-close:hover {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
}

.reject-reason-input {
  width: 100%;
  min-height: 80px;
  padding: 12px 14px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 10px;
  background: var(--base);
  color: var(--ui-text-primary-fg);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line-height);
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.reject-reason-input::placeholder {
  color: var(--ui-text-muted-fg);
}

textarea.reject-reason-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent-primary-fg) 15%, transparent);
}

.reject-dialog-hint {
  margin-top: 8px;
  font-size: var(--type-meta-size);
  line-height: var(--type-meta-line-height);
  color: var(--ui-text-muted-fg);
  text-align: right;
}

.reject-dialog-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: var(--type-label-size);
  font-weight: var(--type-label-weight);
  line-height: var(--type-label-line-height);
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.reject-dialog-btn-cancel {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
  border-color: var(--ui-border-default-border);
}

.reject-dialog-btn-cancel:hover {
  background: var(--base);
}

.reject-dialog-btn-confirm {
  background: linear-gradient(135deg, var(--ui-status-danger-fg) 0%, var(--ui-status-danger-fg) 100%);
  color: white;
  border-color: var(--ui-status-danger-fg);
}

.reject-dialog-btn-confirm:hover {
  background: linear-gradient(135deg, var(--ui-status-danger-fg) 0%, var(--ui-status-danger-fg) 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
}

.reject-dialog-btn-confirm:active {
  transform: translateY(0);
}

</style>
