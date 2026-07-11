<template>
  <div class="evals-runs-view">
    <!-- Run Panel -->
    <div class="evals-run-panel">
      <h3 class="evals-section-title">
        Run Evaluation
      </h3>

      <div
        v-if="store.runInProgress"
        class="evals-run-progress"
      >
        <div class="evals-run-progress-header">
          <span class="evals-run-status">Running...</span>
          <button
            class="evals-action-btn danger"
            @click="handleCancelRun"
          >
            Cancel
          </button>
        </div>

        <!-- Total progress bar -->
        <div
          v-if="runTotalCases > 0"
          class="evals-progress-bar-wrap"
        >
          <div
            class="evals-progress-bar"
            :style="{ width: runProgressPct + '%' }"
          />
          <span class="evals-progress-label">{{ runCompletedCases }} / {{ runTotalCases }} cases ({{ runProgressPct }}%)</span>
        </div>

        <!-- Progress per case -->
        <div class="evals-run-case-list">
          <div
            v-for="[caseId, cp] in store.runCaseProgress"
            :key="caseId"
            class="evals-run-case-item"
          >
            <span class="evals-run-case-name">{{ caseId }}</span>
            <span class="evals-run-case-score">
              {{ cp.passes }}/{{ cp.attempts }}
              <span
                v-if="cp.score > 0"
                class="evals-run-case-pct"
              >
                ({{ (cp.score * 100).toFixed(0) }}%)
              </span>
            </span>
          </div>
        </div>

        <div
          v-if="store.runProgress?.type === 'error'"
          class="evals-run-error"
        >
          {{ store.runProgress.error }}
        </div>
      </div>

      <!-- Run form -->
      <div
        v-else
        class="evals-run-form"
      >
        <div class="evals-run-form-row">
          <label class="evals-form-label">
            Provider
            <select
              v-model="runForm.providerId"
              class="evals-form-select"
            >
              <option
                v-for="p in providers"
                :key="p.id"
                :value="p.id"
              >{{ p.name }}</option>
            </select>
          </label>

          <label class="evals-form-label">
            Model
            <input
              v-model="runForm.model"
              type="text"
              class="evals-form-input"
              placeholder="deepseek-v4-pro"
            >
          </label>

          <label class="evals-form-label">
            Runs (k)
            <input
              v-model.number="runForm.runs"
              type="number"
              min="1"
              max="10"
              class="evals-form-input"
              style="width:70px"
            >
          </label>

          <button
            class="evals-action-btn primary"
            :disabled="!runForm.providerId || !runForm.model"
            @click="handleStartRun"
          >
            Start Run
          </button>

          <!-- Show error from a failed run start -->
          <div
            v-if="runError"
            class="evals-run-error"
          >
            {{ runError }}
          </div>
        </div>

        <!-- Ablation sections -->
        <div class="evals-run-form-cases">
          <span class="evals-case-select-hint">Ablation (disable prompt sections):</span>
          <div class="evals-case-checkboxes">
            <label
              v-for="s in ablationSections"
              :key="s.key"
              class="evals-case-checkbox"
            >
              <input
                v-model="runForm.disabledSections"
                type="checkbox"
                :value="s.key"
              >
              {{ s.label }}
            </label>
          </div>
        </div>

        <!-- Case selection -->
        <div
          v-if="store.cases.length > 0"
          class="evals-run-form-cases"
        >
          <span class="evals-case-select-hint">Select cases to run (all if none selected):</span>
          <div class="evals-case-checkboxes">
            <label
              v-for="c in store.cases.filter(c => !c.isSentinel)"
              :key="c.id"
              class="evals-case-checkbox"
            >
              <input
                v-model="runForm.caseIds"
                type="checkbox"
                :value="c.id"
              >
              {{ c.id }}
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Run results -->
    <div
      v-if="store.runProgress?.type === 'run-done' && store.runProgress.entry"
      class="evals-run-result"
    >
      <div class="evals-run-result-header">
        <strong>Run Complete</strong>
        <span class="evals-run-mean">
          Mean: {{ formatPct(store.runProgress.entry.mean) }} ({{ store.runProgress.entry.evalSetSize }} cases, {{ store.runProgress.entry.runs }} runs)
        </span>
      </div>
    </div>

    <!-- Run History: left-right split -->
    <h3
      class="evals-section-title"
      style="margin-top:24px"
    >
      Run History
    </h3>

    <div class="evals-runs-split">
      <!-- LEFT: Run list -->
      <div class="evals-runs-list-panel">
        <div
          v-if="store.resultsLoading"
          class="evals-loading"
        >
          Loading...
        </div>
        <div
          v-else-if="store.resultsError"
          class="evals-error"
        >
          {{ store.resultsError }}
        </div>
        <div
          v-else-if="store.results.length === 0"
          class="evals-empty"
        >
          No runs yet.
        </div>
        <div
          v-for="(entry, idx) in store.results"
          :key="entry.ts"
          class="evals-run-list-row"
          :class="{ selected: store.selectedRunIdx === idx }"
          @click="selectRun(idx)"
        >
          <div class="evals-run-list-date">
            {{ formatDate(entry.ts) }}
          </div>
          <div class="evals-run-list-provider">
            {{ entry.provider }}{{ entry.model ? ' / ' + entry.model : '' }}
          </div>
          <div class="evals-run-list-stats">
            <span class="evals-run-list-mean">{{ formatPct(entry.mean) }}</span>
            <span class="evals-run-list-detail">{{ entry.evalSetSize }} cases</span>
          </div>
        </div>
      </div>

      <!-- RIGHT: Detail panel -->
      <div class="evals-runs-detail-panel">
        <div
          v-if="store.selectedRunIdx === null"
          class="evals-empty"
        >
          Select a run to view details
        </div>
        <div
          v-else-if="store.runDetailLoading"
          class="evals-loading"
        >
          Loading...
        </div>
        <div
          v-else-if="!store.runDetail"
          class="evals-empty"
        >
          No detail data available for this run
        </div>
        <div
          v-else
          class="evals-run-detail"
        >
          <div class="evals-detail-header">
            <span class="evals-detail-title">{{ store.runDetail.provider }} / {{ store.runDetail.model }}</span>
            <span class="evals-detail-meta">Mean: {{ selectedRunMean != null ? formatPct(selectedRunMean) : '—' }}</span>
          </div>
          <!-- Case cards -->
          <div
            v-for="[caseId, cd] in Object.entries(store.runDetail.cases)"
            :key="caseId"
            class="evals-detail-case"
          >
            <div class="evals-detail-case-header">
              <span class="evals-detail-case-name">{{ caseId }}</span>
              <span class="evals-detail-case-score">{{ formatPct(cd.score) }} ({{ cd.attempts.filter(a => a.pass).length }}/{{ cd.attempts.length }})</span>
            </div>
            <div
              v-for="a in cd.attempts"
              :key="a.index"
              class="evals-detail-attempt"
              :class="{ pass: a.pass, fail: !a.pass }"
            >
              <span class="evals-attempt-icon">{{ a.pass ? '✓' : '✗' }}</span>
              <span class="evals-attempt-label">#{{ a.index }}</span>
              <span class="evals-attempt-reason">{{ a.reason }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Comparison table (kept, appears when two runs are selected for compare) -->
    <div
      v-if="store.runComparison"
      class="evals-comparison"
    >
      <h3 class="evals-section-title">
        Comparison
        <span class="evals-compare-hint">
          {{ formatDate(store.runComparison.a.ts) }} &rarr; {{ formatDate(store.runComparison.b.ts) }}
        </span>
      </h3>

      <table class="evals-compare-table">
        <thead>
          <tr>
            <th>Case</th>
            <th class="evals-num-col">
              Previous
            </th>
            <th class="evals-num-col">
              Current
            </th>
            <th class="evals-num-col">
              Delta
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="comp in store.runComparison.comparisons"
            :key="comp.id"
            :class="{ improved: comp.delta > 0, regressed: comp.delta < 0 }"
          >
            <td>
              {{ comp.id }}
              <span
                v-if="isRetireCandidate(comp.id, store.compareIdxB)"
                class="evals-retire-icon"
                title="Last 3 runs all 1.0"
              >&#x1F3C1;</span>
            </td>
            <td class="evals-num-col">
              {{ formatPct(comp.scoreA) }}
            </td>
            <td class="evals-num-col">
              {{ formatPct(comp.scoreB) }}
            </td>
            <td class="evals-num-col">
              <span
                v-if="comp.delta > 0"
                class="evals-delta-pos"
              >&uarr;+{{ formatPct(comp.delta) }}</span>
              <span
                v-else-if="comp.delta < 0"
                class="evals-delta-neg"
              >&darr;{{ formatPct(comp.delta) }}</span>
              <span v-else>&rarr;0</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useEvalsStore } from "@/stores/evals";
