<template>
  <div class="evals-fixtures-view">
    <!-- Loading -->
    <div
      v-if="store.fixturesLoading"
      class="evals-loading"
    >
      Loading fixtures...
    </div>

    <!-- Error -->
    <div
      v-else-if="store.fixturesError"
      class="evals-error"
    >
      {{ store.fixturesError }}
    </div>

    <!-- Empty -->
    <div
      v-else-if="store.fixtures.length === 0"
      class="evals-empty"
    >
      No fixtures yet. Fixtures are auto-exported when turns have negative signals (retries, tool errors, aborts).
    </div>

    <!-- Fixtures list -->
    <div
      v-else
      class="evals-fixtures-list"
    >
      <div class="evals-fixtures-header">
        <span class="evals-fixtures-count">{{ store.fixtures.length }} fixtures</span>
      </div>

      <div
        v-for="fixture in store.fixtures"
        :key="fixture.path"
        class="evals-fixture-row"
        :class="{ expanded: expandedFixture === fixture.path }"
      >
        <div
          class="evals-fixture-summary"
          @click="toggleFixture(fixture.path)"
        >
          <div class="evals-fixture-meta">
            <span class="evals-fixture-date">{{ formatDate(fixture.capturedAt) }}</span>
            <span class="evals-fixture-provider">{{ fixture.provider }}/{{ fixture.model }}</span>
          </div>
          <div class="evals-fixture-preview">
            {{ fixture.userMessagePreview }}
          </div>
          <div class="evals-fixture-actions">
            <button
              class="evals-small-btn"
              title="Promote to test case"
              @click.stop="promoteFixture(fixture)"
            >
              ⬆️ Promote
            </button>
          </div>
        </div>

        <!-- Expanded: fixture JSON -->
        <div
          v-if="expandedFixture === fixture.path"
          class="evals-fixture-details"
        >
          <div
            v-if="fixtureLoading"
            class="evals-loading"
          >
            Loading fixture...
          </div>
          <pre
            v-else-if="store.selectedFixture"
            class="evals-fixture-json"
          >{{ JSON.stringify(store.selectedFixture, null, 2) }}</pre>
        </div>
      </div>
    </div>

    <!-- Promote dialog -->
    <div
      v-if="showPromoteDialog"
      class="evals-promote-overlay"
      @click.self="showPromoteDialog = false"
    >
      <div class="evals-promote-dialog">
        <h3>Promote Fixture to Test Case</h3>

        <!-- Basic info -->
        <label class="evals-form-label">
          Case ID
          <input
            v-model="promoteForm.caseId"
            type="text"
            class="evals-form-input"
            placeholder="e.g. linux-unix-syntax"
          >
        </label>
        <label class="evals-form-label">
          Description
          <textarea
            v-model="promoteForm.description"
            class="evals-form-textarea"
            rows="2"
            placeholder="What does this case verify?"
          />
        </label>

        <!-- Assistant response preview -->
        <div
          v-if="promotedFixtureData"
          class="evals-response-preview"
        >
          <div class="evals-section-label">
            📤 Assistant Response
          </div>
          <div class="evals-response-content">
            {{ responsePreview }}
          </div>
          <div class="evals-response-meta">
            <span
              class="evals-meta-badge"
              :class="hasToolCalls ? 'has-tools' : 'no-tools'"
            >
              🔧 {{ promotedFixtureData.toolCallCount ?? 0 }} tool calls
            </span>
            <span class="evals-meta-badge">{{ promotedFixtureData.finishReason ?? 'unknown' }}</span>
          </div>
        </div>

        <!-- Structured expect builder -->
        <div class="evals-expect-builder">
          <div class="evals-section-label">
            🔍 Expectations (AND logic)
          </div>

          <!-- Tool Call -->
          <div class="evals-expect-group">
            <div class="evals-expect-group-title">
              🔧 Tool Call
            </div>
            <label class="evals-checkbox">
              <input
                v-model="promoteForm.hasToolCalls"
                type="checkbox"
              >
              Must make tool calls
              <span
                v-if="autoSuggest.hasToolCalls"
                class="evals-auto-badge"
              >🎯 auto</span>
            </label>
            <label
              v-if="promotedToolNames.length > 0"
              class="evals-checkbox"
            >
              <input
                v-model="promoteForm.useFirstToolCall"
                type="checkbox"
              >
              First tool call: {{ promotedToolNames[0] }}
            </label>
          </div>

          <!-- Skill -->
          <div
            v-if="promotedSkills.length > 0"
            class="evals-expect-group"
          >
            <div class="evals-expect-group-title">
              🧩 Skill
            </div>
            <label class="evals-checkbox">
              <input
                v-model="promoteForm.anySkillUsed"
                type="checkbox"
              >
              Must use any skill
              <span
                v-if="autoSuggest.anySkillUsed"
                class="evals-auto-badge"
              >🎯 auto</span>
            </label>
          </div>

          <!-- MCP -->
          <div
            v-if="promotedMCPTools.length > 0"
            class="evals-expect-group"
          >
            <div class="evals-expect-group-title">
              🔌 MCP
            </div>
            <label class="evals-checkbox">
              <input
                v-model="promoteForm.mcpToolUsed"
                type="checkbox"
              >
              Must use MCP tools
              <span
                v-if="autoSuggest.mcpToolUsed"
                class="evals-auto-badge"
              >🎯 auto</span>
            </label>
          </div>

          <!-- Output -->
          <div class="evals-expect-group">
            <div class="evals-expect-group-title">
              📝 Output
            </div>
            <label class="evals-form-label-sm">Must contain:
              <input
                v-model="promoteForm.contains"
                type="text"
                class="evals-form-input"
                placeholder="e.g. comparison complete"
              >
            </label>
            <label class="evals-form-label-sm">Must NOT contain:
              <input
                v-model="promoteForm.notContains"
                type="text"
                class="evals-form-input"
                placeholder="e.g. sorry, I cannot"
              >
            </label>
            <label class="evals-checkbox">
              <input
                v-model="promoteForm.useMinLength"
                type="checkbox"
              >
              Min output length: <input
                v-model.number="promoteForm.minOutputLength"
                type="number"
                class="evals-num-input"
              > chars
              <span
                v-if="autoSuggest.useMinLength"
                class="evals-auto-badge"
              >🎯 auto</span>
            </label>
          </div>

          <!-- Notes -->
          <label class="evals-form-label-sm">Notes:
            <textarea
              v-model="promoteForm.notes"
              class="evals-form-textarea"
              rows="2"
              placeholder="Why this case exists, what to watch for..."
            />
          </label>
        </div>

        <!-- Snapshot links -->
        <div
          v-if="promotedFixtureData"
          class="evals-snapshot-links"
        >
          <span
            v-if="hasPromptSnapshot"
            class="evals-link"
            @click="viewSnapshot('prompt')"
          >📄 Prompt</span>
          <span
            v-if="hasContextSnapshot"
            class="evals-link"
            @click="viewSnapshot('context')"
          >💬 Context</span>
        </div>

        <div class="evals-promote-actions">
          <button
            class="evals-action-btn"
            @click="showPromoteDialog = false"
          >
            Cancel
          </button>
          <button
            class="evals-action-btn primary"
            @click="handlePromote"
          >
            Promote
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useEvalsStore } from "@/stores/evals";
import type { EvalFixtureMeta } from "@/stores/evals";

