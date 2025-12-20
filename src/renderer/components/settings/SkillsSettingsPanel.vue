<template>
  <div class="skills-settings">
    <!-- Global Skills Toggle -->
    <section class="settings-section">
      <h3 class="section-title">Skills Settings</h3>

      <div class="form-group">
        <div class="toggle-row">
          <label class="form-label">Enable Skills</label>
          <label class="toggle">
            <input
              type="checkbox"
              v-model="localSkillsEnabled"
              @change="handleEnableChange"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="form-hint">Enable skills to use prompt templates and workflows with trigger commands</p>
      </div>
    </section>

    <!-- Skills List -->
    <section class="settings-section" v-if="localSkillsEnabled">
      <div class="section-header">
        <h3 class="section-title">Available Skills</h3>
        <button class="add-skill-btn" @click="openAddSkillDialog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Add Skill
        </button>
      </div>

      <div v-if="skills.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <p>No skills available</p>
        <p class="hint">Add custom skills or enable built-in ones</p>
      </div>

      <!-- Built-in Skills -->
      <div v-else>
        <div v-if="builtinSkills.length > 0" class="skill-group">
          <div class="group-header">
            <span class="group-title">Built-in Skills</span>
            <span class="group-count">{{ builtinSkills.length }}</span>
          </div>
          <div class="skills-list">
            <div
              v-for="skill in builtinSkills"
              :key="skill.id"
              :class="['skill-item', { expanded: expandedSkills.has(skill.id) }]"
            >
              <div class="skill-header" @click="toggleSkillExpanded(skill.id)">
                <div class="skill-info">
                  <div class="skill-details">
                    <div class="skill-name">{{ skill.name }}</div>
                    <div class="skill-meta">
                      <span class="type-badge" :class="skill.type">
                        {{ skill.type === 'prompt-template' ? 'Template' : 'Workflow' }}
                      </span>
                      <span class="triggers">{{ skill.triggers.join(', ') }}</span>
                    </div>
                  </div>
                </div>
                <div class="skill-actions">
                  <label class="toggle small" @click.stop title="Enable/Disable">
                    <input
                      type="checkbox"
                      :checked="skill.enabled"
                      @change="toggleSkillEnabled(skill.id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                  <svg
                    class="expand-chevron"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              <!-- Expanded Content -->
              <div v-if="expandedSkills.has(skill.id)" class="skill-expanded">
                <div class="skill-description">{{ skill.description }}</div>
                <div v-if="skill.category" class="skill-category">
                  <span class="label">Category:</span> {{ skill.category }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- User Skills -->
        <div v-if="userSkills.length > 0" class="skill-group">
          <div class="group-header">
            <span class="group-title">Custom Skills</span>
            <span class="group-count">{{ userSkills.length }}</span>
          </div>
          <div class="skills-list">
            <div
              v-for="skill in userSkills"
              :key="skill.id"
              :class="['skill-item', { expanded: expandedSkills.has(skill.id) }]"
            >
              <div class="skill-header" @click="toggleSkillExpanded(skill.id)">
                <div class="skill-info">
                  <div class="skill-details">
                    <div class="skill-name">{{ skill.name }}</div>
                    <div class="skill-meta">
                      <span class="type-badge" :class="skill.type">
                        {{ skill.type === 'prompt-template' ? 'Template' : 'Workflow' }}
                      </span>
                      <span class="triggers">{{ skill.triggers.join(', ') }}</span>
                    </div>
                  </div>
                </div>
                <div class="skill-actions">
                  <label class="toggle small" @click.stop title="Enable/Disable">
                    <input
                      type="checkbox"
                      :checked="skill.enabled"
                      @change="toggleSkillEnabled(skill.id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                  <button
                    class="icon-btn small"
                    @click.stop="openEditSkillDialog(skill)"
                    title="Edit skill"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    class="icon-btn small danger"
                    @click.stop="confirmDeleteSkill(skill.id)"
                    title="Delete skill"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                  </button>
                  <svg
                    class="expand-chevron"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              <!-- Expanded Content -->
              <div v-if="expandedSkills.has(skill.id)" class="skill-expanded">
                <div class="skill-description">{{ skill.description }}</div>
                <div v-if="skill.type === 'prompt-template'" class="template-preview">
                  <span class="label">Template:</span>
                  <pre class="template-content">{{ (skill.config as any).template }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Add/Edit Skill Dialog -->
    <Teleport to="body">
      <div v-if="showSkillDialog" class="dialog-overlay" @click.self="closeSkillDialog">
        <div class="dialog">
          <div class="dialog-header">
            <h3>{{ editingSkill ? 'Edit Skill' : 'Add Custom Skill' }}</h3>
            <button class="close-btn" @click="closeSkillDialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="dialog-content">
            <div class="form-group">
              <label class="form-label">Skill Name</label>
              <input
                v-model="skillForm.name"
                type="text"
                class="form-input"
                placeholder="My Custom Skill"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <input
                v-model="skillForm.description"
                type="text"
                class="form-input"
                placeholder="What this skill does"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Triggers</label>
              <input
                v-model="skillForm.triggersString"
                type="text"
                class="form-input"
                placeholder="/myskill, @myskill"
              />
              <p class="form-hint">Comma-separated trigger commands (e.g., /translate, @tr)</p>
            </div>

            <div class="form-group">
              <label class="form-label">Prompt Template</label>
              <textarea
                v-model="skillForm.template"
                class="form-textarea"
                rows="6"
                placeholder="Enter your prompt template. Use {{input}} for user input."
              ></textarea>
              <p class="form-hint">Use {{input}} to insert user's message, {{selection}} for selected text</p>
            </div>

            <div class="form-group">
              <label class="form-label">System Prompt (optional)</label>
              <textarea
                v-model="skillForm.systemPrompt"
                class="form-textarea"
                rows="3"
                placeholder="Optional system prompt to guide AI behavior"
              ></textarea>
            </div>

            <div v-if="skillDialogError" class="error-message">
              {{ skillDialogError }}
            </div>
          </div>

          <div class="dialog-footer">
            <button class="btn secondary" @click="closeSkillDialog">Cancel</button>
            <button class="btn primary" @click="saveSkill" :disabled="isSavingSkill">
              {{ isSavingSkill ? 'Saving...' : (editingSkill ? 'Save Changes' : 'Add Skill') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Dialog -->
    <Teleport to="body">
      <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
        <div class="dialog small">
          <div class="dialog-header">
            <h3>Delete Skill</h3>
          </div>
          <div class="dialog-content">
            <p>Are you sure you want to delete this skill? This action cannot be undone.</p>
          </div>
          <div class="dialog-footer">
            <button class="btn secondary" @click="showDeleteDialog = false">Cancel</button>
            <button class="btn danger" @click="deleteSkill">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { SkillDefinition, SkillSettings, PromptTemplateConfig } from '@/types'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  settings: SkillSettings
}

interface Emits {
  (e: 'update:settings', value: SkillSettings): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Local state
const localSkillsEnabled = ref(props.settings?.enableSkills ?? true)
const skills = ref<SkillDefinition[]>([])
const expandedSkills = ref<Set<string>>(new Set())

// Computed
const builtinSkills = computed(() => skills.value.filter(s => s.source === 'builtin'))
const userSkills = computed(() => skills.value.filter(s => s.source === 'user'))

// Dialog state
const showSkillDialog = ref(false)
const showDeleteDialog = ref(false)
const editingSkill = ref<SkillDefinition | null>(null)
const deletingSkillId = ref<string | null>(null)
const skillDialogError = ref('')
const isSavingSkill = ref(false)

// Skill form
const skillForm = ref({
  name: '',
  description: '',
  triggersString: '',
  template: '',
  systemPrompt: '',
})

// Watch for settings changes
watch(() => props.settings, (newSettings) => {
  if (newSettings) {
    localSkillsEnabled.value = newSettings.enableSkills
  }
}, { deep: true })

// Load skills on mount
onMounted(async () => {
  await loadSkills()
})

async function loadSkills() {
  try {
    const response = await window.electronAPI.getSkills()
    if (response.success && response.skills) {
      skills.value = response.skills
    }
  } catch (error) {
    console.error('Failed to load skills:', error)
  }
}

function handleEnableChange() {
  emit('update:settings', {
    ...props.settings,
    enableSkills: localSkillsEnabled.value,
  })
}

function toggleSkillExpanded(skillId: string) {
  if (expandedSkills.value.has(skillId)) {
    expandedSkills.value.delete(skillId)
  } else {
    expandedSkills.value.add(skillId)
  }
  expandedSkills.value = new Set(expandedSkills.value)
}

async function toggleSkillEnabled(skillId: string, enabled: boolean) {
  const skill = skills.value.find(s => s.id === skillId)
  if (!skill) return

  // Update local state
  skill.enabled = enabled

  // Update settings
  const updatedSkillSettings = { ...props.settings.skills }
  updatedSkillSettings[skillId] = { enabled }
  emit('update:settings', {
    ...props.settings,
    skills: updatedSkillSettings,
  })

  // If it's a user skill, also update in backend
  if (skill.source === 'user') {
    try {
      await window.electronAPI.updateUserSkill(skillId, { enabled })
    } catch (error) {
      console.error('Failed to update skill:', error)
    }
  }
}

function openAddSkillDialog() {
  editingSkill.value = null
  skillDialogError.value = ''
  skillForm.value = {
    name: '',
    description: '',
    triggersString: '',
    template: '',
    systemPrompt: '',
  }
  showSkillDialog.value = true
}

function openEditSkillDialog(skill: SkillDefinition) {
  editingSkill.value = skill
  skillDialogError.value = ''
  const config = skill.config as PromptTemplateConfig
  skillForm.value = {
    name: skill.name,
    description: skill.description,
    triggersString: skill.triggers.join(', '),
    template: config.template || '',
    systemPrompt: config.systemPrompt || '',
  }
  showSkillDialog.value = true
}

function closeSkillDialog() {
  showSkillDialog.value = false
  editingSkill.value = null
  skillDialogError.value = ''
}

async function saveSkill() {
  // Validate
  if (!skillForm.value.name.trim()) {
    skillDialogError.value = 'Skill name is required'
    return
  }

  if (!skillForm.value.triggersString.trim()) {
    skillDialogError.value = 'At least one trigger is required'
    return
  }

  if (!skillForm.value.template.trim()) {
    skillDialogError.value = 'Prompt template is required'
    return
  }

  isSavingSkill.value = true
  skillDialogError.value = ''

  try {
    const triggers = skillForm.value.triggersString
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    const skillData: Omit<SkillDefinition, 'source'> = {
      id: editingSkill.value?.id || uuidv4(),
      name: skillForm.value.name.trim(),
      description: skillForm.value.description.trim(),
      type: 'prompt-template',
      triggers,
      enabled: editingSkill.value?.enabled ?? true,
      category: 'Custom',
      config: {
        template: skillForm.value.template,
        systemPrompt: skillForm.value.systemPrompt.trim() || undefined,
        includeContext: false,
      } as PromptTemplateConfig,
    }

    let response
    if (editingSkill.value) {
      response = await window.electronAPI.updateUserSkill(skillData.id, skillData)
    } else {
      response = await window.electronAPI.addUserSkill(skillData)
    }

    if (response.success) {
      await loadSkills()
      closeSkillDialog()
    } else {
      skillDialogError.value = response.error || 'Failed to save skill'
    }
  } catch (error: any) {
    skillDialogError.value = error.message || 'Failed to save skill'
  } finally {
    isSavingSkill.value = false
  }
}

function confirmDeleteSkill(skillId: string) {
  deletingSkillId.value = skillId
  showDeleteDialog.value = true
}

async function deleteSkill() {
  if (!deletingSkillId.value) return

  try {
    const response = await window.electronAPI.deleteUserSkill(deletingSkillId.value)
    if (response.success) {
      await loadSkills()
    }
  } catch (error) {
    console.error('Failed to delete skill:', error)
  } finally {
    showDeleteDialog.value = false
    deletingSkillId.value = null
  }
}
</script>

<style scoped>
.skills-settings {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.section-header .section-title {
  margin-bottom: 0;
}

.add-skill-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: var(--accent);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-skill-btn:hover {
  background: #2563eb;
}

/* Toggle styles */
.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
}

.form-hint {
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle.small {
  width: 36px;
  height: 20px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(120, 120, 128, 0.32);
  border-radius: 12px;
  transition: 0.2s;
}

.toggle.small .toggle-slider {
  border-radius: 10px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle.small .toggle-slider:before {
  height: 16px;
  width: 16px;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--accent);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.toggle.small input:checked + .toggle-slider:before {
  transform: translateX(16px);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: var(--panel-2);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.empty-state svg {
  color: var(--muted);
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text);
}

.empty-state .hint {
  font-size: 13px;
  color: var(--muted);
  margin-top: 4px;
}

/* Skill groups */
.skill-group {
  margin-bottom: 24px;
}

.skill-group:last-child {
  margin-bottom: 0;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.group-count {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 10px;
  color: var(--muted);
}

/* Skills list */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-item {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.15s ease;
}

.skill-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.skill-item.expanded {
  border-color: var(--accent);
}

.skill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
}

.skill-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.skill-details {
  min-width: 0;
}

.skill-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.type-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(120, 120, 128, 0.2);
  color: var(--muted);
}

.type-badge.prompt-template {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.type-badge.workflow {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.triggers {
  font-size: 12px;
  color: var(--muted);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.skill-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn.small {
  width: 28px;
  height: 28px;
}

.icon-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
}

.icon-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.expand-chevron {
  transition: transform 0.2s ease;
  color: var(--muted);
}

.skill-item.expanded .expand-chevron {
  transform: rotate(180deg);
}

/* Expanded content */
.skill-expanded {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  margin-top: -1px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.skill-description {
  font-size: 13px;
  color: var(--text);
  margin-top: 12px;
  line-height: 1.5;
}

.skill-category {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
}

.skill-category .label {
  font-weight: 600;
}

.template-preview {
  margin-top: 12px;
}

.template-preview .label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  display: block;
  margin-bottom: 6px;
}

.template-content {
  font-size: 12px;
  font-family: 'SF Mono', 'Monaco', monospace;
  background: var(--hover);
  padding: 12px;
  border-radius: 8px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  max-height: 150px;
  overflow-y: auto;
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  animation: fadeIn 0.15s ease;
}

.dialog {
  width: 100%;
  max-width: 520px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.2s ease;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog.small {
  max-width: 400px;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.dialog-content {
  padding: 24px;
}

.dialog-content p {
  margin: 0;
  font-size: 14px;
  color: var(--text);
  line-height: 1.6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

/* Form inputs */
.form-input,
.form-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--panel-2);
  color: var(--text);
  transition: all 0.15s ease;
}

.form-textarea {
  resize: vertical;
  font-family: 'SF Mono', 'Monaco', monospace;
  min-height: 100px;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--muted);
}

/* Error message */
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: #ef4444;
  margin-top: 16px;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.secondary {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.danger {
  background: #ef4444;
  color: white;
}

.btn.danger:hover {
  background: #dc2626;
}
</style>