import { platformApi } from "@/platform";

const store = useEvalsStore();

const runForm = ref({
  providerId: "",
  model: "deepseek-v4-pro",
  runs: 3,
  caseIds: [] as string[],
  disabledSections: [] as string[],
});

const providers = ref<Array<{ id: string; name: string }>>([]);

// Keys must match the section names in buildRuntimeSystemPrompt
// (packages/onething-runtime/src/prompts/builder.ts) — a mismatched key
// silently disables nothing.
const ablationSections = [
  { key: "agent", label: "Agent" },
  { key: "voice", label: "Voice" },
  { key: "runtime-context", label: "Runtime Context" },
  { key: "workdir", label: "Work Directory" },
  { key: "active-project", label: "Active Project" },
  { key: "known-projects", label: "Known Projects" },
  { key: "context-variables", label: "Context Variables" },
  { key: "skills", label: "Skills" },
  { key: "os", label: "Platform/OS" },
  { key: "agents-md", label: "AGENTS.md" },
  { key: "plugins", label: "Plugins" },
];

const runTotalCases = computed(() => store.runProgress?.totalCases ?? 0);
const runCompletedCases = computed(() => store.runProgress?.completedCases ?? 0);
const runProgressPct = computed(() => {
  if (runTotalCases.value === 0) return 0;
  return Math.round((runCompletedCases.value / runTotalCases.value) * 100);
});

