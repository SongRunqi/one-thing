<template>
  <div class="skills-dropdown" ref="dropdownRef">
    <button
      class="toolbar-btn skills-btn"
      :class="{ active: skillsEnabled }"
      :title="skillsEnabled ? 'Skills enabled' : 'Skills disabled'"
      @click="togglePanel"
    >
      <SquareFunction :size="18" :stroke-width="2" />
      <span v-if="skillsEnabled" class="skills-status-dot"></span>
    </button>

    <Teleport to="body">
      <div
        v-if="showPanel"
        class="skills-menu"
        :style="panelPosition"
        @click.stop
      >
        <!-- Master toggle -->
        <div class="skills-menu-header">
          <div class="skills-menu-title">
            <SquareFunction :size="16" :stroke-width="2" />
            <span>Skills</span>
          </div>
          <label class="skills-toggle">
            <input type="checkbox" :checked="skillsEnabled" @change="toggleSkillsEnabled" />
            <span class="skills-toggle-slider"></span>
          </label>
        </div>

        <!-- Skills list (grouped by source) -->
        <div class="skills-menu-list">
          <div v-for="group in groupedSkills" :key="group.id" class="skill-group">
            <div
              class="skill-group-header"
              :class="{ collapsed: group.collapsed, disabled: !skillsEnabled }"
            >
              <div class="group-header-left" @click="toggleGroupCollapse(group.id)">
                <ChevronDown class="group-chevron" :size="12" :stroke-width="2" />
                <span class="group-name">{{ group.name }}</span>
                <span class="group-badge" :class="group.source">{{ group.sourceLabel }}</span>
                <span class="group-count">{{ group.skills.length }}</span>
              </div>
            </div>
            <div class="skill-group-items" :class="{ collapsed: group.collapsed }">
              <div
                v-for="skill in group.skills"
                :key="skill.id"
                class="skill-item"
                :class="{ disabled: !skillsEnabled }"
              >
                <span class="skill-name">{{ skill.name }}</span>
                <label class="skill-item-toggle">
                  <input
                    type="checkbox"
                    :checked="isSkillEnabled(skill.id)"
                    :disabled="!skillsEnabled"
                    @change="toggleSkillEnabled(skill.id)"
                  />
                  <span class="skill-item-toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
          <div v-if="availableSkills.length === 0" class="skills-empty">
            No skills available
          </div>
        </div>

        <!-- Settings link -->
        <button class="skills-menu-settings" @click="openSettings">
          <Settings :size="14" :stroke-width="2" />
          <span>Advanced Settings</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { SkillDefinition } from '@/types'
import { SquareFunction, ChevronDown, Settings } from 'lucide-vue-next'

interface SkillGroup {
  id: string
  name: string
  source: 'user' | 'project' | 'plugin'
  sourceLabel: string
  skills: SkillDefinition[]
  collapsed: boolean
}

const emit = defineEmits<{
  (e: 'openSettings'): void
}>()

const settingsStore = useSettingsStore()

const showPanel = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const panelPosition = ref<{ top?: string; bottom?: string; left: string }>({ bottom: '0px', left: '0px' })
const availableSkills = ref<SkillDefinition[]>([])
const collapsedGroups = ref<Set<string>>(new Set())

const skillsEnabled = computed(() => settingsStore.settings?.skills?.enableSkills ?? true)

const groupedSkills = computed(() => {
  const groups: SkillGroup[] = []
  const bySource = new Map<string, SkillDefinition[]>()

  for (const skill of availableSkills.value) {
    const source = skill.source || 'user'
    if (!bySource.has(source)) {
      bySource.set(source, [])
    }
    bySource.get(source)!.push(skill)
  }

  const sourceNames: Record<string, string> = {
    user: 'User Skills',
    project: 'Project Skills',
    plugin: 'Plugin Skills',
  }
  const sourceLabels: Record<string, string> = {
    user: 'User',
    project: 'Project',
    plugin: 'Plugin',
  }

  for (const [source, skills] of bySource) {
    groups.push({
      id: source,
      name: sourceNames[source] || source,
      source: source as 'user' | 'project' | 'plugin',
      sourceLabel: sourceLabels[source] || source,
      skills,
      collapsed: collapsedGroups.value.has(source),
    })
  }

  return groups
})

async function loadSkills() {
  try {
    const response = await window.electronAPI.getSkills()
    if (response.success && response.skills) {
      availableSkills.value = response.skills
    }
  } catch (error) {
    console.error('Failed to load skills:', error)
  }
}

function togglePanel() {
  if (!showPanel.value && dropdownRef.value) {
    const rect = dropdownRef.value.getBoundingClientRect()
    const panelWidth = 260
    let left = rect.left
    const bottom = window.innerHeight - rect.top + 4

    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8
    }

    panelPosition.value = { bottom: `${bottom}px`, left: `${left}px` }
  }
  showPanel.value = !showPanel.value

  if (showPanel.value) {
    loadSkills()
  }
}

