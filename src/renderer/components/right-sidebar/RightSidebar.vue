<template>
  <div
    v-if="visible"
    class="right-sidebar"
  >
    <!-- Content Area -->
    <div class="sidebar-content">
      <!-- Files Tab -->
      <FilesTab
        v-if="store.activeTab === 'files'"
        ref="filesTabRef"
        :working-directory="workingDirectory"
        :session-id="sessionId"
      />

      <!-- Git Tab -->
      <GitTab
        v-else-if="store.activeTab === 'git'"
        ref="gitTabRef"
        :working-directory="workingDirectory"
        :session-id="sessionId"
        @open-diff="$emit('open-diff', $event)"
        @open-commit-dialog="$emit('open-commit-dialog')"
      />

      <!-- Documents Tab -->
      <DocumentsTab
        v-else-if="store.activeTab === 'documents'"
        :session-id="sessionId"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
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
  'open-diff': [data: { filePath: string; workingDirectory: string; sessionId: string; isStaged: boolean }]
  'open-commit-dialog': []
}>()

const store = useRightSidebarStore()

type RefreshableTabHandle = {
  refresh: () => void
}

const filesTabRef = ref<RefreshableTabHandle | null>(null)
const gitTabRef = ref<RefreshableTabHandle | null>(null)

function refreshActive() {
  if (store.activeTab === 'files') {
    filesTabRef.value?.refresh()
    return
  }
  if (store.activeTab === 'git') {
    gitTabRef.value?.refresh()
  }
}

defineExpose({
  refreshActive,
})
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
