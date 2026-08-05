<template>
  <div class="skills-ledger">
    <!-- Header -->
    <header class="ledger-header">
      <div class="ledger-heading">
        <p class="ledger-sub">
          Reusable agent workflows loaded from <code>SKILL.md</code> folders.
        </p>
      </div>
      <div class="ledger-actions">
        <button
          class="text-action"
          type="button"
          :disabled="store.isLoading.value"
          @click="store.refresh()"
        >
          {{ store.isLoading.value ? 'loading…' : 'refresh' }}
        </button>
        <button
          class="text-action"
          type="button"
          @click="store.openSkillDirectory()"
        >
          user folder
        </button>
      </div>
    </header>

    <!-- Master switch -->
    <div class="master-row">
      <button
        class="enable-dot"
        type="button"
        :class="{ 'is-on': skillsEnabled }"
        :aria-pressed="skillsEnabled"
        :aria-label="skillsEnabled ? 'Skills enabled — click to disable' : 'Skills disabled — click to enable'"
        @click="toggleSkillsEnabled"
      />
      <span
        class="master-label"
        @click="toggleSkillsEnabled"
      >Enable skills</span>
      <span class="master-hint">{{ skillsEnabled ? 'Skills are offered to the model per session.' : 'No skills are loaded into any session.' }}</span>
    </div>

    <ErrorNote
      v-if="store.lastError.value"
      class="ledger-error"
      :message="store.lastError.value"
    />

    <div
      class="ledger-body"
      :class="{ 'is-muted': !skillsEnabled }"
    >
      <!-- Directories -->
      <section class="ledger-group">
        <h3 class="group-header">
          <span class="group-title">Directories</span>
          <span class="group-count">{{ directoryCount }}</span>
        </h3>

        <div class="group-rows">
          <!-- Fixed app-owned roots (read-only) -->
          <div
            v-for="root in fixedRoots"
            :key="root.id"
            class="dir-row is-fixed"
          >
            <span class="dir-name">{{ root.label }}</span>
            <span class="dir-path">{{ root.path }}</span>
            <span class="dir-tag">{{ root.tag }}</span>
          </div>

          <!-- Custom directories -->
          <div
            v-for="dir in store.directories.value"
            :key="dir.id"
            class="dir-row"
            :class="{ 'is-off': !dir.enabled }"
          >
            <span class="dir-name">{{ dir.label || basename(dir.path) }}</span>
            <span class="dir-path">{{ dir.path }}</span>
            <Select
              v-bind="ROW_SELECT"
              class="agent-select"
              :model-value="dir.agentId ?? ''"
              :options="agentOptions"
              aria-label="Bind skills from this directory to an agent"
              @update:model-value="onDirectoryAgentChange(dir.id, String($event ?? ''))"
            />
            <span class="dir-actions">
              <button
                class="text-action"
                type="button"
                @click="store.openPath(dir.path)"
              >
                folder
              </button>
              <button
                class="text-action is-danger"
                type="button"
                @click="confirmRemoveDirectory(dir)"
              >
                remove
              </button>
              <button
                class="enable-dot"
                type="button"
                :class="{ 'is-on': dir.enabled }"
                :aria-pressed="dir.enabled"
                :aria-label="dir.enabled ? 'Directory enabled — click to disable' : 'Directory disabled — click to enable'"
                @click="store.updateDirectory({ id: dir.id, enabled: !dir.enabled })"
              />
            </span>
          </div>

          <!-- Add-directory line -->
          <button
            class="add-row"
            type="button"
            @click="showAddDialog = true"
          >
            + add directory
          </button>
        </div>
      </section>

      <!-- Skills -->
      <section class="ledger-group">
        <h3 class="group-header">
          <span class="group-title">Skills</span>
          <span class="group-count">{{ store.skills.value.length }}</span>
        </h3>

        <p
          v-if="store.isLoading.value && store.skills.value.length === 0"
          class="ledger-note"
        >
          loading…
        </p>
        <p
          v-else-if="store.skills.value.length === 0"
          class="ledger-note"
        >
          No skills found. Add <code>SKILL.md</code> folders to a skills directory above.
        </p>

        <div
          v-for="group in skillGroups"
          :key="group.source"
          class="skill-group"
        >
          <div class="skill-group-header">
            <span class="skill-group-title">{{ group.title }}</span>
            <span class="skill-group-path">{{ group.hint }}</span>
            <span class="group-count">{{ group.skills.length }}</span>
          </div>
          <ul class="group-rows skill-rows">
            <SkillLedgerRow
              v-for="skill in group.skills"
              :key="skill.id"
              :skill="skill"
              :agents="store.agents.value"
              :agent-label="store.agentName(skill.agentId)"
              :expanded="expandedSkills.has(skill.id)"
              :can-delete="skill.source === 'user' || skill.source === 'project'"
              @toggle-expand="toggleExpanded(skill.id)"
              @toggle-enabled="enabled => store.toggleSkillEnabled(skill, enabled)"
              @set-agent="agentId => store.setSkillAgent(skill, agentId)"
              @delete="confirmDeleteSkill(skill)"
              @open-directory="store.openSkillDirectory(skill.id)"
            />
          </ul>
        </div>
      </section>
    </div>

    <!-- Add directory dialog -->
    <AddSkillDirectoryDialog
      :visible="showAddDialog"
      :agents="store.agents.value"
      :can-browse="canBrowse"
      :pick-directory="store.pickDirectory"
      :add-directory="store.addDirectory"
      @close="showAddDialog = false"
    />

    <!-- Delete / remove confirmations are `useConfirm()` since P2. -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import type { SkillDefinition, SkillDirectoryConfig, SkillSettings, SkillSource } from '@/types'