function toggleSkillsEnabled() {
  if (settingsStore.settings?.skills) {
    settingsStore.settings.skills.enableSkills = !skillsEnabled.value
    settingsStore.saveSettings(settingsStore.settings)
  }
}

function toggleGroupCollapse(groupId: string) {
  if (collapsedGroups.value.has(groupId)) {
    collapsedGroups.value.delete(groupId)
  } else {
    collapsedGroups.value.add(groupId)
  }
  collapsedGroups.value = new Set(collapsedGroups.value)
}

function isSkillEnabled(skillId: string): boolean {
  const skill = availableSkills.value.find(s => s.id === skillId)
  return skill?.enabled ?? true
}

async function toggleSkillEnabled(skillId: string) {
  try {
    const skill = availableSkills.value.find(s => s.id === skillId)
    if (skill) {
      const newEnabled = !skill.enabled
      await window.electronAPI.toggleSkillEnabled(skillId, newEnabled)
      skill.enabled = newEnabled
    }
  } catch (error) {
    console.error('Failed to toggle skill:', error)
  }
}

function openSettings() {
  showPanel.value = false
  emit('openSettings')
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (showPanel.value && dropdownRef.value && !dropdownRef.value.contains(target)) {
    const menu = document.querySelector('.skills-menu')
    if (!menu?.contains(target)) {
      showPanel.value = false
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.skills-dropdown {
  position: relative;
}

.toolbar-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.toolbar-btn:hover {
  background: var(--hover);
  color: var(--text);
  border-color: var(--border);
}

.toolbar-btn.active {
  color: var(--accent);
}

.skills-status-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 4px var(--accent);
}

.skills-menu {
  position: fixed;
  width: 260px;
  background: var(--bg-elevated);
  backdrop-filter: blur(24px);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  z-index: 9999;
  overflow: hidden;
  animation: menuSlideUp 0.2s ease-out;
}

@keyframes menuSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.skills-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid var(--border);
}

.skills-menu-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.skills-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.skills-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.skills-toggle-slider {
  display: block;
  width: 40px;
  height: 22px;
  background: rgba(120, 120, 128, 0.32);
  border-radius: 11px;
  position: relative;
  transition: background 0.25s ease;
}

.skills-toggle-slider::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.25s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.skills-toggle input:checked + .skills-toggle-slider {
  background: var(--accent);
}

.skills-toggle input:checked + .skills-toggle-slider::after {
  transform: translateX(18px);
}

.skills-menu-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
}

.skill-group { margin-bottom: 4px; }
.skill-group:last-child { margin-bottom: 0; }

.skill-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border-radius: 6px;
  transition: all 0.15s ease;
  user-select: none;
}

.skill-group-header.disabled { opacity: 0.5; }
.skill-group-header:hover { background: var(--hover); color: var(--text); }

.group-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  cursor: pointer;
}

.group-chevron {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.skill-group-header.collapsed .group-chevron { transform: rotate(-90deg); }

.group-name { flex: 1; }

.group-badge {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.group-badge.user {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(34, 197, 94);
}

.group-badge.project {
  background: rgba(59, 130, 246, 0.15);
  color: rgb(59, 130, 246);
}

.group-badge.plugin {
  background: rgba(168, 85, 247, 0.15);
  color: rgb(168, 85, 247);
}

.group-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 8px;
  opacity: 0.8;
}

.skill-group-items {
  padding-left: 8px;
  overflow: hidden;
  transition: max-height 0.2s ease, opacity 0.2s ease;
  max-height: 500px;
  opacity: 1;
}

.skill-group-items.collapsed { max-height: 0; opacity: 0; }

.skill-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.skill-item:last-child { margin-bottom: 0; }
.skill-item:hover { background: var(--hover); }
.skill-item.disabled { opacity: 0.5; }

.skill-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.skills-empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

.skill-item-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.skill-item-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.skill-item-toggle-slider {
  display: block;
  width: 36px;
  height: 20px;
  background: rgba(120, 120, 128, 0.32);
  border-radius: 10px;
  position: relative;
  transition: background 0.25s ease;
}

.skill-item-toggle-slider::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.25s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.skill-item-toggle input:checked + .skill-item-toggle-slider {
  background: var(--accent);
}

.skill-item-toggle input:checked + .skill-item-toggle-slider::after {
  transform: translateX(16px);
}

.skills-menu-settings {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  background: transparent;
  border-left: none;
  border-right: none;
  border-bottom: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.skills-menu-settings:hover {
  background: rgba(59, 130, 246, 0.08);
}
</style>
