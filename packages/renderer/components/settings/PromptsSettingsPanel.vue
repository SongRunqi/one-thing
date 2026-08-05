<template>
  <div class="prompts-settings">
    <SettingsSection
      title="Prompt Snippets"
      description="Create reusable prompts that can be inserted from Search Everywhere or the composer."
    >
      <div class="prompt-toolbar">
        <label class="prompt-search">
          <Search :size="14" />
          <input
            v-model="query"
            type="search"
            placeholder="Search prompts"
          >
        </label>
        <Button
          unstyled
          class="prompt-primary-btn"
          native-type="button"
          @click="startCreate"
        >
          <Plus :size="14" />
          <span>New Prompt</span>
        </Button>
      </div>
    </SettingsSection>

    <section class="prompt-workspace">
      <aside class="prompt-list-panel">
        <div class="prompt-list-header">
          <span>{{ filteredPrompts.length }} prompts</span>
          <span v-if="query.trim()">filtered</span>
        </div>

        <div class="prompt-list">
          <Button
            v-for="prompt in filteredPrompts"
            :key="prompt.id"
            unstyled
            class="prompt-row"
            :class="{ active: selectedId === prompt.id }"
            native-type="button"
            @click="selectPrompt(prompt.id)"
          >
            <span class="prompt-row-top">
              <span class="prompt-row-title">{{ prompt.title }}</span>
              <span class="prompt-row-date">{{ formatUpdatedAt(prompt.updatedAt) }}</span>
            </span>
            <span class="prompt-row-preview">{{ promptPreview(prompt) }}</span>
            <span
              v-if="prompt.tags?.length"
              class="prompt-tags"
            >
              <span
                v-for="tag in prompt.tags.slice(0, 3)"
                :key="tag"
              >{{ tag }}</span>
            </span>
          </Button>

          <SettingsEmptyState
            v-if="!isLoading && promptsStore.prompts.length === 0"
            title="No prompts yet"
            description="Create a prompt snippet to reuse it from Search Everywhere or the composer."
          >
            <template #icon>
              <NotebookPen :size="16" />
            </template>
            <template #actions>
              <Button
                unstyled
                class="prompt-secondary-btn"
                native-type="button"
                @click="startCreate"
              >
                Create Prompt
              </Button>
            </template>
          </SettingsEmptyState>

          <SettingsEmptyState
            v-else-if="!isLoading && filteredPrompts.length === 0"
            title="No matching prompts"
            description="Try a different title, tag, or prompt body search."
          >
            <template #icon>
              <Search :size="16" />
            </template>
          </SettingsEmptyState>
        </div>
      </aside>

      <form
        class="prompt-editor-panel"
        @submit.prevent="savePrompt"
      >
        <header class="prompt-editor-header">
          <div>
            <h3>{{ editingId ? 'Edit Prompt' : 'New Prompt' }}</h3>
            <p>{{ editingId ? 'Changes apply to future insertions. Sent messages keep their snapshot.' : 'Draft a reusable prompt snippet.' }}</p>
          </div>
          <span
            v-if="notice"
            class="prompt-notice"
            :class="notice.type"
          >
            {{ notice.message }}
          </span>
        </header>

        <SettingsGroup class="prompt-form-group">
          <SettingRow layout="stack">
            <SettingsField label="Name">
              <input
                v-model="form.title"
                class="prompt-input"
                type="text"
                placeholder="Code review checklist"
              >
            </SettingsField>
          </SettingRow>

          <SettingRow layout="stack">
            <SettingsField label="Description">
              <input
                v-model="form.description"
                class="prompt-input"
                type="text"
                placeholder="Optional short preview"
              >
            </SettingsField>
          </SettingRow>

          <SettingRow layout="stack">
            <SettingsField
              label="Tags"
              hint="Separate tags with commas."
            >
              <input
                v-model="tagsInput"
                class="prompt-input"
                type="text"
                placeholder="writing, code, planning"
              >
            </SettingsField>
          </SettingRow>

          <SettingRow layout="stack">
            <SettingsField label="Prompt">
              <textarea
                v-model="form.body"
                class="prompt-textarea"
                rows="14"
                placeholder="Write the reusable prompt text..."
              />
            </SettingsField>
          </SettingRow>

          <SettingsActionBar>
            <template #status>
              <span
                v-if="confirmingDelete"
                class="delete-confirmation"
              >
                Delete this prompt? This cannot be undone.
              </span>
              <span v-else-if="error">{{ error }}</span>
              <span v-else>{{ editingId ? 'Saved prompts are available globally.' : 'New prompts become available immediately after saving.' }}</span>
            </template>

            <Button
              v-if="editingId"
              unstyled
              class="prompt-danger-btn"
              native-type="button"
              @click="handleDeleteClick"
            >
              <Trash2 :size="14" />
              <span>{{ confirmingDelete ? 'Delete' : 'Delete Prompt' }}</span>
            </Button>
            <Button
              v-if="confirmingDelete"
              unstyled
              class="prompt-secondary-btn"
              native-type="button"
              @click="confirmingDelete = false"
            >
              Cancel
            </Button>
            <Button
              unstyled
              class="prompt-primary-btn"
              native-type="submit"
              :disabled="isSaving"
            >
              <Save :size="14" />
              <span>{{ isSaving ? 'Saving...' : 'Save Prompt' }}</span>
            </Button>
          </SettingsActionBar>
        </SettingsGroup>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { NotebookPen, Plus, Save, Search, Trash2 } from 'lucide-vue-next'