import { platformApi } from '@/platform'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Select from '@/components/common/Select.vue'
import type { SelectOptionLike } from '@/components/common/select'
import SkillLedgerRow from './SkillLedgerRow.vue'
import AddSkillDirectoryDialog from './AddSkillDirectoryDialog.vue'
import { useSkills } from './useSkills'

interface Props {
  settings: SkillSettings
}

interface Emits {
  (e: 'update:settings', value: SkillSettings): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const store = useSkills(() => props.settings, emit)

const expandedSkills = ref<Set<string>>(new Set())
const showAddDialog = ref(false)

const { confirm } = useConfirm()

/**
 * One spelling of "the agent binding dropdown on a ledger row". `underline` is
 * what the hand-rolled `.agent-select` drew (a hairline, no frame); `teleported`
 * is not optional because these rows live inside the settings scroll container
 * and an in-flow panel would be clipped by it.
 */
const ROW_SELECT = {
  variant: 'underline',
  size: 'small',
  teleported: true,
  fitInputWidth: true,
} as const

const agentOptions = computed<SelectOptionLike[]>(() => [
  { value: '', label: 'All agents' },
  ...store.agents.value.map(agent => ({ value: agent.id, label: agent.name })),
])

const canBrowse = computed(() => platformApi.environment === 'electron')
const skillsEnabled = computed(() => props.settings.enableSkills !== false)
const directoryCount = computed(() => fixedRoots.length + store.directories.value.length)

const fixedRoots = [
  { id: 'user', label: 'User skills', path: '~/.onething/skills/', tag: 'built-in root' },
  { id: 'project', label: 'Project skills', path: '<workspace>/.onething/skills/', tag: 'built-in root' },
] as const

const SOURCE_GROUPS: Array<{ source: SkillSource; title: string; hint: string }> = [
  { source: 'project', title: 'Project', hint: '.onething/skills/' },
  { source: 'user', title: 'User', hint: '~/.onething/skills/' },
  { source: 'custom', title: 'Custom directories', hint: 'manually added roots' },
  { source: 'plugin', title: 'Plugins', hint: 'plugin-provided roots' },
  { source: 'builtin', title: 'Built-in', hint: 'app resources' },
]

const skillGroups = computed(() =>
  SOURCE_GROUPS
    .map(group => ({
      ...group,
      skills: store.skills.value.filter(skill => skill.source === group.source),
    }))
    .filter(group => group.skills.length > 0),
)

function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return index === -1 ? trimmed : trimmed.slice(index + 1)
}

function toggleSkillsEnabled() {
  emit('update:settings', {
    ...props.settings,
    enableSkills: !skillsEnabled.value,
  })
}

function toggleExpanded(skillId: string) {
  const next = new Set(expandedSkills.value)
  if (next.has(skillId)) {
    next.delete(skillId)
  } else {
    next.add(skillId)
  }
  expandedSkills.value = next
}

function onDirectoryAgentChange(directoryId: string, value: string) {
  void store.updateDirectory({ id: directoryId, agentId: value || null })
}

async function confirmDeleteSkill(skill: SkillDefinition) {
  const accepted = await confirm({
    title: 'Delete skill',
    message: `Delete "${skill.name}"? The entire skill folder is removed from disk and cannot be restored.`,
    confirmText: 'delete',
    danger: true,
    variant: 'paper',
  })
  if (!accepted) return
  await store.deleteSkill(skill.id)
}

