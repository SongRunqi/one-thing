<template>
  <div class="evals-records-view">
    <!-- Filter bar -->
    <div class="evals-filter-bar">
      <div class="evals-filter-row">
        <label class="evals-filter-toggle">
          <input
            type="checkbox"
            :checked="store.recordsFilter.negativeOnly"
            @change="toggleNegativeOnly"
          >
          <span>Only negative signals</span>
        </label>

        <select
          v-model="localFilter.category"
          class="evals-form-select"
          @change="applyFilters"
        >
          <option value="">
            All categories
          </option>
          <option value="missed-directory-switch">
            Missed Directory Switch
          </option>
          <option value="ignored-skill-instructions">
            Ignored Skills
          </option>
          <option value="voice-mode-violation">
            Voice Mode Violation
          </option>
          <option value="ignored-known-projects">
            Ignored Known Projects
          </option>
          <option value="wrong-platform-behavior">
            Wrong Platform
          </option>
          <option value="ignored-agent-instructions">
            Ignored Agent
          </option>
          <option value="general-poor-response">
            General Poor Response
          </option>
          <option value="not-prompt-fault">
            Not Prompt Fault
          </option>
        </select>

        <input
          v-model="localFilter.sinceDate"
          type="date"
          class="evals-form-input evals-date-input"
          title="Show records since this date"
          @change="applyFilters"
        >

        <select
          v-model="localFilter.provider"
          class="evals-form-select"
          @change="applyFilters"
        >
          <option value="">
            All providers
          </option>
          <option
            v-for="p in uniqueProviders"
            :key="p"
            :value="p"
          >
            {{ p }}
          </option>
        </select>
      </div>

      <button
        class="evals-action-btn"
        @click="handleGenerateTriage"
      >
        Generate Triage Draft
      </button>
    </div>

    <!-- Triage result -->
    <div
      v-if="triageReport"
      class="evals-triage-preview"
    >
      <div class="evals-triage-header">
        <strong>Triage Report Generated</strong>
        <button
          class="evals-close-btn"
          @click="triageReport = null"
        >
          &times;
        </button>
      </div>
      <pre class="evals-triage-content">{{ triageReport }}</pre>
    </div>

    <!-- Loading -->
    <div
      v-if="store.recordsLoading"
      class="evals-loading"
    >
      Loading records...
    </div>

    <!-- Error -->
    <div
      v-else-if="store.recordsError"
      class="evals-error"
    >
      {{ store.recordsError }}
    </div>

    <!-- Empty -->
    <div
      v-else-if="store.records.length === 0"
      class="evals-empty"
    >
      No evaluation records yet. Records are created when you interact with the assistant.
    </div>

    <!-- Records list -->
    <div
      v-else
      class="evals-records-list"
    >
      <div class="evals-records-header">
        <span class="evals-records-count">{{ store.recordsTotal }} records</span>
      </div>

      <div
        v-for="record in store.records"
        :key="`${record.sessionId}-${record.turnId}`"
        class="evals-record-row"
        :class="{ expanded: expandedRecord === recordKey(record) }"
        @click="toggleRecord(record)"
      >
        <div class="evals-record-summary">
          <div class="evals-record-meta">
            <span class="evals-record-date">{{ formatDate(record.ts) }}</span>
            <span class="evals-record-provider">{{ record.provider }}/{{ record.model }}</span>
          </div>
          <div class="evals-record-signals">
            <span
              v-if="record.signals.retried"
              class="evals-signal-badge bad"
              title="Retried"
            >&#x1F504;</span>
            <span
              v-if="record.signals.editResent"
              class="evals-signal-badge bad"
              title="Edit &amp; Resent"
            >&#x270F;&#xFE0F;</span>
            <span
              v-if="record.signals.toolErrors > 0"
              class="evals-signal-badge bad"
              title="Tool Errors"
            >&#x26A0;&#xFE0F;{{ record.signals.toolErrors }}</span>
            <span
              v-if="record.signals.streamAborted"
              class="evals-signal-badge bad"
              title="Aborted"
            >&#x1F6D1;</span>
            <span
              v-if="record.explicit === 'down'"
              class="evals-signal-badge bad"
              title="Downvoted"
            >&#x1F44E;</span>
            <span
              v-if="!hasNegativeSignals(record)"
              class="evals-signal-badge good"
            >&#x2705;</span>
          </div>
        </div>

        <!-- Expanded details -->
        <div
          v-if="expandedRecord === recordKey(record)"
          class="evals-record-details"
        >
          <div class="evals-detail-row">
            <span class="evals-detail-label">Session</span>
            <span class="evals-detail-value monospace">{{ record.sessionId.slice(0, 12) }}...</span>
          </div>
          <div class="evals-detail-row">
            <span class="evals-detail-label">Turn</span>
            <span class="evals-detail-value monospace">{{ record.turnId.slice(0, 12) }}...</span>
          </div>
          <div
            v-if="record.judge"
            class="evals-detail-row"
          >
            <span class="evals-detail-label">Judge</span>
            <span class="evals-detail-value">
              Score: {{ record.judge.score.toFixed(2) }} | {{ record.judge.category }} &mdash; {{ record.judge.reason }}
            </span>
          </div>
          <div
            v-if="record.fixtureRef"
            class="evals-detail-row"
          >
            <span class="evals-detail-label">Fixture</span>
            <span class="evals-detail-value monospace fixture-path">{{ record.fixtureRef }}</span>
          </div>
          <div class="evals-detail-row">
            <span class="evals-detail-label">Signals</span>
            <span class="evals-detail-value">
              {{ signalSummary(record) }}
            </span>
          </div>
          <div class="evals-detail-row">
            <button
              class="evals-action-btn"
              @click.stop="openSession(record.sessionId)"
            >
              Open Session
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
import type { EvalRecordView } from "@/stores/evals";

