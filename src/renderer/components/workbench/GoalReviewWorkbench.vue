<template>
  <section class="goal-review">
    <header class="review-head">
      <div class="head-line">
        <span class="head-tag">REVIEW</span>
        <span
          class="head-objective"
          :title="objective"
        >{{ objective }}</span>
        <Button
          unstyled
          class="head-refresh"
          title="Rescan the audit trail"
          :disabled="loading"
          @click="load"
        >
          <RefreshCw
            :size="13"
            :stroke-width="2"
            aria-hidden="true"
          />
        </Button>
      </div>
      <div
        v-if="diffs.length"
        class="head-stats"
      >
        <span>{{ diffs.length }} {{ diffs.length === 1 ? 'file' : 'files' }}</span>
        <span class="plus">+{{ totals.added }}</span>
        <span class="minus">−{{ totals.removed }}</span>
      </div>
    </header>

    <div
      v-if="loading"
      class="review-state"
    >
      Scanning changes…
    </div>

    <div
      v-else-if="error"
      class="review-state is-error"
    >
      {{ error }}
    </div>

    <!-- An empty review is a real answer, not a failure: the goal may have
         reached its conclusion by reading, or done its writing through bash,
         which the audit trail does not see. -->
    <div
      v-else-if="!diffs.length"
      class="review-state"
    >
      <p>No file changes recorded for this goal.</p>
      <p class="state-note">
        Only the edit and write tools are audited — anything the model changed
        through bash will not appear here.
      </p>
    </div>

    <div
      v-else
      class="review-files"
    >
      <article
        v-for="file in diffs"
        :key="file.absolutePath"
        class="review-file"
      >
        <header class="file-head">
          <Button
            unstyled
            class="file-toggle"
            :aria-expanded="!collapsed.has(file.absolutePath)"
            @click="toggle(file.absolutePath)"
          >
            <ChevronRight
              class="file-chevron"
              :class="{ open: !collapsed.has(file.absolutePath) }"
              :size="13"
              :stroke-width="2.5"
              aria-hidden="true"
            />
            <span
              class="file-path"
              :title="file.absolutePath"
            >{{ file.path }}</span>
          </Button>
          <span
            v-if="file.created"
            class="file-badge"
          >NEW</span>
          <span
            v-else-if="file.deleted"
            class="file-badge is-deleted"
          >DELETED</span>
          <span class="file-counts">
            <span class="plus">+{{ file.added }}</span>
            <span class="minus">−{{ file.removed }}</span>
          </span>
          <Button
            unstyled
            class="file-open"
            title="Open file in the editor"
            @click="emit('openFile', file.absolutePath)"
          >
            <FileText
              :size="13"
              :stroke-width="2"
              aria-hidden="true"
            />
          </Button>
        </header>

        <DiffView
          v-if="!collapsed.has(file.absolutePath)"
          :diff="file.diff"
          :old-content="file.beforeContent"
          :new-content="file.afterContent"
          :file-name="file.path"
          diff-style="unified"
          :expand-unchanged="Boolean(file.beforeContent && file.afterContent)"
          :show-file-header="false"
          :show-toolbar="false"
        />
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight, FileText, RefreshCw } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import DiffView from '@/components/chat/message/DiffView.vue'
import { platformApi } from '@/platform'
import type { GoalFileDiff } from '@/types'

const props = defineProps<{
  sessionId: string
}>()

const emit = defineEmits<{
  openFile: [filePath: string]
  /** Lets the tab title track the reviewed goal. */
  objectiveResolved: [objective: string]
}>()

const loading = ref(false)
const error = ref('')
const diffs = ref<GoalFileDiff[]>([])
const objective = ref('')
const collapsed = ref(new Set<string>())

const totals = computed(() => diffs.value.reduce(
  (sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }),
  { added: 0, removed: 0 },
))

function toggle(path: string) {
  const next = new Set(collapsed.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsed.value = next
}

async function load() {
  if (!props.sessionId) return
  loading.value = true
  error.value = ''
  try {
    const response = await platformApi.goalDiffs(props.sessionId)
    if (!response.success) {
      error.value = response.error || 'Failed to load goal changes'
      diffs.value = []
      return
    }
    diffs.value = response.diffs || []
    objective.value = response.goal?.objective || ''
    if (objective.value) emit('objectiveResolved', objective.value)
    // Large reviews open collapsed — a wall of diffs is not a review.
    collapsed.value = diffs.value.length > COLLAPSE_ABOVE
      ? new Set(diffs.value.map(file => file.absolutePath))
      : new Set()
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
    diffs.value = []
  } finally {
    loading.value = false
  }
}

const COLLAPSE_ABOVE = 5

watch(() => props.sessionId, load, { immediate: true })

defineExpose({ load })
</script>

<style scoped>
.goal-review {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.review-head {
  flex-shrink: 0;
  padding: 9px 10px 8px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border-color));
}

.head-line {
  display: flex;
  gap: 8px;
  align-items: center;
}

.head-tag {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
}

.head-objective {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.head-refresh {
  flex-shrink: 0;
  display: flex;
  padding: 3px;
  border-radius: var(--radius-xs, 4px);
  color: var(--ui-text-muted-fg, var(--muted));
}

.head-refresh:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.head-stats {
  display: flex;
  gap: 10px;
  margin-top: 5px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted-fg, var(--muted));
}

.review-state {
  padding: 16px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-text-muted-fg, var(--muted));
}

.review-state.is-error {
  color: var(--ui-status-danger-fg, var(--danger-color, #dc2626));
}

.state-note {
  margin-top: 6px;
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
}

.review-files {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.review-file {
  border-bottom: 1px solid var(--ui-border-default-border, var(--border-color));
}

.file-head {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  background: var(--ui-surface-raised-bg, var(--bg-secondary, transparent));
}

.file-toggle {
  display: flex;
  flex: 1;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.file-chevron {
  flex-shrink: 0;
  color: var(--ui-text-muted-fg, var(--muted));
  transition: transform var(--transition-fast, 0.15s) ease;
}

.file-chevron.open {
  transform: rotate(90deg);
}

/* RTL keeps the filename visible when the directory path overflows. */
.file-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.file-badge {
  flex-shrink: 0;
  padding: 1px 4px;
  border: 1px solid currentcolor;
  border-radius: 2px;
  font-family: var(--font-mono, monospace);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--ui-status-success-fg, var(--success-color, #16a34a));
}

.file-badge.is-deleted {
  color: var(--ui-status-danger-fg, var(--danger-color, #dc2626));
}

.file-counts {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.file-open {
  flex-shrink: 0;
  display: flex;
  padding: 3px;
  border-radius: var(--radius-xs, 4px);
  color: var(--ui-text-muted-fg, var(--muted));
}

.file-open:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.plus {
  color: var(--ui-status-success-fg, var(--success-color, #16a34a));
}

.minus {
  color: var(--ui-status-danger-fg, var(--danger-color, #dc2626));
}
</style>