async function confirmRemoveDirectory(dir: SkillDirectoryConfig) {
  const accepted = await confirm({
    title: 'Remove directory',
    message: `Stop loading skills from "${dir.label || dir.path}"? Files on disk are not touched.`,
    confirmText: 'remove',
    danger: true,
    variant: 'paper',
  })
  if (!accepted) return
  await store.removeDirectory(dir.id)
}

onMounted(() => {
  void store.loadAll()
})
</script>

<style scoped>
/*
 * Skills ledger — 画线风.
 * No background fills, no radii: state lives in the line.
 * One vertical ink rule carries directories and skills as ledger rows.
 */
.skills-ledger {
  animation: ledger-fade 0.15s ease;
}

@keyframes ledger-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- header ---- */
.ledger-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.ledger-sub {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg);
}

.ledger-sub code,
.ledger-note code {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-primary-fg);
}

.ledger-actions {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
  padding-bottom: 2px;
}

/* ---- master switch ---- */
.master-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 0 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 45%, transparent);
  margin-bottom: 18px;
}

.master-row .enable-dot {
  align-self: center;
}

.master-label {
  font-size: 13px;
  font-weight: var(--font-weight-medium, 500);
  color: var(--ui-text-primary-fg);
  cursor: pointer;
}

.master-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

/* positioning only — visuals come from ErrorNote */
.ledger-error {
  margin: 0 0 12px;
}

/* ---- the ledger rule ---- */
.ledger-body {
  position: relative;
  padding-left: 16px;
  transition: opacity var(--duration-normal) var(--ease-default);
}

.ledger-body::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border) 72%, transparent);
}

.ledger-body.is-muted {
  opacity: 0.45;
}

/* ---- groups ---- */
.ledger-group {
  margin-bottom: 26px;
}

.ledger-group:last-child {
  margin-bottom: 0;
}

/* Section header: a longer, heavier tick marks the heading. */
.group-header {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg);
}

.group-header::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 10px;
  height: 2px;
  background: var(--ui-border-strong-border);
}

.group-count {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: var(--font-weight-normal, 400);
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

.ledger-note {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg);
}

/* ---- directory rows ---- */
.dir-row {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 30px;
  padding: 5px 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--ui-border-subtle-border)) 32%, transparent);
}

.dir-row:first-child {
  border-top: none;
}

/* Tick hanging the row on the rule */
.dir-row::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border);
  transition: width var(--duration-fast) var(--ease-default), background-color var(--duration-fast) var(--ease-default);
}

.dir-row:hover::before {
  width: 12px;
  background: var(--ui-text-muted-fg);
}

.dir-name {
  font-size: 13px;
  color: var(--ui-text-primary-fg);
  white-space: nowrap;
}

.dir-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

.dir-tag {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  white-space: nowrap;
}

.dir-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-default);
}

.dir-row:hover .dir-actions,
.dir-actions:focus-within {
  opacity: 1;
}

.dir-actions .enable-dot {
  align-self: center;
}

/* Disabled directory: dashed strike-through language */
.dir-row.is-off .dir-name,
.dir-row.is-off .dir-path {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--ui-text-faint-fg, var(--ui-text-muted-fg)) 60%, transparent);
}

/* Keep the toggle for disabled rows visible so state is discoverable */
.dir-row.is-off .dir-actions {
  opacity: 1;
}

/* Add row: pure text, underline on hover */
.add-row {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  appearance: none;
  background: transparent;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--ui-border-subtle-border)) 32%, transparent);
  padding: 8px 0 4px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default);
}

.add-row::before {
  content: '';
  position: absolute;
  left: -13px;
  top: calc(50% + 2px);
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border);
  transition: width var(--duration-fast) var(--ease-default), background-color var(--duration-fast) var(--ease-default);
}

.add-row:hover {
  color: var(--ui-text-primary-fg);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg);
}

.add-row:hover::before {
  width: 12px;
  background: var(--ui-accent-primary-fg);
}

/* ---- skill source sub-groups ---- */
.skill-group {
  margin-bottom: 14px;
}

.skill-group:last-child {
  margin-bottom: 0;
}

.skill-group-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
}

.skill-group-title {
  font-size: 12px;
  font-weight: var(--font-weight-medium, 500);
  color: var(--ui-text-muted-fg);
}

.skill-group-path {
  flex: 1;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

/* ---- skill rows (blueprint numbering) ---- */
.skill-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: skill-row;
}