import { usePromptsStore } from '@/stores/prompts'
import type { UserPrompt } from '@/types'
import {
  SettingRow,
  SettingsActionBar,
  SettingsEmptyState,
  SettingsField,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'

const promptsStore = usePromptsStore()
const query = ref('')
const selectedId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const isSaving = ref(false)
const error = ref('')
const tagsInput = ref('')
const confirmingDelete = ref(false)
const notice = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const form = ref({
  title: '',
  description: '',
  body: '',
})

const isLoading = computed(() => promptsStore.isLoading)

const filteredPrompts = computed(() => {
  const q = query.value.trim().toLowerCase()
  const prompts = promptsStore.prompts
  if (!q) return prompts
  return prompts.filter(prompt =>
    [
      prompt.title,
      prompt.description || '',
      prompt.body,
      ...(prompt.tags || []),
    ].join(' ').toLowerCase().includes(q)
  )
})

function parseTags(): string[] | undefined {
  const tags = tagsInput.value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
  return tags.length > 0 ? tags : undefined
}

function clearNotice() {
  notice.value = null
  error.value = ''
}

function startCreate() {
  selectedId.value = null
  editingId.value = null
  confirmingDelete.value = false
  form.value = { title: '', description: '', body: '' }
  tagsInput.value = ''
  clearNotice()
}

function selectPrompt(id: string) {
  const prompt = promptsStore.promptMap.get(id)
  if (!prompt) return
  selectedId.value = id
  editingId.value = id
  confirmingDelete.value = false
  form.value = {
    title: prompt.title,
    description: prompt.description || '',
    body: prompt.body,
  }
  tagsInput.value = (prompt.tags || []).join(', ')
  clearNotice()
}

async function savePrompt() {
  const title = form.value.title.trim()
  const body = form.value.body.trim()
  if (!title) {
    error.value = 'Name is required.'
    notice.value = { type: 'error', message: 'Name is required.' }
    return
  }
  if (!body) {
    error.value = 'Prompt is required.'
    notice.value = { type: 'error', message: 'Prompt is required.' }
    return
  }

  isSaving.value = true
  clearNotice()
  try {
    const payload = {
      title,
      body,
      description: form.value.description.trim() || undefined,
      tags: parseTags(),
    }
    const saved = editingId.value
      ? await promptsStore.updatePrompt({ id: editingId.value, ...payload })
      : await promptsStore.createPrompt(payload)
    if (!saved) {
      const message = promptsStore.error || 'Failed to save prompt.'
      error.value = message
      notice.value = { type: 'error', message }
      return
    }
    selectPrompt(saved.id)
    notice.value = { type: 'success', message: 'Prompt saved.' }
  } finally {
    isSaving.value = false
  }
}

async function handleDeleteClick() {
  if (!editingId.value) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }

  const deleted = await promptsStore.deletePrompt(editingId.value)
  if (!deleted) {
    const message = promptsStore.error || 'Failed to delete prompt.'
    error.value = message
    notice.value = { type: 'error', message }
    return
  }
  startCreate()
  notice.value = { type: 'success', message: 'Prompt deleted.' }
}

