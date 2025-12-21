<template>
  <div class="skills-settings">
    <!-- Header with actions -->
    <section class="settings-section">
      <div class="section-header">
        <div>
          <h3 class="section-title">Claude Code Skills</h3>
          <p class="section-description">
            Skills are loaded from <code>~/.claude/skills/</code> (user) and <code>.claude/skills/</code> (project)
          </p>
        </div>
        <div class="header-actions">
          <button class="action-btn" @click="refreshSkills" :disabled="isLoading" title="Refresh skills">
            <svg :class="{ spinning: isLoading }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="action-btn" @click="openSkillsDirectory" title="Open skills folder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </section>

    <!-- Skills List -->
    <section class="settings-section">
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading skills...</p>
      </div>

      <div v-else-if="skills.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <p>No skills found</p>
        <p class="hint">Add SKILL.md files to your skills directories</p>
      </div>

      <div v-else>
        <!-- User Skills -->
        <div v-if="userSkills.length > 0" class="skill-group">
          <div class="group-header">
            <span class="group-title">User Skills</span>
            <span class="group-path">~/.claude/skills/</span>
            <span class="group-count">{{ userSkills.length }}</span>
          </div>
          <div class="skills-list">
            <SkillItem
              v-for="skill in userSkills"
              :key="skill.id"
              :skill="skill"
              :expanded="expandedSkills.has(skill.id)"
              @toggle-expand="toggleSkillExpanded(skill.id)"
              @toggle-enabled="toggleSkillEnabled"
              @delete="confirmDeleteSkill"
              @open-directory="openSkillDirectory"
            />
          </div>
        </div>

        <!-- Project Skills -->
        <div v-if="projectSkills.length > 0" class="skill-group">
          <div class="group-header">
            <span class="group-title">Project Skills</span>
            <span class="group-path">.claude/skills/</span>
            <span class="group-count">{{ projectSkills.length }}</span>
          </div>
          <div class="skills-list">
            <SkillItem
              v-for="skill in projectSkills"
              :key="skill.id"
              :skill="skill"
              :expanded="expandedSkills.has(skill.id)"
              @toggle-expand="toggleSkillExpanded(skill.id)"
              @toggle-enabled="toggleSkillEnabled"
              @delete="confirmDeleteSkill"
              @open-directory="openSkillDirectory"
            />
          </div>
        </div>

        <!-- Plugin Skills -->
        <div v-if="pluginSkills.length > 0" class="skill-group">
          <div class="group-header">
            <span class="group-title">Plugin Skills</span>
            <span class="group-path">~/.claude/plugins/cache/claude-plugins-official/</span>
            <span class="group-count">{{ pluginSkills.length }}</span>
          </div>
          <div class="skills-list">
            <SkillItem
              v-for="skill in pluginSkills"
              :key="skill.id"
              :skill="skill"
              :expanded="expandedSkills.has(skill.id)"
              @toggle-expand="toggleSkillExpanded(skill.id)"
              @toggle-enabled="toggleSkillEnabled"
              @delete="confirmDeleteSkill"
              @open-directory="openSkillDirectory"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Delete Confirmation Dialog -->
    <Teleport to="body">
      <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
        <div class="dialog small">
          <div class="dialog-header">
            <h3>Delete Skill</h3>
          </div>
          <div class="dialog-content">
            <p>Are you sure you want to delete <strong>{{ deletingSkill?.name }}</strong>?</p>
            <p class="warning-text">This will delete the entire skill directory and cannot be undone.</p>
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
import { ref, computed, onMounted } from 'vue'
import type { SkillDefinition, SkillSettings } from '@/types'
import SkillItem from './SkillItem.vue'

interface Props {
  settings: SkillSettings
}

