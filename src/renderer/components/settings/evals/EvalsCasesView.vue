<template>
  <div class="evals-cases-view">
    <!-- Loading -->
    <div
      v-if="store.casesLoading"
      class="evals-loading"
    >
      Loading cases...
    </div>

    <!-- Error -->
    <div
      v-else-if="store.casesError"
      class="evals-error"
    >
      {{ store.casesError }}
    </div>

    <!-- Empty -->
    <div
      v-else-if="store.cases.length === 0"
      class="evals-empty"
    >
      <p>No test cases found.</p>
      <p class="evals-empty-hint">
        Configure the evals repository directory in Settings, or promote a fixture to create your first case.
      </p>
    </div>

    <!-- Cases list -->
    <div
      v-else
      class="evals-cases-list"
    >
      <div class="evals-cases-header">
        <span class="evals-cases-count">{{ store.cases.length }} cases ({{ activeCount }} active, {{ sentinelCount }} sentinel)</span>
      </div>

      <div
        v-for="c in store.cases"
        :key="c.id"
        class="evals-case-row"
        :class="{ sentinel: c.isSentinel, expanded: expandedCase === c.id }"
      >
        <div
          class="evals-case-summary"
          @click="toggleCase(c.id)"
        >
          <div class="evals-case-meta">
            <span class="evals-case-id">{{ c.id }}</span>
            <span
              v-if="c.isSentinel"
              class="evals-case-sentinel-badge"
            >Sentinel</span>
            <span class="evals-case-fixture">Fixture: {{ c.fixture }}</span>
          </div>
          <div class="evals-case-description">
            {{ c.description.slice(0, 120) }}
          </div>
        </div>

        <div
          v-if="expandedCase === c.id"
          class="evals-case-details"
        >
          <div class="evals-detail-row">
            <span class="evals-detail-label">File</span>
            <span class="evals-detail-value monospace">{{ c.file }}</span>
          </div>
          <div class="evals-detail-row">
            <span class="evals-detail-label">Description</span>
            <span class="evals-detail-value">{{ c.description }}</span>
          </div>
          <div class="evals-detail-row">
            <span class="evals-detail-label">User Message</span>
            <span class="evals-detail-value">{{ c.userMessage || "(from fixture)" }}</span>
          </div>
          <div class="evals-detail-row">
            <span class="evals-detail-label">Expect</span>
            <pre class="evals-case-expect">{{ JSON.stringify(c.expect, null, 2) }}</pre>
          </div>

          <div
            v-if="c.isSentinel"
            class="evals-case-actions"
          >
            <button
              class="evals-action-btn"
              disabled
            >
              Already Retired
            </button>
          </div>
          <div
            v-else
            class="evals-case-actions"
          >
            <button
              class="evals-action-btn"
              @click.stop="handleRetire(c.id)"
            >
              Move to Sentinel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useEvalsStore } from "@/stores/evals";

const store = useEvalsStore();
const expandedCase = ref<string | null>(null);

const activeCount = computed(() => store.cases.filter((c) => !c.isSentinel).length);
const sentinelCount = computed(() => store.cases.filter((c) => c.isSentinel).length);

function toggleCase(id: string) {
  expandedCase.value = expandedCase.value === id ? null : id;
}

async function handleRetire(caseId: string) {
  if (!confirm(`Move "${caseId}" to sentinel?`)) return;
  const res = await store.retireCase(caseId);
  if (!res.success) {
    alert(`Failed: ${res.error}`);
  }
}
</script>

<style scoped>
.evals-cases-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.evals-cases-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}

.evals-cases-count {
  font-size: 12px;
  color: var(--settings-ink-4);
}

.evals-case-row {
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  overflow: hidden;
  background: var(--settings-paper-3);
}

.evals-case-row.sentinel {
  opacity: 0.6;
}

.evals-case-summary {
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.evals-case-summary:hover {
  background: color-mix(in srgb, var(--settings-accent) 5%, transparent);
}

.evals-case-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.evals-case-id {
  font-size: 14px;
  font-weight: 620;
  color: var(--settings-ink);
}

.evals-case-sentinel-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--settings-ink-4) 14%, transparent);
  color: var(--settings-ink-4);
  font-weight: 600;
  text-transform: uppercase;
}

.evals-case-fixture {
  font-size: 11px;
  color: var(--settings-ink-4);
}

.evals-case-description {
  font-size: 12px;
  color: var(--settings-ink-3);
  line-height: 1.4;
}

.evals-case-details {
  padding: 12px 14px;
  border-top: 1px solid var(--settings-rule-soft);
  background: color-mix(in srgb, var(--settings-paper) 50%, var(--settings-paper-3));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.evals-case-expect {
  margin: 4px 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: var(--settings-ink-2);
  white-space: pre-wrap;
  background: color-mix(in srgb, var(--settings-paper) 60%, transparent);
  padding: 8px;
  border-radius: 4px;
}

.evals-case-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.evals-detail-row {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.evals-detail-label {
  color: var(--settings-ink-4);
  min-width: 90px;
  flex-shrink: 0;
}

.evals-detail-value {
  color: var(--settings-ink-2);
}

.monospace {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.evals-action-btn {
  padding: 5px 12px;
  border: 1px solid var(--settings-rule);
  border-radius: 5px;
  background: var(--settings-paper);
  color: var(--settings-ink-2);
  font-size: 12px;
  font-weight: 520;
  cursor: pointer;
  transition: all 0.12s ease;
}

.evals-action-btn:hover {
  background: color-mix(in srgb, var(--settings-accent) 10%, var(--settings-paper-3));
}

.evals-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.evals-empty-hint {
  color: var(--settings-ink-5);
  font-size: 12px;
  margin-top: 6px;
}

.evals-loading,
.evals-error,
.evals-empty {
  text-align: center;
  padding: 30px;
  color: var(--settings-ink-4);
  font-size: 13px;
}

.evals-error {
  color: var(--ui-status-danger-fg, #e74c3c);
}
</style>
