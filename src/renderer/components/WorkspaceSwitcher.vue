<template>
  <div :class="['workspace-switcher', { 'has-separator': showSeparator }]">
    <!-- Left: Media Button -->
    <button
      class="switcher-btn media-btn"
      :class="{ active: mediaPanelOpen }"
      title="Media"
      @click="$emit('toggle-media-panel')"
    >
      <Images :size="18" :stroke-width="1.5" />
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
        <MessageSquare :size="16" :stroke-width="1.5" />
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
      ref="addBtnRef"
      class="switcher-btn add-btn"
      :class="{ active: showCreatePanel }"
      title="Create"
      @click.stop="toggleCreatePanel"
    >
      <Plus :size="18" :stroke-width="1.5" />
    </button>

    <!-- Create Panel -->
    <CreatePanel
      :visible="showCreatePanel"
      :trigger-rect="addBtnRect"
      @close="closeCreatePanel"
      @create-agent="handleCreateAgent"
      @create-workspace="handleCreateWorkspace"
    />

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        ref="contextMenuRef"
        class="context-menu"
        :style="contextMenuStyle"
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
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useSessionsStore } from '@/stores/sessions'
import type { Workspace } from '@/types'
import CreatePanel from './CreatePanel.vue'
import { Images, MessageSquare, Plus } from 'lucide-vue-next'

defineProps<{
  mediaPanelOpen?: boolean,
  showSeparator?: boolean
}>()

const emit = defineEmits<{
  'toggle-media-panel': []
  'open-create-dialog': []
  'open-agent-dialog': []
  'edit-workspace': [workspace: Workspace]
}>()

// Create panel state
const showCreatePanel = ref(false)
const addBtnRef = ref<HTMLButtonElement | null>(null)
const addBtnRect = ref<DOMRect | null>(null)

function toggleCreatePanel() {
  if (addBtnRef.value) {
    addBtnRect.value = addBtnRef.value.getBoundingClientRect()
  }
  showCreatePanel.value = !showCreatePanel.value
}

function closeCreatePanel() {
  showCreatePanel.value = false
}

function handleCreateAgent() {
  emit('open-agent-dialog')
}

function handleCreateWorkspace() {
  emit('open-create-dialog')
}

const workspacesStore = useWorkspacesStore()
const sessionsStore = useSessionsStore()

// Context menu state
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  workspace: null as Workspace | null
})
const contextMenuRef = ref<HTMLDivElement | null>(null)

// Computed style for context menu with boundary checking
const contextMenuStyle = computed(() => {
  const menuHeight = 90 // Approximate height of the menu
  const menuWidth = 140
  const padding = 8

  let x = contextMenu.x
  let y = contextMenu.y

  // Check right boundary
  if (x + menuWidth + padding > window.innerWidth) {
    x = window.innerWidth - menuWidth - padding
  }

  // Check bottom boundary - if menu would overflow, show it above the cursor
  if (y + menuHeight + padding > window.innerHeight) {
    y = contextMenu.y - menuHeight
  }

  // Ensure minimum bounds
  x = Math.max(padding, x)
  y = Math.max(padding, y)

  return {
    left: x + 'px',
    top: y + 'px'
  }
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

// Close context menu and create panel when clicking outside
function handleClickOutside(event: MouseEvent) {
  if (contextMenu.visible) {
    closeContextMenu()
  }
  if (showCreatePanel.value) {
    const target = event.target as HTMLElement
    const panel = document.querySelector('.create-panel')
    const btn = addBtnRef.value
    if (!panel?.contains(target) && !btn?.contains(target)) {
      closeCreatePanel()
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
.workspace-switcher {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: transparent;
}

/* Top separator line - subtle, only shows when scrolled */
.workspace-switcher::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 16px;
  height: 1px;
  background: rgba(255, 255, 255, 0.04);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

html[data-theme='light'] .workspace-switcher::before {
  background: rgba(0, 0, 0, 0.03);
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

.workspace-icon.active:hover {
  background: rgba(128, 128, 128, 0.15);
  transform: translateY(-1px) scale(1.1);
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