const store = useEvalsStore();
const expandedFixture = ref<string | null>(null);
const fixtureLoading = ref(false);
const showPromoteDialog = ref(false);
const promoteTarget = ref<EvalFixtureMeta | null>(null);

// Structured promote form
const promoteForm = ref({
  caseId: "",
  description: "",
  // Tool Call
  hasToolCalls: false,
  useFirstToolCall: false,
  // Skill
  anySkillUsed: false,
  // MCP
  mcpToolUsed: false,
  // Output
  contains: "",
  notContains: "",
  useMinLength: false,
  minOutputLength: 100,
  // Meta
  notes: "",
});

// Parsed fixture data for preview
const promotedFixtureData = ref<{
  content?: string;
  toolCalls?: Array<{ name: string; args?: Record<string, unknown> }>;
  toolCallCount?: number;
  finishReason?: string;
  promptSnapshotRef?: string;
  contextSnapshotRef?: string;
  skills?: Array<{ name: string }>;
  toolNames?: string[];
} | null>(null);

const responsePreview = computed(() => {
  const c = promotedFixtureData.value?.content ?? "";
  return c.length > 300 ? c.slice(0, 300) + "..." : c || "(no content)";
});

const hasToolCalls = computed(() =>
  (promotedFixtureData.value?.toolCallCount ?? 0) > 0,
);

const promotedToolNames = computed(() =>
  promotedFixtureData.value?.toolCalls?.map((tc) => tc.name) ?? [],
);

const promotedSkills = computed(() =>
  promotedFixtureData.value?.skills ?? [],
);

const promotedMCPTools = computed(() =>
  (promotedFixtureData.value?.toolNames ?? []).filter((n) =>
    n.startsWith("mcp__"),
  ),
);

const hasPromptSnapshot = computed(() =>
  !!promotedFixtureData.value?.promptSnapshotRef,
);
const hasContextSnapshot = computed(() =>
  !!promotedFixtureData.value?.contextSnapshotRef,
);

