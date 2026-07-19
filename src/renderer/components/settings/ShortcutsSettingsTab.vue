<template>
  <div class="tab-content">
    <section class="settings-section">
      <h3 class="section-title">
        Keyboard Shortcuts
      </h3>
      <p class="section-desc">
        Click on a shortcut to record a new key combination
      </p>

      <div class="settings-card shortcuts-list">
        <div class="shortcut-row">
          <div class="shortcut-info">
            <span class="shortcut-name">Send Message</span>
            <span class="shortcut-desc">Send the current message</span>
          </div>
          <ShortcutInput
            :model-value="settings.general.shortcuts?.sendMessage"
            @update:model-value="updateShortcut('sendMessage', $event)"
          />
        </div>

        <div class="shortcut-row">
          <div class="shortcut-info">
            <span class="shortcut-name">New Chat</span>
            <span class="shortcut-desc">Start a new conversation</span>
          </div>
          <ShortcutInput
            :model-value="settings.general.shortcuts?.newChat"
            @update:model-value="updateShortcut('newChat', $event)"
          />
        </div>

        <div class="shortcut-row">
          <div class="shortcut-info">
            <span class="shortcut-name">Close Chat</span>
            <span class="shortcut-desc">Close the current conversation</span>
          </div>
          <ShortcutInput
            :model-value="settings.general.shortcuts?.closeChat"
            @update:model-value="updateShortcut('closeChat', $event)"
          />
        </div>

        <div class="shortcut-row">
          <div class="shortcut-info">
            <span class="shortcut-name">Toggle Sidebar</span>
            <span class="shortcut-desc">Show or hide the sidebar</span>
          </div>
          <ShortcutInput
            :model-value="settings.general.shortcuts?.toggleSidebar"
            @update:model-value="updateShortcut('toggleSidebar', $event)"
          />
        </div>

        <div class="shortcut-row">
          <div class="shortcut-info">
            <span class="shortcut-name">Focus Input</span>
            <span class="shortcut-desc">Jump to the message input</span>
          </div>
          <ShortcutInput
            :model-value="settings.general.shortcuts?.focusInput"
            @update:model-value="updateShortcut('focusInput', $event)"
          />
        </div>

        <div class="shortcut-row">
          <div class="shortcut-info">
            <span class="shortcut-name">Search Everywhere</span>
            <span class="shortcut-desc">Open the global search window</span>
          </div>
          <ShortcutInput
            :model-value="settings.general.shortcuts?.searchEverywhere"
            @update:model-value="updateShortcut('searchEverywhere', $event)"
          />
        </div>

        <div class="shortcut-row">
          <div class="shortcut-info">
            <span class="shortcut-name">Todo Window</span>
            <span class="shortcut-desc">Open or hide the standalone todo window</span>
          </div>
          <ShortcutInput
            :model-value="settings.general.shortcuts?.toggleTodoPlanWindow"
            @update:model-value="updateShortcut('toggleTodoPlanWindow', $event)"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { AppSettings, KeyboardShortcut, ShortcutSettings } from '@/types'
import ShortcutInput from './ShortcutInput.vue'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

function updateShortcut(key: keyof ShortcutSettings, shortcut: KeyboardShortcut | undefined) {
  const currentShortcuts = props.settings.general.shortcuts || {
    sendMessage: { key: 'Enter' },
    newChat: { key: 'n', metaKey: true },
    closeChat: { key: 'w', metaKey: true },
    toggleSidebar: { key: 'b', metaKey: true },
    focusInput: { key: '/' },
    searchEverywhere: { key: 'k', metaKey: true },
    toggleTodoPlanWindow: { key: 't', metaKey: true, shiftKey: true },
    toggleTodoPlan: { key: 't', metaKey: true, altKey: true },
  }

  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      shortcuts: {
        ...currentShortcuts,
        [key]: shortcut || { key: '' }
      }
    }
  })
}
</script>

<style scoped>
.tab-content {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/*
 * Shortcuts ledger — 画线风.
 * Section title, card chrome, and row rules come from SettingsPage's
 * global :deep() layer; only layout lives here.
 */
.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-desc {
  font-size: 12px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  margin-bottom: 16px;
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.shortcut-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.shortcut-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut-desc {
  font-size: 12px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
}
</style>