:deep(.skill-row) {
  position: relative;
  counter-increment: skill-row;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--ui-border-subtle-border)) 32%, transparent);
}

/* Tick hanging each skill row on the rule */
:deep(.skill-row)::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 15px;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border);
  transition: width var(--duration-fast) var(--ease-default), height var(--duration-fast) var(--ease-default), background-color var(--duration-fast) var(--ease-default);
}

:deep(.skill-row:hover)::before {
  width: 12px;
  background: var(--ui-text-muted-fg);
}

:deep(.skill-row.is-expanded)::before {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg);
}

:deep(.row-line) {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 30px;
  padding: 6px 0;
  cursor: pointer;
}

/* Figure number, like rows on a blueprint sheet */
:deep(.row-line)::before {
  content: counter(skill-row, decimal-leading-zero);
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  flex-shrink: 0;
  min-width: 16px;
}

:deep(.row-name) {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-primary-fg);
  white-space: nowrap;
}

:deep(.skill-row.is-disabled .row-name) {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--ui-text-faint-fg, var(--ui-text-muted-fg)) 60%, transparent);
}

/* Agent chip: outlined ring, zero fill — accent marks the binding */
:deep(.agent-chip) {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 7px 3px;
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg) 65%, transparent);
  border-radius: 9px;
  color: var(--ui-accent-primary-fg);
  background: transparent;
  white-space: nowrap;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.row-desc) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ui-text-muted-fg);
}

:deep(.skill-row:hover .row-desc) {
  color: var(--ui-text-primary-fg);
}

:deep(.row-actions) {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-default);
  cursor: default;
}

:deep(.skill-row:hover .row-actions),
:deep(.skill-row.is-expanded .row-actions),
:deep(.row-actions:focus-within) {
  opacity: 1;
}

:deep(.skill-row.is-disabled .row-actions) {
  opacity: 1;
}

/* ---- expanded detail ---- */
:deep(.row-detail) {
  padding: 2px 0 12px 26px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

:deep(.detail-description) {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ui-text-primary-fg);
  white-space: pre-wrap;
  word-break: break-word;
}

:deep(.detail-meta) {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 11px;
}

:deep(.meta-label) {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  min-width: 42px;
}

:deep(.meta-value) {
  color: var(--ui-text-muted-fg);
  word-break: break-word;
}

:deep(.meta-path) {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  text-align: left;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  word-break: break-all;
}

:deep(.meta-path:hover) {
  color: var(--ui-text-primary-fg);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg);
}

/* Instructions: a quoted excerpt held by a left rule, no filled block */
:deep(.detail-instructions) {
  margin: 4px 0 0;
  padding: 2px 0 2px 10px;
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 55%, transparent);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.6;
  color: var(--ui-text-muted-fg);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow-y: auto;
}

/* ---- shared controls ---- */
/* Ink-dot toggle: solid accent ring with a center dot when on, dashed empty ring when off */
.enable-dot,
:deep(.enable-dot) {
  appearance: none;
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  padding: 0;
  border-radius: 50%;
  border: 1px dashed var(--ui-border-default-border);
  background: transparent;
  cursor: pointer;
  position: relative;
  transition: border-color var(--duration-fast) var(--ease-default);
}

.enable-dot.is-on,
:deep(.enable-dot.is-on) {
  border-style: solid;
  border-color: var(--ui-accent-primary-fg);
}

.enable-dot.is-on::after,
:deep(.enable-dot.is-on)::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--ui-accent-primary-fg);
}

.enable-dot:hover,
:deep(.enable-dot:hover) {
  border-color: var(--ui-accent-primary-fg);
}

.text-action,
:deep(.text-action) {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default);
}

.text-action:hover:not(:disabled),
:deep(.text-action:hover:not(:disabled)) {
  color: var(--ui-text-primary-fg);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg);
}

.text-action.is-danger:hover:not(:disabled),
:deep(.text-action.is-danger:hover:not(:disabled)) {
  color: var(--ui-status-danger-fg);
  text-decoration-color: var(--ui-status-danger-fg);
}

.text-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* P3: the agent binding dropdown is `<Select variant="underline">` — it owns
   the hairline, the hover ink and the caret. Only its footprint is set here
   (the `:deep()` twin reaches the same control inside SkillLedgerRow). */
.agent-select,
:deep(.agent-select) {
  max-width: 140px;
}

@media (prefers-reduced-motion: reduce) {
  .skills-ledger {
    animation: none;
  }
}
</style>
