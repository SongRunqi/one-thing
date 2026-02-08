<template>
  <div class="tab-content">
    <section class="settings-section">
      <h3 class="section-title">
        Keyboard Shortcuts
      </h3>
      <p class="section-desc">
        Click on a shortcut to record a new key combination
      </p>

      <div class="shortcuts-list">
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

.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0.8;
}

.section-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.shortcut-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shortcut-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.shortcut-desc {
  font-size: 12px;
  color: var(--text-muted);
}

/* Light theme */
html[data-theme='light'] .shortcut-row {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
}
</style>
