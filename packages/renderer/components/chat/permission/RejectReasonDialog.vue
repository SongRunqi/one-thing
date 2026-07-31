<template>
  <!-- Reject Reason Dialog -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="visible"
        class="reject-dialog-overlay"
        @click.self="emit('cancel')"
      >
        <div class="reject-dialog">
          <div class="reject-dialog-header">
            <span class="reject-dialog-title">Reject reason</span>
            <Button
              unstyled
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
            </Button>
          </div>
          <div class="reject-dialog-body">
            <textarea
              ref="rejectReasonInputRef"
              v-model="rejectReason"
              class="reject-reason-input"
              placeholder="Reason for rejection (optional)..."
              rows="3"
              @keydown.enter.ctrl="confirm"
              @keydown.enter.meta="confirm"
              @keydown.escape="emit('cancel')"
            />
            <div class="reject-dialog-hint">
              Ctrl+Enter to confirm · Esc to cancel
            </div>
          </div>
          <div class="reject-dialog-footer">
            <Button
              unstyled
              class="reject-dialog-btn reject-dialog-btn-cancel"
              @click="emit('cancel')"
            >
              Cancel
            </Button>
            <Button
              unstyled
              class="reject-dialog-btn reject-dialog-btn-confirm"
              @click="confirm"
            >
              Reject
            </Button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * 拒绝理由对话框 —— 从 `MessageList.vue` 原样抬出的组件(去复用重构 R1)。
 *
 * markup / 样式 / 快捷键(Ctrl|⌘+Enter 确认、Esc 取消)逐字搬运,抬出来只为让
 * 房面(`RoomSurface`)与旧壳共用一份:账页栏位上那颗 `REJECT` 打开的就是它,
 * 房里房外必须是同一个东西。
 */
import { nextTick, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'

const props = defineProps<{ visible: boolean }>()

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
.reject-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-max);
}

.reject-dialog {
  background: var(--ui-surface-panel-bg, var(--panel));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 16px;
  width: 90%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.reject-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.reject-dialog-title {
  font-size: var(--type-headline-size);
  font-weight: var(--type-headline-weight);
  line-height: var(--type-headline-line-height);
  color: var(--ui-text-primary-fg, var(--text));
}

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
  color: var(--ui-text-muted-fg, var(--muted));
  transition: all 0.15s ease;
}

.reject-dialog-close:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.reject-dialog-body {
  padding: 20px;
}

.reject-reason-input {
  width: 100%;
  min-height: 80px;
  padding: 12px 14px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 10px;
  background: var(--base);
  color: var(--ui-text-primary-fg, var(--text));
  font-size: var(--type-body-size);
  line-height: var(--type-body-line-height);
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.reject-reason-input::placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
}

.reject-reason-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
}

.reject-dialog-hint {
  margin-top: 8px;
  font-size: var(--type-meta-size);
  line-height: var(--type-meta-line-height);
  color: var(--ui-text-muted-fg, var(--muted));
  text-align: right;
}

.reject-dialog-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  justify-content: flex-end;
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
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-border-default-border, var(--border));
}

.reject-dialog-btn-cancel:hover {
  background: var(--base);
}

.reject-dialog-btn-confirm {
  background: linear-gradient(135deg, var(--ui-status-danger-fg, #b3403a) 0%, var(--ui-status-danger-fg, #b3403a) 100%);
  color: white;
  border-color: var(--ui-status-danger-fg, #b3403a);
}

.reject-dialog-btn-confirm:hover {
  background: linear-gradient(135deg, var(--ui-status-danger-fg, #b3403a) 0%, var(--ui-status-danger-fg, #b3403a) 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
}

.reject-dialog-btn-confirm:active {
  transform: translateY(0);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .reject-dialog,
.modal-fade-leave-active .reject-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .reject-dialog,
.modal-fade-leave-to .reject-dialog {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

/* Light theme adjustments */
html[data-theme='light'] .reject-dialog-overlay {
  background: rgba(0, 0, 0, 0.3);
}

html[data-theme='light'] .reject-dialog {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}
</style>