// Auto-suggestions
const autoSuggest = computed(() => {
  const data = promotedFixtureData.value;
  if (!data)
    return {
      hasToolCalls: false,
      anySkillUsed: false,
      mcpToolUsed: false,
      useMinLength: false,
    };

  const noTools = (data.toolCallCount ?? 0) === 0;
  const shortReply = (data.content?.length ?? 0) < 50;

  return {
    hasToolCalls: noTools,
    anySkillUsed:
      (data.skills?.length ?? 0) > 0 &&
      !data.toolCalls?.some(
        (tc) =>
          tc.name === "read" ||
          (tc.name === "bash" &&
            String(tc.args?.command ?? "").includes("SKILL.md")),
      ),
    mcpToolUsed:
      (data.toolNames?.some((n) => n.startsWith("mcp__")) ?? false) &&
      !data.toolCalls?.some((tc) => tc.name.startsWith("mcp__")),
    useMinLength: shortReply && noTools,
  };
});

function formatDate(ts: string) {
  if (!ts) return "Unknown";
  const d = new Date(ts);
  return d.toLocaleString();
}

async function toggleFixture(path: string) {
  if (expandedFixture.value === path) {
    expandedFixture.value = null;
    return;
  }
  expandedFixture.value = path;
  fixtureLoading.value = true;
  await store.loadFixture(path);
  fixtureLoading.value = false;
}

function promoteFixture(fixture: EvalFixtureMeta) {
  promoteTarget.value = fixture;

  // Reset form
  promoteForm.value = {
    caseId: "",
    description: "",
    hasToolCalls: false,
    useFirstToolCall: false,
    anySkillUsed: false,
    mcpToolUsed: false,
    contains: "",
    notContains: "",
    useMinLength: false,
    minOutputLength: 100,
    notes: "",
  };

  // Parse fixture data for preview and auto-suggest
  // The fixture needs to be loaded first
  promotedFixtureData.value = null;
  loadAndParseFixture(fixture.path);

  showPromoteDialog.value = true;
}

async function loadAndParseFixture(path: string) {
  try {
    const res = await store.loadFixture(path);
    // Wait briefly for the store to update
    await new Promise((r) => setTimeout(r, 50));
    const fixture = store.selectedFixture as Record<string, unknown> | null;
    if (!fixture) return;

    const ar = fixture.assistantResponse as
      | Record<string, unknown>
      | undefined;
    const ctx = fixture.context as Record<string, unknown> | undefined;

    promotedFixtureData.value = {
      content: ar?.content != null ? String(ar.content) : undefined,
      toolCalls: (ar?.toolCalls as Array<Record<string, unknown>>)?.map(
        (tc) => ({
          name: String(tc.name ?? ""),
          args: tc.args as Record<string, unknown> | undefined,
        }),
      ),
      toolCallCount:
        (ar?.toolCalls as Array<unknown>)?.length ?? 0,
      finishReason: ar?.finishReason != null ? String(ar.finishReason) : undefined,
      promptSnapshotRef:
        fixture.promptSnapshotRef != null
          ? String(fixture.promptSnapshotRef)
          : undefined,
      contextSnapshotRef:
        fixture.contextSnapshotRef != null
          ? String(fixture.contextSnapshotRef)
          : undefined,
      skills: (ctx?.skills as Array<{ name: string }>),
      toolNames: (ctx?.toolNames as string[]),
    };
  } catch {
    // Ignore parse errors
  }
}

function viewSnapshot(type: "prompt" | "context") {
  // Open snapshot in a new view or inline expansion
  const ref =
    type === "prompt"
      ? promotedFixtureData.value?.promptSnapshotRef
      : promotedFixtureData.value?.contextSnapshotRef;
  if (ref) {
    // For now, just log — full snapshot viewer is a future enhancement
    console.log(`[Evals] View snapshot: ${ref}`);
  }
}

async function handlePromote() {
  if (!promoteTarget.value) return;

  const expect: Record<string, unknown> = {};
  const f = promoteForm.value;

  if (f.hasToolCalls) expect.hasToolCalls = true;
  if (f.useFirstToolCall && promotedToolNames.value[0]) {
    expect.firstToolCall = promotedToolNames.value[0];
  }
  if (f.anySkillUsed) expect.anySkillUsed = true;
  if (f.mcpToolUsed) expect.mcpToolUsed = true;
  if (f.contains) expect.contains = f.contains;
  if (f.notContains) expect.notContains = f.notContains;
  if (f.useMinLength && f.minOutputLength) {
    expect.minOutputLength = f.minOutputLength;
  }
  if (f.notes) expect.notes = f.notes;

  // Maintain backward compat: cast to the old { firstToolCall?, contains?, notContains? }
  const compat = expect as {
    firstToolCall?: string;
    contains?: string;
    notContains?: string;
  };

  const res = await store.promoteFixture({
    fixturePath: promoteTarget.value.path,
    caseId: promoteForm.value.caseId,
    description: promoteForm.value.description,
    expect: compat,
  });

  if (res.success) {
    showPromoteDialog.value = false;
    if (
      confirm(
        `Case created at ${res.casePath}.\n\nRun it once to verify it fails under the current prompt?`,
      )
    ) {
      store.activeView = "runs";
    }
  } else {
    alert(`Failed: ${res.error}`);
  }
}
</script>