// Show error when a run failed to start (error is in runProgress but runInProgress is false)
const runError = computed(() =>
  !store.runInProgress && store.runProgress?.type === "error"
    ? store.runProgress.error
    : null,
);

// Mean of the selected historical run (not current runProgress)
const selectedRunMean = computed(() => {
  if (store.selectedRunIdx === null) return null;
  return store.results[store.selectedRunIdx]?.mean;
});

onMounted(async () => {
  try {
    const res = await platformApi.getProviders();
    if (res.success && res.providers) {
      providers.value = res.providers
        // The eval model caller only supports API-key providers; listing
        // OAuth providers here would offer options that always fail at run
        // start (see evals-provider-adapter resolveEvalsCredentials).
        .filter((p: any) => !p.requiresOAuth)
        .map((p: any) => ({
          id: p.id,
          name: p.name || p.id,
        }));
      if (providers.value.length > 0) {
        // Default to DeepSeek when configured, otherwise the first provider.
        const deepseek = providers.value.find((p) => p.id === "deepseek");
        runForm.value.providerId = deepseek?.id ?? providers.value[0].id;
      }
    }
  } catch {
    /* ignore */
  }
});

function formatDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function formatPct(v: number) {
  return (v * 100).toFixed(0) + "%";
}

function toggleCompare(idx: number) {
  if (store.compareIdxA === idx) {
    store.compareIdxA = null;
  } else if (store.compareIdxB === idx) {
    store.compareIdxB = null;
  } else if (store.compareIdxA === null) {
    store.compareIdxA = idx;
  } else if (store.compareIdxB === null) {
    store.compareIdxB = idx;
  } else {
    store.compareIdxA = store.compareIdxB;
    store.compareIdxB = idx;
  }
}

/** Check if a case has score 1.0 for the last 3 consecutive runs up to the given index. */
function isRetireCandidate(caseId: string, endIdx: number | null): boolean {
  if (endIdx === null || endIdx < 2) return false;
  const entries = store.results;
  for (let i = endIdx; i > endIdx - 3 && i >= 0; i--) {
    if ((entries[i].scores?.[caseId] ?? 0) !== 1) return false;
  }
  return true;
}

