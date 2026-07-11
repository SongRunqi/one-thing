<template>
  <div class="queued-frame">
    <span
      class="dock-frame-label"
      aria-hidden="true"
    >QUEUE · {{ items.length }}</span>
    <TransitionGroup
      name="queued-message"
      tag="div"
      class="queued-messages"
    >
      <div
        v-if="fileChanges"
        key="queued-file-changes"
        class="queued-file-changes-row"
      >
        <div class="queued-file-changes-summary">
          <span>{{ changedFilesLabel(fileChanges.fileCount) }}</span>
          <span class="queued-file-additions">+{{ fileChanges.additions }}</span>
          <span class="queued-file-deletions">-{{ fileChanges.deletions }}</span>
        </div>
        <Button
          text
          size="small"
          class="queued-review-btn"
          native-type="button"
          title="Review file changes"
          @click.stop="emit('review')"
        >
          Review
        </Button>
      </div>

      <div
        v-for="item in items"
        :key="item.id"
        class="queued-message-card"
        :class="{ 'has-files': !!item.attachments?.length || hasQueuedFileChanges(item) }"
      >
        <span
          class="queued-message-marker"
          aria-hidden="true"
        >
          <CornerDownRight
            class="queued-message-icon"
            :size="14"
            :stroke-width="2"
          />
        </span>

        <div class="queued-message-body">
          <span class="queued-message-label">Insert message</span>
          <span class="queued-message-separator">·</span>
          <span
            class="queued-message-text"
            :class="{ empty: !item.content }"
          >
            {{ queuedMessagePreview(item) }}
          </span>
          <span
            v-if="queuedFileSummary(item)"
            class="queued-file-summary"
            :class="{ 'is-diff': hasQueuedFileChanges(item) }"
            :title="queuedFileSummaryTitle(item)"
          >
            <span class="queued-message-separator">·</span>
            <GitCompare
              v-if="hasQueuedFileChanges(item)"
              :size="13"
              :stroke-width="2"
            />
            <FileText
              v-else
              :size="13"
              :stroke-width="2"
            />
            <span>{{ queuedFileSummary(item) }}</span>
          </span>
        </div>

        <div class="queued-message-actions">
          <Button
            text
            size="small"
            class="queued-message-action"
            native-type="button"
            :disabled="!!item.attachments?.length"
            :title="item.attachments?.length ? 'File messages will send after the current response' : 'Steer the current agent response with this message'"
            @click.stop="emit('steer', item.id)"
          >
            <template #icon>
              <CornerDownRight
                :size="14"
                :stroke-width="2"
              />
            </template>
            Steer
          </Button>
          <Button
            text
            circle
            class="queued-message-icon-btn"
            native-type="button"
            title="Remove from queue"
            aria-label="Remove from queue"
            :icon="Trash2"
            @click.stop="emit('remove', item.id)"
          />
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { CornerDownRight, FileText, GitCompare, Trash2 } from 'lucide-vue-next'
import { formatFileSize } from '@/utils/format'
import {
  changedFilesLabel,
  hasQueuedFileChanges,
  type QueuedFileChangeSummary,
  type QueuedMessage,
} from './queued-message-utils'

defineProps<{
  items: QueuedMessage[]
  fileChanges: QueuedFileChangeSummary | null
}>()

const emit = defineEmits<{
  (e: 'steer', id: string): void
  (e: 'remove', id: string): void
  (e: 'review'): void
}>()

function queuedMessagePreview(item: QueuedMessage): string {
  const text = item.content.trim().replace(/\s+/g, ' ')
  if (text) return text
  if (item.attachments?.length) return 'Files only'
  return 'Queued'
}

function queuedFileSummary(item: QueuedMessage): string {
  const attachments = item.attachments ?? []
  if (hasQueuedFileChanges(item)) {
    if (attachments.length === 0) return 'File changes'
    if (attachments.length === 1) return `File changes · ${attachments[0].fileName}`
    return `${attachments.length} files changed`
  }
  if (attachments.length === 0) return ''
  if (attachments.length === 1) return `1 file attached · ${attachments[0].fileName}`
  return `${attachments.length} files attached`
}

function queuedFileSummaryTitle(item: QueuedMessage): string {
  const attachments = item.attachments ?? []
  if (attachments.length === 0) return queuedFileSummary(item)
  return attachments
    .map(file => `${file.fileName} (${formatFileSize(file.size)})`)
    .join('\n')
}
</script>

<style scoped>
/* Blueprint frame: outlined, zero fill, floating title tag. */
.queued-frame {
  position: relative;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 52%, transparent);
  border-radius: var(--radius-xs, 4px);
}

