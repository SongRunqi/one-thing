<template>
  <div class="app-shell">
    <Sidebar
      :collapsed="sidebarCollapsed"
      @open-settings="showSettings = true"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />
    <ChatWindow
      :show-settings="showSettings"
      :sidebar-collapsed="sidebarCollapsed"
      @close-settings="showSettings = false"
      @open-settings="showSettings = true"
      @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watchEffect, ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import Sidebar from '@/components/Sidebar.vue'
import ChatWindow from '@/components/ChatWindow.vue'

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()

const showSettings = ref(false)
const sidebarCollapsed = ref(false)

onMounted(async () => {
  // Load initial data
  await sessionsStore.loadSessions()
  await settingsStore.loadSettings()

  // Create a default session if none exist
  if (sessionsStore.sessionCount === 0) {
    await sessionsStore.createSession('New Chat')
  }
})

watchEffect(() => {
  const theme = settingsStore.settings.theme || 'dark'
  document.documentElement.dataset.theme = theme
})
</script>

<style scoped>
.app-shell {
  height: 100%;
  width: 100%;
}
</style>