async function selectRun(idx: number) {
  store.selectedRunIdx = idx;
  const entry = store.results[idx];
  if (entry?.ts) {
    await store.loadRunDetail(entry.ts);
  }
}

async function handleStartRun() {
  const params = {
    caseIds: runForm.value.caseIds.length > 0 ? [...runForm.value.caseIds] : undefined,
    runs: runForm.value.runs,
    disabledSections: runForm.value.disabledSections.length > 0 ? [...runForm.value.disabledSections] : undefined,
    providerId: runForm.value.providerId,
    model: runForm.value.model,
  };
  console.log("[Evals UI] handleStartRun called with:", JSON.stringify(params));
  await store.startRun(params);
}

function handleCancelRun() {
  void store.cancelRun();
}
</script>

<style scoped>
.evals-runs-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.evals-section-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 620;
  color: var(--settings-ink);
}

/* Run panel */
.evals-run-panel {
  border: 1px solid var(--settings-rule);
  border-radius: 8px;
  padding: 16px;
  background: var(--settings-paper-3);
}

.evals-run-form-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.evals-run-form-cases {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--settings-rule-soft);
}

.evals-case-select-hint {
  font-size: 12px;
  color: var(--settings-ink-4);
  display: block;
  margin-bottom: 6px;
}

.evals-case-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.evals-case-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--settings-ink-2);
}

.evals-run-progress {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.evals-run-progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.evals-run-status {
  font-size: 13px;
  font-weight: 600;
  color: var(--settings-accent);
}

.evals-progress-bar-wrap {
  position: relative;
  height: 22px;
  border: 1px solid var(--settings-rule);
  border-radius: 4px;
  background: var(--settings-paper);
  overflow: hidden;
}

.evals-progress-bar {
  height: 100%;
  background: color-mix(in srgb, var(--settings-accent) 30%, transparent);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.evals-progress-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--settings-ink-2);
  font-weight: 520;
}

.evals-action-btn.danger {
  color: var(--ui-status-danger-fg, #e74c3c);
  border-color: var(--ui-status-danger-border);
}

.evals-action-btn.danger:hover {
  background: var(--ui-status-danger-bg);
}

.evals-run-case-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.evals-run-case-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--settings-paper) 60%, transparent);
}

.evals-run-case-name {
  font-weight: 520;
  color: var(--settings-ink-2);
}

.evals-run-case-score {
  color: var(--settings-ink-3);
}

.evals-run-case-pct {
  color: var(--settings-accent);
}

.evals-run-error {
  color: var(--ui-status-danger-fg, #e74c3c);
  font-size: 12px;
  padding: 8px;
  background: var(--ui-status-danger-bg);
  border-radius: 4px;
}

.evals-run-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--ui-status-success-border);
  border-radius: 6px;
  background: var(--ui-status-success-bg);
  font-size: 13px;
}

.evals-run-mean {
  font-weight: 620;
  color: var(--settings-ink-2);
}

/* Results list */
.evals-results-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.evals-result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s ease;
  background: var(--settings-paper-3);
}

.evals-result-row:hover {
  border-color: color-mix(in srgb, var(--settings-accent) 20%, var(--settings-rule));
}

.evals-result-row.selected {
  border-color: var(--settings-accent);
  box-shadow: 0 0 0 1px var(--settings-accent);
}

