<template>
  <div class="evals-settings-tab">
    <div class="evals-view-tabs">
      <button
        v-for="view in views"
        :key="view.id"
        class="evals-view-btn"
        :class="{ active: store.activeView === view.id }"
        @click="store.activeView = view.id"
      >
        {{ view.label }}
      </button>
      <button
        class="evals-view-btn evals-workbench-entry"
        @click="workbench.openWorkbench()"
      >
        🔎 事故工作台
      </button>
    </div>

    <EvalsRecordsView v-if="store.activeView === 'records'" />
    <EvalsFixturesView v-if="store.activeView === 'fixtures'" />
    <EvalsRunsView v-if="store.activeView === 'runs'" />
    <EvalsCasesView v-if="store.activeView === 'cases'" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useEvalsStore } from "@/stores/evals";
import { useEvalsWorkbenchStore } from "@/stores/evalsWorkbench";
import EvalsRecordsView from "./EvalsRecordsView.vue";
import EvalsFixturesView from "./EvalsFixturesView.vue";
import EvalsRunsView from "./EvalsRunsView.vue";
import EvalsCasesView from "./EvalsCasesView.vue";

const store = useEvalsStore();
const workbench = useEvalsWorkbenchStore();

const views = [
  { id: "records" as const, label: "Records" },
  { id: "fixtures" as const, label: "Fixtures" },
  { id: "runs" as const, label: "Runs" },
  { id: "cases" as const, label: "Cases" },
];

onMounted(() => {
  void store.loadRecords();
  void store.loadFixtures();
  void store.loadResults();
  void store.loadCases();
});
</script>

<style scoped>
.evals-settings-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Ledger segmented switcher: state lives in the 2px accent baseline. */
.evals-view-tabs {
  display: flex;
  align-items: baseline;
  gap: 18px;
  border-bottom: 1px solid var(--settings-rule-soft);
}

.evals-view-btn {
  appearance: none;
  padding: 6px 2px 8px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  margin-bottom: -1px;
  background: transparent;
  color: var(--settings-ink-3);
  font-size: 13px;
  font-weight: 540;
  cursor: pointer;
  transition: color 0.12s ease, border-color 0.12s ease;
}

.evals-view-btn:hover {
  color: var(--settings-ink);
}

.evals-view-btn.active {
  color: var(--settings-ink);
  border-bottom-color: var(--settings-accent);
}

.evals-workbench-entry {
  margin-left: auto;
}
</style>