const store = useEvalsStore();
const expandedRecord = ref<string | null>(null);
const triageReport = ref<string | null>(null);

const localFilter = ref({
  category: "",
  sinceDate: "",
  provider: "",
});

const uniqueProviders = computed(() => {
  const set = new Set(store.records.map((r) => r.provider));
  return [...set].sort();
});

function recordKey(r: EvalRecordView) {
  return `${r.sessionId}::${r.turnId}`;
}

function toggleRecord(r: EvalRecordView) {
  const key = recordKey(r);
  expandedRecord.value = expandedRecord.value === key ? null : key;
}

function toggleNegativeOnly(e: Event) {
  store.recordsFilter.negativeOnly = (e.target as HTMLInputElement).checked;
  applyFilters();
}

function applyFilters() {
  store.recordsFilter.category = localFilter.value.category;
  store.recordsFilter.provider = localFilter.value.provider;
  if (localFilter.value.sinceDate) {
    store.recordsFilter.sinceTs = new Date(localFilter.value.sinceDate).toISOString();
  } else {
    store.recordsFilter.sinceTs = undefined;
  }
  void store.loadRecords();
}

function hasNegativeSignals(r: EvalRecordView) {
  if (r.explicit === "down") return true;
  if (r.judge && r.judge.score < 0.5) return true;
  const s = r.signals;
  return s.retried || s.editResent || s.streamAborted || s.toolErrors > 0 || s.permissionDenied;
}

function signalSummary(r: EvalRecordView) {
  const parts: string[] = [];
  if (r.signals.retried) parts.push("Retried");
  if (r.signals.editResent) parts.push("Edit & Resent");
  if (r.signals.toolErrors > 0) parts.push(`Tool Errors: ${r.signals.toolErrors}`);
  if (r.signals.streamAborted) parts.push("Aborted");
  if (r.signals.permissionDenied) parts.push("Permission Denied");
  if (r.explicit === "down") parts.push("Downvoted");
  return parts.length > 0 ? parts.join(", ") : "None";
}

function formatDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function openSession(sessionId: string) {
  // Switch to session via platform API
  import("@/platform").then(({ platformApi }) => {
    void platformApi.switchSession(sessionId);
  });
}

async function handleGenerateTriage() {
  const res = await store.generateTriage(1);
  if (res.success && res.report) {
    triageReport.value = res.report;
  }
}
</script>

<style scoped>
.evals-records-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.evals-filter-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.evals-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.evals-filter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--settings-ink-2);
  cursor: pointer;
  white-space: nowrap;
}

.evals-filter-toggle input[type="checkbox"] {
  width: 15px;
  height: 15px;
}

.evals-date-input {
  width: 150px;
}

.evals-form-select,
.evals-form-input {
  padding: 5px 8px;
  border: 1px solid var(--settings-rule);
  border-radius: 5px;
  background: var(--settings-paper);
  color: var(--settings-ink);
  font-size: 12px;
  font-family: inherit;
}

.evals-action-btn {
  padding: 5px 12px;
  border: 1px solid var(--settings-rule);
  border-radius: 5px;
  background: var(--settings-paper-3);
  color: var(--settings-ink-2);
  font-size: 12px;
  font-weight: 520;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.evals-action-btn:hover {
  background: color-mix(in srgb, var(--settings-accent) 10%, var(--settings-paper-3));
  border-color: color-mix(in srgb, var(--settings-accent) 30%, var(--settings-rule));
}

.evals-records-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}

.evals-records-count {
  font-size: 12px;
  color: var(--settings-ink-4);
}

.evals-record-row {
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  padding: 10px 14px;
  cursor: pointer;
  transition: border-color 0.12s ease;
  background: var(--settings-paper-3);
}

.evals-record-row:hover {
  border-color: color-mix(in srgb, var(--settings-accent) 20%, var(--settings-rule));
}

.evals-record-row.expanded {
  border-color: color-mix(in srgb, var(--settings-accent) 30%, var(--settings-rule));
}

.evals-record-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.evals-record-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.evals-record-date {
  font-size: 13px;
  color: var(--settings-ink-2);
  font-weight: 520;
}

.evals-record-provider {
  font-size: 11px;
  color: var(--settings-ink-4);
}

.evals-record-signals {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.evals-signal-badge {
  font-size: 12px;
  padding: 2px 5px;
  border-radius: 3px;
}

.evals-signal-badge.bad {
  background: var(--ui-status-danger-bg);
}

.evals-signal-badge.good {
  background: var(--ui-status-success-bg);
}

.evals-record-details {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--settings-rule-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.evals-detail-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.evals-detail-label {
  color: var(--settings-ink-4);
  min-width: 60px;
  flex-shrink: 0;
}

.evals-detail-value {
  color: var(--settings-ink-2);
}

.monospace {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.fixture-path {
  word-break: break-all;
}

.evals-triage-preview {
  border: 1px solid color-mix(in srgb, var(--settings-accent) 30%, var(--settings-rule));
  border-radius: 6px;
  background: var(--settings-paper-3);
  overflow: hidden;
}

.evals-triage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid var(--settings-rule-soft);
  font-size: 13px;
  color: var(--settings-ink);
}

.evals-close-btn {
  border: none;
  background: none;
  color: var(--settings-ink-4);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}

.evals-triage-content {
  padding: 14px;
  font-size: 12px;
  color: var(--settings-ink-2);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 400px;
  overflow-y: auto;
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