<style scoped>
.evals-fixtures-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.evals-fixtures-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}

.evals-fixtures-count {
  font-size: 12px;
  color: var(--settings-ink-4);
}

.evals-fixture-row {
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  overflow: hidden;
  background: var(--settings-paper-3);
}

.evals-fixture-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  cursor: pointer;
  transition: border-color 0.12s ease;
}

.evals-fixture-summary:hover {
  background: color-mix(in srgb, var(--settings-accent) 5%, transparent);
}

.evals-fixture-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
  flex-shrink: 0;
}

.evals-fixture-date {
  font-size: 12px;
  color: var(--settings-ink-2);
  font-weight: 520;
}

.evals-fixture-provider {
  font-size: 11px;
  color: var(--settings-ink-4);
}

.evals-fixture-preview {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--settings-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evals-fixture-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.evals-small-btn {
  padding: 3px 8px;
  border: 1px solid var(--settings-rule);
  border-radius: 4px;
  background: var(--settings-paper);
  color: var(--settings-ink-3);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.evals-small-btn:hover {
  border-color: color-mix(in srgb, var(--settings-accent) 30%, var(--settings-rule));
  color: var(--settings-accent);
}

.evals-fixture-details {
  padding: 14px;
  border-top: 1px solid var(--settings-rule-soft);
  background: color-mix(in srgb, var(--settings-paper) 50%, var(--settings-paper-3));
}

.evals-fixture-json {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: var(--settings-ink-2);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 500px;
  overflow-y: auto;
  line-height: 1.5;
}

/* Promote dialog */
.evals-promote-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.evals-promote-dialog {
  background: var(--settings-paper);
  border: 1px solid var(--settings-rule);
  border-radius: 10px;
  padding: 24px;
  width: 520px;
  max-width: 92vw;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

.evals-promote-dialog h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 620;
  color: var(--settings-ink);
}

.evals-promote-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.evals-form-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--settings-ink-3);
  font-weight: 520;
}

.evals-form-input,
.evals-form-select,
.evals-form-textarea {
  padding: 7px 10px;
  border: 1px solid var(--settings-rule);
  border-radius: 5px;
  background: var(--settings-paper-3);
  color: var(--settings-ink);
  font-size: 13px;
  font-family: inherit;
}

.evals-form-textarea {
  resize: vertical;
}

.evals-action-btn.primary {
  background: var(--settings-accent);
  color: white;
  border-color: var(--settings-accent);
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

/* ── Promote dialog: enhanced styles ── */
.evals-response-preview {
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--settings-paper-3);
}

.evals-section-label {
  font-size: 13px;
  font-weight: 620;
  color: var(--settings-ink);
  margin-bottom: 8px;
}

.evals-response-content {
  font-size: 12px;
  color: var(--settings-ink-2);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
  margin-bottom: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.evals-response-meta {
  display: flex;
  gap: 6px;
}

.evals-meta-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--settings-rule-soft);
  color: var(--settings-ink-4);
  font-weight: 520;
}

.evals-meta-badge.has-tools {
  background: var(--ui-status-success-bg);
  color: var(--ui-status-success-fg, #27ae60);
}

.evals-meta-badge.no-tools {
  background: var(--ui-status-danger-bg);
  color: var(--ui-status-danger-fg, #e74c3c);
}

.evals-expect-builder {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.evals-expect-group {
  border: 1px solid var(--settings-rule-soft);
  border-radius: 5px;
  padding: 8px 10px;
  background: var(--settings-paper-3);
}

.evals-expect-group-title {
  font-size: 11px;
  font-weight: 620;
  color: var(--settings-ink-3);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.evals-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--settings-ink-2);
  padding: 3px 0;
}

.evals-checkbox input[type="checkbox"] {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.evals-auto-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--ui-status-info-bg, color-mix(in srgb, #3498db 15%, transparent));
  color: var(--ui-status-info-fg, #3498db);
  font-weight: 600;
}

.evals-form-label-sm {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--settings-ink-3);
}

.evals-num-input {
  width: 60px;
  padding: 3px 6px;
  border: 1px solid var(--settings-rule);
  border-radius: 4px;
  background: var(--settings-paper);
  color: var(--settings-ink);
  font-size: 12px;
  font-family: inherit;
}

.evals-snapshot-links {
  display: flex;
  gap: 12px;
  padding: 6px 0;
}

.evals-link {
  font-size: 12px;
  color: var(--settings-accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.evals-link:hover {
  opacity: 0.8;
}
</style>
