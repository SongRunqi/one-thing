<template>
  <div v-if="visible" class="right-sidebar">
    <!-- Content Area -->
    <div class="sidebar-content">
      <!-- Files Tab -->
      <FilesTab v-if="store.activeTab === 'files'" :working-directory="workingDirectory" />

      <!-- Git Tab -->
      <GitTab v-else-if="store.activeTab === 'git'" :working-directory="workingDirectory" :session-id="sessionId" />

      <!-- Documents Tab -->
      <DocumentsTab v-else-if="store.activeTab === 'documents'" :session-id="sessionId" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRightSidebarStore } from '@/stores/right-sidebar'
import FilesTab from './tabs/FilesTab.vue'
import GitTab from './tabs/GitTab.vue'
import DocumentsTab from './tabs/DocumentsTab.vue'

defineProps<{
  visible: boolean
  sessionId?: string
  workingDirectory?: string
}>()

defineEmits<{
  close: []
}>()

const store = useRightSidebarStore()
</script>

<style scoped>
.right-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
  overflow: hidden;
}

/* Content Area */
.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

</style>
