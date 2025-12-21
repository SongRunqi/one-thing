<template>
  <section class="settings-section">
    <h3 class="section-title">Bash Tool Settings</h3>

    <!-- Enable Sandbox -->
    <div class="form-group">
      <div class="toggle-row">
        <label class="form-label">Enable Directory Sandbox</label>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="bashSettings.enableSandbox"
            @change="updateSetting('enableSandbox', ($event.target as HTMLInputElement).checked)"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="form-hint">Restrict command execution to allowed directories only</p>
    </div>

    <!-- Default Working Directory -->
    <div class="form-group" v-if="bashSettings.enableSandbox">
      <label class="form-label">Default Working Directory</label>
      <div class="input-with-button">
        <input
          type="text"
          class="text-input"
          :value="bashSettings.defaultWorkingDirectory"
          @input="updateSetting('defaultWorkingDirectory', ($event.target as HTMLInputElement).value)"
          placeholder="Leave empty to use current project directory"
        />
        <button class="browse-btn" @click="browseDirectory('default')">
          Browse
        </button>
      </div>
      <p class="form-hint">Commands will execute in this directory by default</p>
    </div>

    <!-- Allowed Directories -->
    <div class="form-group" v-if="bashSettings.enableSandbox">
      <label class="form-label">Allowed Directories</label>
      <p class="form-hint">Commands can only access paths within these directories. Leave empty to use defaults.</p>

      <div class="directory-list" v-if="bashSettings.allowedDirectories.length > 0">
        <div
          v-for="(dir, index) in bashSettings.allowedDirectories"
          :key="index"
          class="directory-item"
        >
          <span class="directory-path">{{ dir }}</span>
          <button class="remove-btn" @click="removeDirectory(index)" title="Remove">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div v-else class="empty-hint">
        Using default directories: project folder, ~/.claude, /tmp, ~/Downloads
      </div>

      <button class="add-btn" @click="browseDirectory('add')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Directory
      </button>
    </div>

    <!-- Confirm Dangerous Commands -->
    <div class="form-group">
      <div class="toggle-row">
        <label class="form-label">Confirm Dangerous Commands</label>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="bashSettings.confirmDangerousCommands"
            @change="updateSetting('confirmDangerousCommands', ($event.target as HTMLInputElement).checked)"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="form-hint">Require confirmation before executing rm, mv, git push, etc.</p>
    </div>

    <!-- Dangerous Command Whitelist -->
    <div class="form-group" v-if="bashSettings.confirmDangerousCommands">
      <label class="form-label">Command Whitelist</label>
      <input
        type="text"
        class="text-input"
        :value="bashSettings.dangerousCommandWhitelist.join(', ')"
        @input="updateWhitelist(($event.target as HTMLInputElement).value)"
        placeholder="npm install, git push (comma separated)"
      />
      <p class="form-hint">Commands starting with these prefixes will skip confirmation</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings, BashToolSettings } from '@/types'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

// Get bash settings with defaults
const bashSettings = computed<BashToolSettings>(() => {
  return props.settings.tools?.bash ?? {
    enableSandbox: true,
    defaultWorkingDirectory: '',
    allowedDirectories: [],
    confirmDangerousCommands: true,
    dangerousCommandWhitelist: [],
  }
})

function updateSetting<K extends keyof BashToolSettings>(key: K, value: BashToolSettings[K]) {
  const newBashSettings = { ...bashSettings.value, [key]: value }
  emit('update:settings', {
    ...props.settings,
    tools: {
      ...props.settings.tools,
      bash: newBashSettings,
    },
  })
}

function updateWhitelist(value: string) {
  const whitelist = value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  updateSetting('dangerousCommandWhitelist', whitelist)
}

async function browseDirectory(mode: 'default' | 'add') {
  try {
    const result = await window.electronAPI.showOpenDialog({
      properties: ['openDirectory'],
      title: mode === 'default' ? 'Select Default Working Directory' : 'Add Allowed Directory',
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0]

      if (mode === 'default') {
        updateSetting('defaultWorkingDirectory', selectedPath)
      } else {
        // Add to allowed directories if not already present
        const current = [...bashSettings.value.allowedDirectories]
        if (!current.includes(selectedPath)) {
          current.push(selectedPath)
          updateSetting('allowedDirectories', current)
        }
      }
    }
  } catch (error) {
    console.error('Failed to open directory picker:', error)
  }
}

function removeDirectory(index: number) {
  const current = [...bashSettings.value.allowedDirectories]
  current.splice(index, 1)
  updateSetting('allowedDirectories', current)
}
</script>

<style scoped>
.settings-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 16px 0;
  opacity: 0.8;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  display: block;
  margin-bottom: 6px;
}

.form-hint {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
  margin-bottom: 0;
}

/* Toggle */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
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
  background-color: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 24px;
  transition: 0.15s;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text);
  border-radius: 50%;
  transition: 0.15s;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--accent);
  border-color: var(--accent);
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
  background-color: white;
}

/* Text Input */
.text-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
  transition: border-color 0.15s;
}

.text-input:focus {
  border-color: var(--accent);
}

.text-input::placeholder {
  color: var(--muted);
  opacity: 0.7;
}

/* Input with button */
.input-with-button {
  display: flex;
  gap: 8px;
}

.input-with-button .text-input {
  flex: 1;
}

.browse-btn {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.browse-btn:hover {
  background: var(--hover);
  border-color: var(--accent);
}

/* Directory List */
.directory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  margin-bottom: 12px;
}

.directory-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.directory-path {
  font-size: 13px;
  color: var(--text);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(239, 68, 68);
}

.empty-hint {
  font-size: 12px;
  color: var(--muted);
  padding: 12px;
  background: var(--hover);
  border-radius: 8px;
  margin-top: 12px;
  margin-bottom: 12px;
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--accent);
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-btn:hover {
  background: var(--hover);
  border-color: var(--accent);
  border-style: solid;
}
</style>