.dock-frame-label {
  position: absolute;
  top: -7px;
  left: 10px;
  z-index: 1;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  pointer-events: none;
  user-select: none;
}

.queued-messages {
  --queued-row-fg: var(--ui-text-primary-fg, var(--text));
  --queued-row-muted: var(--ui-text-muted-fg, var(--muted));
  --queued-row-faint: var(--ui-text-faint-fg, var(--muted));
  --queued-row-accent: var(--ui-accent-primary-fg, var(--accent));
  --queued-row-hover: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 54%, transparent);
  --queued-row-divider: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 45%, transparent);

  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 132px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: inherit;
  background: transparent;
  scrollbar-width: thin;
}

.queued-messages::-webkit-scrollbar {
  width: 4px;
}

.queued-messages::-webkit-scrollbar-track {
  background: transparent;
}

.queued-messages::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

.queued-file-changes-row,
.queued-message-card {
  border-top: 1px dashed var(--queued-row-divider);
  flex-shrink: 0;
}

.queued-messages > :first-child {
  border-top: 0;
}

.queued-file-changes-row {
  min-height: 34px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  color: var(--queued-row-muted);
}

.queued-file-changes-summary {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.25;
  white-space: nowrap;
}

.queued-file-additions {
  color: var(--diff-add-text, var(--ui-status-success-fg, var(--text-success)));
}

.queued-file-deletions {
  color: var(--diff-del-text, var(--ui-status-danger-fg, var(--text-error)));
}

.queued-review-btn {
  --app-button-height: 20px;
  --app-button-min-width: 0;
  --app-button-padding-x: 7px;
  --app-button-font-size: 10.5px;
  --app-button-hover-fill: color-mix(in srgb, var(--queued-row-accent) 12%, transparent);
  --app-button-hover-fg: var(--queued-row-accent);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  height: 20px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--queued-row-accent) 45%, transparent);
  border-radius: 3px;
  background: transparent;
  color: var(--queued-row-accent);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.5px;
  cursor: pointer;
}

.queued-review-btn:hover {
  background: color-mix(in srgb, var(--queued-row-accent) 12%, transparent);
}

.queued-message-card {
  min-height: 32px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 3px 8px 3px 12px;
  color: var(--queued-row-muted);
}

.queued-message-marker {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs, 4px);
  color: color-mix(in srgb, var(--queued-row-accent) 76%, var(--queued-row-muted));
}

.queued-message-icon {
  flex-shrink: 0;
}

.queued-message-body {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.25;
}

.queued-message-label {
  flex: 0 0 auto;
  color: var(--queued-row-muted);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.queued-message-separator {
  flex: 0 0 auto;
  color: var(--queued-row-faint);
  font-size: 12px;
  line-height: 1.25;
}

.queued-message-text {
  min-width: 0;
  overflow: hidden;
  color: var(--queued-row-muted);
  font-size: 12.5px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queued-message-text.empty {
  color: var(--queued-row-faint);
  font-style: italic;
}

.queued-file-summary {
  flex: 0 10000 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--queued-row-faint);
  font-size: 11px;
  font-weight: 560;
  line-height: 1.25;
}

.queued-file-summary.is-diff {
  color: color-mix(in srgb, var(--diff-add-text, var(--ui-status-success-fg, var(--text-success))) 70%, var(--queued-row-muted));
}

.queued-file-summary span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queued-message-action,
.queued-message-icon-btn {
  --app-button-height: 24px;
  --app-button-min-width: 0;
  --app-button-padding-x: 6px;
  --app-button-gap: 5px;
  --app-button-font-size: 12px;
  --app-button-hover-fill: var(--queued-row-hover);
  --app-button-hover-fg: var(--queued-row-fg);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  border: 0;
  background: transparent;
  color: var(--queued-row-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs, 4px);
  transition: background 0.16s ease, color 0.16s ease;
}

.queued-message-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.queued-message-action {
  gap: 5px;
  height: 22px;
  padding: 0 6px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  white-space: nowrap;
}

.queued-message-icon-btn {
  --app-button-min-width: 24px;
  --app-button-padding-x: 0;

  width: 24px;
  height: 24px;
}

.queued-message-action:hover,
.queued-message-icon-btn:hover {
  background: var(--queued-row-hover);
  color: var(--queued-row-fg);
}

.queued-message-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.queued-message-enter-active,
.queued-message-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.queued-message-enter-from,
.queued-message-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 480px) {
  .queued-file-summary {
    display: none;
  }

  .queued-message-action :deep(.app-button-label) {
    display: none;
  }

  .queued-message-action {
    --app-button-padding-x: 0;

    width: 24px;
  }
}
</style>
