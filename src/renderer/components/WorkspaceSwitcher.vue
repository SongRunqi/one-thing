<template>
  <div :class="['workspace-switcher', { 'has-separator': showSeparator }]">
    <!-- Left: Media Button -->
    <button
      class="switcher-btn media-btn"
      :class="{ active: mediaPanelOpen }"
      title="Media"
      @click="$emit('toggle-media-panel')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    </button>

    <!-- Center: Workspace Icons -->
    <div class="workspace-icons">
      <!-- Default (no workspace) icon -->
      <button
        class="workspace-icon"
        :class="{ active: workspacesStore.isDefaultMode }"
        title="Default Chat"
        @click="switchToDefault"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <!-- Workspace avatars -->
      <button
        v-for="workspace in workspacesStore.workspaces"
        :key="workspace.id"
        class="workspace-icon"
        :class="{ active: workspace.id === workspacesStore.currentWorkspaceId }"
        :title="workspace.name"
        @click="switchWorkspace(workspace.id)"
        @contextmenu.prevent="openContextMenu($event, workspace)"
      >
        <span v-if="workspace.avatar.type === 'emoji'" class="workspace-emoji">
          {{ workspace.avatar.value }}
        </span>
        <img
          v-else
          :src="'file://' + workspace.avatar.value"
          class="workspace-image"
          :style="{ 
            '-webkit-mask-image': `url('file://${workspace.avatar.value}')`,
            'mask-image': `url('file://${workspace.avatar.value}')`
          }"
          alt=""
        />
      </button>
    </div>

    <!-- Right: Add Button -->
    <button
      class="switcher-btn add-btn"
      title="New Workspace"
      @click="$emit('open-create-dialog')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <button class="context-menu-item" @click="editWorkspace">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </button>
        <button class="context-menu-item danger" @click="deleteWorkspace">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useSessionsStore } from '@/stores/sessions'
import type { Workspace } from '@/types'

defineProps<{
  mediaPanelOpen?: boolean,
  showSeparator?: boolean
}>()

const emit = defineEmits<{
  'toggle-media-panel': []
  'open-create-dialog': []
  'edit-workspace': [workspace: Workspace]
}>()

const workspacesStore = useWorkspacesStore()
const sessionsStore = useSessionsStore()

// Context menu state
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  workspace: null as Workspace | null
})

async function switchToDefault() {
  await workspacesStore.switchWorkspace(null)
  // Create new session in default mode if none exists
  if (sessionsStore.filteredSessions.length === 0) {
    await sessionsStore.createSession('New Chat')
  } else {
    // Switch to the first session in default mode
    await sessionsStore.switchSession(sessionsStore.filteredSessions[0].id)
  }
}

async function switchWorkspace(workspaceId: string) {
  await workspacesStore.switchWorkspace(workspaceId)
  // Create new session in this workspace if none exists
  if (sessionsStore.filteredSessions.length === 0) {
    await sessionsStore.createSession('New Chat')
  } else {
    // Switch to the first session in this workspace
    await sessionsStore.switchSession(sessionsStore.filteredSessions[0].id)
  }
}

function openContextMenu(event: MouseEvent, workspace: Workspace) {
  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.workspace = workspace
}

function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.workspace = null
}

function editWorkspace() {
  if (contextMenu.workspace) {
    emit('edit-workspace', contextMenu.workspace)
  }
  closeContextMenu()
}

async function deleteWorkspace() {
  if (contextMenu.workspace) {
    const confirmed = confirm(`Delete workspace "${contextMenu.workspace.name}"? All sessions in this workspace will be deleted.`)
    if (confirmed) {
      await workspacesStore.deleteWorkspace(contextMenu.workspace.id)
    }
  }
  closeContextMenu()
}

// Close context menu when clicking outside
function handleClickOutside(event: MouseEvent) {
  if (contextMenu.visible) {
    closeContextMenu()
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
.workspace-switcher {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 16px; /* Slightly reduced height */
  background: transparent;
}

/* Top dashed separator line */
.workspace-switcher::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  opacity: 0;
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

html[data-theme='light'] .workspace-switcher::before {
  border-top-color: rgba(0, 0, 0, 0.05);
}

.workspace-switcher.has-separator::before {
  opacity: 1;
}

.switcher-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px; /* Restored to 32px or 36px */
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.media-btn,
.add-btn {
  flex: 0 0 32px; /* Fixed width for symmetry */
}

.switcher-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.switcher-btn.active {
  background: var(--active);
  color: var(--accent);
}

.workspace-icons {
  flex: 1; /* Take all available middle space */
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px; /* Tighter gap */
  padding: 2px 0;
  overflow-x: auto;
  scrollbar-width: none;
  min-width: 0; /* Allow shrinking if many icons */
}

.workspace-icons::-webkit-scrollbar {
  display: none;
}

.workspace-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px; /* Container size restored */
  height: 32px;
  min-width: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--muted);
}

.workspace-icon:hover {
  background: rgba(128, 128, 128, 0.15); /* Translucent light grey square */
  transform: translateY(-1px) scale(1.1);
}

.workspace-icon:hover .workspace-emoji,
.workspace-icon:hover .workspace-image,
.workspace-icon:hover svg {
  opacity: 1; /* Fully opaque on hover */
  filter: grayscale(0); /* Remove grayscale on hover */
}

.workspace-icon.active {
  background: transparent;
  color: var(--accent);
}

.workspace-icon.active .workspace-emoji {
  background: var(--accent);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: none;
  opacity: 1;
}

.workspace-icon.active .workspace-image {
  background: var(--accent);
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  filter: none;
  opacity: 1;
}

.workspace-icon.active svg {
  color: var(--accent);
  filter: none;
  opacity: 1;
}

.workspace-emoji,
.workspace-image,
.workspace-icon svg {
  width: 13px; /* Minimal icon size */
  height: 13px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
  filter: grayscale(1);
}

.workspace-emoji {
  font-size: 11px;
  line-height: 1;
}

.workspace-image {
  border-radius: 3px;
  object-fit: cover;
}

.add-btn {
  color: var(--muted);
}

.add-btn:hover {
  color: var(--accent);
}

/* Context Menu */
.context-menu {
  position: fixed;
  min-width: 140px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px;
  box-shadow: var(--shadow);
  z-index: 1000;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.context-menu-item:hover {
  background: var(--hover);
}

.context-menu-item.danger {
  color: #ef4444;
}

.context-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.1);
}
</style>
