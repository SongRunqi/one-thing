<template>
  <div class="theme-selector">
    <!-- Tab Bar -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'dark' }"
        @click="activeTab = 'dark'"
      >
        Dark
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'light' }"
        @click="activeTab = 'light'"
      >
        Light
      </button>
    </div>

    <!-- Theme Grid -->
    <div
      v-if="filteredThemes.length > 0"
      class="theme-grid"
    >
      <div
        v-for="theme in filteredThemes"
        :key="theme.id"
        class="theme-item"
        :class="{ active: selectedThemeIdForTab === theme.id }"
        @click="selectTheme(theme.id)"
      >
        <!-- Theme Preview -->
        <div
          class="theme-preview"
          :style="{
            '--preview-bg': theme.previewColors?.bg || '#1a1a1a',
            '--preview-sidebar': theme.previewColors?.sidebar || '#0d0d0d',
            '--preview-accent': theme.previewColors?.accent || '#4385be',
            '--preview-text': theme.previewColors?.text || '#ffffff',
          }"
        >
          <div class="preview-sidebar" />
          <div class="preview-content">
            <div class="preview-bubble user" />
            <div class="preview-bubble assistant" />
          </div>
        </div>

        <!-- Theme Info -->
        <div class="theme-info">
          <span class="theme-name">{{ theme.name }}</span>
          <span
            v-if="theme.author"
            class="theme-author"
          >by {{ theme.author }}</span>
        </div>

        <!-- Active Check -->
        <div
          v-if="selectedThemeIdForTab === theme.id"
          class="check-icon"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            width="14"
            height="14"
          >
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!themeStore.isLoading"
      class="empty-state"
    >
      <p>No themes found. Click "Open Themes Folder" to add custom themes.</p>
    </div>

    <!-- Actions -->
    <div class="theme-actions">
      <button
        class="action-btn"
        title="Open themes folder"
        @click="openThemesFolder"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          width="16"
          height="16"
        >
          <path
            fill-rule="evenodd"
            d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z"
            clip-rule="evenodd"
          />
          <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
        </svg>
        <span>Open Themes Folder</span>
      </button>
      <button
        class="action-btn"
        :disabled="themeStore.isLoading"
        @click="refreshThemes"
      >
        <svg
          :class="['refresh-icon', { spinning: themeStore.isLoading }]"
          viewBox="0 0 20 20"
          fill="currentColor"
          width="16"
          height="16"
        >
          <path
            fill-rule="evenodd"
            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
            clip-rule="evenodd"
          />
        </svg>
        <span>{{ themeStore.isLoading ? 'Refreshing...' : 'Refresh' }}</span>
      </button>
    </div>

    <!-- Error Message -->
    <div
      v-if="themeStore.error"
      class="error-message"
    >
      {{ themeStore.error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useThemeStore } from '@/stores/themes'

const themeStore = useThemeStore()

// Emit theme changes to parent so localSettings can be synced
const emit = defineEmits<{
  (e: 'themeChange', darkThemeId: string, lightThemeId: string): void
}>()

// Tab state: 'dark' or 'light'
const activeTab = ref<'dark' | 'light'>('dark')

// Filter themes based on active tab
const filteredThemes = computed(() => {
  return themeStore.availableThemes.filter(theme => {
    if (activeTab.value === 'dark') {
      // Dark tab: show themes that support dark mode
      return theme.colorScheme === 'dark' || theme.colorScheme === 'both'
    } else {
      // Light tab: show themes that support light mode
      return theme.colorScheme === 'light' || theme.colorScheme === 'both'
    }
  })
})

// Get the selected theme ID for the current tab
const selectedThemeIdForTab = computed(() => {
  if (activeTab.value === 'dark') {
    return themeStore.darkThemeId
  } else {
    return themeStore.lightThemeId
  }
})

onMounted(async () => {
  // Initialize theme store if not already done
  if (themeStore.availableThemes.length === 0) {
    await themeStore.initialize()
  }
})

// Select a theme for the current tab's mode
function selectTheme(themeId: string) {
  themeStore.setThemeForMode(themeId, activeTab.value)

  // Emit to parent to sync localSettings
  // This prevents other settings changes from overwriting the theme selection
  emit('themeChange', themeStore.darkThemeId, themeStore.lightThemeId)
}

async function openThemesFolder() {
  await themeStore.openThemesFolder()
}

async function refreshThemes() {
  await themeStore.refreshThemes()
}
</script>

<style scoped>
.theme-selector {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Tab Bar */
.tab-bar {
  display: flex;
  gap: 4px;
  background: var(--bg-input, rgba(255, 255, 255, 0.05));
  padding: 4px;
  border-radius: 10px;
  width: fit-content;
}

.tab-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover:not(.active) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  background: var(--accent);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Theme Grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.theme-item {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--bg-panel, var(--panel));
}

.theme-item:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.theme-item.active {
  border-color: var(--accent);
  border-width: 2px;
  background: rgba(var(--accent-rgb, 67, 133, 190), 0.05);
}

/* Theme Preview */
.theme-preview {
  height: 72px;
  display: flex;
  background: var(--preview-bg);
  border-bottom: 1px solid var(--border);
}

.preview-sidebar {
  width: 28%;
  background: var(--preview-sidebar);
}

.preview-content {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}

.preview-bubble {
  height: 10px;
  border-radius: 5px;
}

.preview-bubble.user {
  width: 55%;
  margin-left: auto;
  background: var(--preview-accent);
}

.preview-bubble.assistant {
  width: 75%;
  background: rgba(255, 255, 255, 0.12);
}

/* Theme Info */
.theme-info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-author {
  font-size: 11px;
  color: var(--text-muted);
}

/* Check Icon */
.check-icon {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Actions */
.theme-actions {
  display: flex;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-hover, var(--hover));
  border-color: var(--accent);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Error Message */
.error-message {
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.3);
  color: #ef4444;
  font-size: 13px;
}

/* Empty State */
.empty-state {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Responsive */
@media (max-width: 480px) {
  .theme-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .theme-actions {
    flex-direction: column;
  }
}
</style>
