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
        title="事故工作台:现场还原 / mock 重放 / 自动诊断"
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

.evals-view-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--settings-rule);
  border-radius: 7px;
  background: var(--settings-paper-3);
  width: fit-content;
}

.evals-view-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--settings-ink-3);
  font-size: 13px;
  font-weight: 540;
  cursor: pointer;
  transition: all 0.12s ease;
}

.evals-view-btn:hover {
  color: var(--settings-ink-2);
  background: color-mix(in srgb, var(--settings-paper) 60%, transparent);
}

.evals-view-btn.active {
  background: var(--settings-paper);
  color: var(--settings-ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
</style>