function promptPreview(prompt: UserPrompt): string {
  return (prompt.description || prompt.body || 'No preview')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatUpdatedAt(timestamp: number): string {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

watch(filteredPrompts, prompts => {
  if (selectedId.value && prompts.some(prompt => prompt.id === selectedId.value)) return
  if (!editingId.value && prompts.length > 0) selectPrompt(prompts[0].id)
})

watch([() => form.value.title, () => form.value.description, () => form.value.body, tagsInput], () => {
  confirmingDelete.value = false
})

onMounted(async () => {
  await promptsStore.loadPrompts()
  if (promptsStore.prompts.length > 0) selectPrompt(promptsStore.prompts[0].id)
})
</script>

<style scoped>
/* Prompts ledger — 画线风: no fills, no radii, state lives in the line. */
.prompts-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prompt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.prompt-search {
  flex: 1;
  min-width: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  transition: border-color var(--duration-fast) var(--ease-default);
}

.prompt-search:focus-within {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.prompt-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font: inherit;
  font-size: 13px;
}

.prompt-workspace {
  min-height: 520px;
  display: grid;
  grid-template-columns: minmax(220px, 0.88fr) minmax(0, 1.35fr);
  border: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border)));
  border-radius: 0;
  background: transparent;
  overflow: hidden;
}

.prompt-list-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border)));
}

.prompt-list-header {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border)));
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.prompt-list {
  min-height: 0;
  overflow: auto;
}

/* Ledger rows: hairline separators, selection is a left ink rule. */
.prompt-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border))) 55%, transparent);
  border-radius: 0;
  background: transparent;
  color: inherit;
  padding: 9px 12px;
  text-align: left;
  cursor: pointer;
}

.prompt-row:hover .prompt-row-preview {
  color: var(--settings-ink-2, var(--ui-text-secondary-fg));
}

.prompt-row.active {
  background: transparent;
  box-shadow: inset 2px 0 0 var(--settings-accent, var(--ui-accent-primary-fg));
}

.prompt-row-top {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-row-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-row-date {
  flex-shrink: 0;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
}

.prompt-row-preview {
  overflow: hidden;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* Tag rings: outlined, zero fill. */
.prompt-tags span {
  max-width: 92px;
  overflow: hidden;
  padding: 1px 7px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 999px;
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-editor-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
}

.prompt-editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.prompt-editor-header h3 {
  margin: 0;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 15px;
  font-weight: 650;
}

.prompt-editor-header p {
  margin: 4px 0 0;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 12px;
  line-height: 1.4;
}

/* Notice rings: outlined status, no fills. */
.prompt-notice {
  flex-shrink: 0;
  padding: 2px 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  font-size: 11px;
  font-weight: 650;
}

.prompt-notice.success {
  border-color: var(--ui-status-success-border, var(--ui-status-success-fg));
  color: var(--ui-status-success-fg, var(--success));
}

.prompt-notice.error {
  border-color: var(--ui-status-danger-border, var(--ui-status-danger-fg));
}

.prompt-notice.error,
.delete-confirmation {
  color: var(--ui-status-danger-fg, var(--danger));
}

.prompt-form-group {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Drafting-box fields: square, transparent, focus moves the line to accent. */
.prompt-input,
.prompt-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  outline: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  padding: 8px 9px;
  transition: border-color var(--duration-fast) var(--ease-default);
}

.prompt-textarea {
  min-height: 190px;
  resize: vertical;
}

input.prompt-input:focus,
textarea.prompt-textarea:focus {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
  box-shadow: none;
}

/* Visuals (square corners, line borders, accent primary) come from the
   SettingsPage :deep() layer; only layout lives here. */
.prompt-primary-btn,
.prompt-secondary-btn,
.prompt-danger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
}

.prompt-primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 860px) {
  .prompt-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .prompt-list-panel {
    max-height: 280px;
    border-right: 0;
    border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border)));
  }
}
</style>