.evals-result-row.compare-a {
  border-color: var(--ui-status-info-fg, #3498db);
  box-shadow: 0 0 0 1px var(--ui-status-info-fg, #3498db);
}

.evals-result-row.compare-b {
  border-color: var(--ui-status-warning-fg, #e67e22);
  box-shadow: 0 0 0 1px var(--ui-status-warning-fg, #e67e22);
}

.evals-result-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.evals-result-date {
  font-size: 12px;
  color: var(--settings-ink-2);
  font-weight: 520;
}

.evals-result-provider {
  font-size: 11px;
  color: var(--settings-ink-4);
}

.evals-result-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.evals-result-mean {
  font-size: 15px;
  font-weight: 650;
  color: var(--settings-ink);
}

.evals-result-detail {
  font-size: 11px;
  color: var(--settings-ink-4);
}

/* ── Run History: left-right split ── */
.evals-runs-split {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.evals-runs-list-panel {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  background: var(--settings-paper-3);
  padding: 8px;
  overflow-y: auto;
  max-height: 480px;
}

.evals-run-list-row {
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.evals-run-list-row:hover {
  background: color-mix(in srgb, var(--settings-accent) 5%, transparent);
}

.evals-run-list-row.selected {
  background: color-mix(in srgb, var(--settings-accent) 12%, transparent);
  border: 1px solid var(--settings-accent);
}

.evals-run-list-date {
  font-size: 12px;
  color: var(--settings-ink-2);
  font-weight: 520;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evals-run-list-provider {
  font-size: 11px;
  color: var(--settings-ink-4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evals-run-list-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.evals-run-list-mean {
  font-size: 14px;
  font-weight: 650;
  color: var(--settings-ink);
}

.evals-run-list-detail {
  font-size: 11px;
  color: var(--settings-ink-4);
}

.evals-runs-detail-panel {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  background: var(--settings-paper-3);
  padding: 12px;
  overflow-y: auto;
  max-height: 480px;
}

.evals-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--settings-rule-soft);
  margin-bottom: 8px;
}

.evals-detail-title {
  font-size: 13px;
  font-weight: 620;
  color: var(--settings-ink);
}

.evals-detail-meta {
  font-size: 11px;
  color: var(--settings-ink-3);
}

.evals-detail-case {
  border: 1px solid var(--settings-rule-soft);
  border-radius: 5px;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--settings-paper);
}

.evals-detail-case-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.evals-detail-case-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--settings-ink);
}

.evals-detail-case-score {
  font-size: 12px;
  font-weight: 650;
  color: var(--settings-accent);
}

.evals-detail-attempt {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  font-size: 11px;
  border-radius: 3px;
}

.evals-detail-attempt.fail {
  color: var(--ui-status-danger-fg);
}

.evals-detail-attempt.pass {
  color: var(--ui-status-success-fg);
}

.evals-attempt-icon {
  font-weight: 700;
  width: 14px;
  text-align: center;
}

.evals-attempt-label {
  font-weight: 520;
  min-width: 20px;
}

.evals-attempt-reason {
  flex: 1;
  color: var(--settings-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Comparison */
.evals-comparison {
  margin-top: 8px;
}

.evals-compare-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--settings-ink-4);
  margin-left: 8px;
}

.evals-compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.evals-compare-table th {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 2px solid var(--settings-rule);
  color: var(--settings-ink-3);
  font-weight: 600;
}

.evals-compare-table td {
  padding: 7px 12px;
  border-bottom: 1px solid var(--settings-rule-soft);
  color: var(--settings-ink-2);
}

.evals-num-col {
  text-align: right !important;
  width: 80px;
}

.evals-compare-table tr.improved td {
  background: var(--ui-status-success-bg);
}

.evals-compare-table tr.regressed td {
  background: var(--ui-status-danger-bg);
}

.evals-delta-pos {
  color: var(--ui-status-success-fg, #27ae60);
  font-weight: 600;
}

.evals-delta-neg {
  color: var(--ui-status-danger-fg, #e74c3c);
  font-weight: 600;
}

.evals-retire-icon {
  margin-left: 4px;
  font-size: 12px;
}

/* Form elements */
.evals-form-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--settings-ink-3);
  font-weight: 520;
}

.evals-form-input,
.evals-form-select {
  padding: 7px 10px;
  border: 1px solid var(--settings-rule);
  border-radius: 5px;
  background: var(--settings-paper);
  color: var(--settings-ink);
  font-size: 13px;
  font-family: inherit;
}

.evals-action-btn {
  padding: 7px 16px;
  border: 1px solid var(--settings-rule);
  border-radius: 5px;
  background: var(--settings-paper);
  color: var(--settings-ink-2);
  font-size: 13px;
  font-weight: 520;
  cursor: pointer;
  transition: all 0.12s ease;
}

.evals-action-btn:hover {
  background: color-mix(in srgb, var(--settings-accent) 10%, var(--settings-paper-3));
}

.evals-action-btn.primary {
  background: var(--settings-accent);
  color: white;
  border-color: var(--settings-accent);
}

.evals-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