interface Emits {
  (e: 'update:settings', value: SkillSettings): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// State
const skills = ref<SkillDefinition[]>([])
const isLoading = ref(false)
const expandedSkills = ref<Set<string>>(new Set())

// Delete dialog state
const showDeleteDialog = ref(false)
const deletingSkill = ref<SkillDefinition | null>(null)

// Computed
const userSkills = computed(() => skills.value.filter(s => s.source === 'user'))
const projectSkills = computed(() => skills.value.filter(s => s.source === 'project'))
const pluginSkills = computed(() => skills.value.filter(s => s.source === 'plugin'))

// Load skills
async function loadSkills() {
  isLoading.value = true
  try {
    const response = await window.electronAPI.getSkills()
    if (response.success && response.skills) {
      skills.value = response.skills
    }
  } catch (error) {
    console.error('Failed to load skills:', error)
  } finally {
    isLoading.value = false
  }
}

// Refresh skills from filesystem
async function refreshSkills() {
  isLoading.value = true
  try {
    const response = await window.electronAPI.refreshSkills()
    if (response.success && response.skills) {
      skills.value = response.skills
    }
  } catch (error) {
    console.error('Failed to refresh skills:', error)
  } finally {
    isLoading.value = false
  }
}

// Toggle skill expanded state
function toggleSkillExpanded(skillId: string) {
  if (expandedSkills.value.has(skillId)) {
    expandedSkills.value.delete(skillId)
  } else {
    expandedSkills.value.add(skillId)
  }
  expandedSkills.value = new Set(expandedSkills.value)
}

// Toggle skill enabled state
async function toggleSkillEnabled(skillId: string, enabled: boolean) {
  try {
    await window.electronAPI.toggleSkillEnabled(skillId, enabled)
    const skill = skills.value.find(s => s.id === skillId)
    if (skill) {
      skill.enabled = enabled
    }
  } catch (error) {
    console.error('Failed to toggle skill:', error)
  }
}

// Open skills directory
async function openSkillsDirectory() {
  try {
    await window.electronAPI.openSkillDirectory()
  } catch (error) {
    console.error('Failed to open skills directory:', error)
  }
}

// Open specific skill directory
async function openSkillDirectory(skillId: string) {
  try {
    await window.electronAPI.openSkillDirectory(skillId)
  } catch (error) {
    console.error('Failed to open skill directory:', error)
  }
}

// Delete skill
function confirmDeleteSkill(skill: SkillDefinition) {
  deletingSkill.value = skill
  showDeleteDialog.value = true
}

async function deleteSkill() {
  if (!deletingSkill.value) return

  try {
    const response = await window.electronAPI.deleteSkill(deletingSkill.value.id)
    if (response.success) {
      skills.value = skills.value.filter(s => s.id !== deletingSkill.value!.id)
    }
  } catch (error) {
    console.error('Failed to delete skill:', error)
  } finally {
    showDeleteDialog.value = false
    deletingSkill.value = null
  }
}

onMounted(() => {
  loadSkills()
})
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
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 4px 0;
}

.section-description {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}

.section-description code {
  background: var(--hover);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--hover);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.action-btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
}

/* Loading state */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 16px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-state p {
  color: var(--muted);
  font-size: 14px;
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
  margin-bottom: 20px;
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
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.group-path {
  font-size: 12px;
  color: var(--muted);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.group-count {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 10px;
  color: var(--muted);
  margin-left: auto;
}

/* Skills list */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Skill item */
:deep(.skill-item) {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.15s ease;
}

:deep(.skill-item:hover) {
  border-color: rgba(255, 255, 255, 0.15);
}

:deep(.skill-item.expanded) {
  border-color: var(--accent);
}

:deep(.skill-header) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  gap: 12px;
}

:deep(.skill-info) {
  flex: 1;
  min-width: 0;
}

:deep(.skill-name) {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  font-family: 'SF Mono', 'Monaco', monospace;
}

:deep(.skill-description) {
  font-size: 13px;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:deep(.skill-actions) {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

:deep(.expand-chevron) {
  transition: transform 0.2s ease;
  color: var(--muted);
}

:deep(.skill-item.expanded .expand-chevron) {
  transform: rotate(180deg);
}

:deep(.skill-expanded) {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
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

:deep(.skill-meta) {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
}

:deep(.meta-label) {
  color: var(--muted);
  font-weight: 500;
}

:deep(.meta-value) {
  color: var(--text);
}

:deep(.meta-value.description-full) {
  display: block;
  margin-top: 4px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

:deep(.skill-instructions) {
  margin-top: 12px;
}

:deep(.instructions-content) {
  font-size: 12px;
  font-family: 'SF Mono', 'Monaco', monospace;
  background: var(--hover);
  padding: 12px;
  border-radius: 8px;
  margin: 8px 0 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  max-height: 200px;
  overflow-y: auto;
}

/* Toggle styles */
:deep(.toggle) {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

:deep(.toggle.small) {
  width: 36px;
  height: 20px;
}

:deep(.toggle input) {
  opacity: 0;
  width: 0;
  height: 0;
}

:deep(.toggle-slider) {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(120, 120, 128, 0.32);
  border-radius: 10px;
  transition: 0.2s;
}

:deep(.toggle-slider:before) {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: 0.2s;
}

:deep(.toggle input:checked + .toggle-slider) {
  background-color: var(--accent);
}

:deep(.toggle input:checked + .toggle-slider:before) {
  transform: translateX(16px);
}

/* Icon button */
:deep(.icon-btn) {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

:deep(.icon-btn:hover) {
  background: var(--hover);
  color: var(--text);
}

:deep(.icon-btn.danger:hover) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 20px;
  animation: fadeIn 0.15s ease;
}

.dialog {
  width: 100%;
  max-width: 560px;
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

.warning-text {
  color: #ef4444 !important;
  margin-top: 8px !important;
  font-size: 13px !important;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

/* Form styles */
.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
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
  min-height: 80px;
}

.form-textarea.code {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 13px;
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

/* Radio group */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.radio-option:hover {
  background: var(--hover);
}

.radio-option:has(input:checked) {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
}

.radio-option input {
  margin-top: 3px;
}

.radio-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.radio-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.radio-desc {
  font-size: 12px;
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
