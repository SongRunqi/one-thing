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
    <div ref="workspaceIconsRef" class="workspace-icons">
      <!-- Default (no workspace) icon -->
      <button
        class="workspace-icon"
        :class="{ active: workspacesStore.isDefaultMode }"
        :style="iconStyle"
        title="Default Chat"
        @click="switchToDefault"
      >
        <MessageSquare :size="iconSizeConfig.innerSize" :stroke-width="1.5" />
      </button>

      <!-- Workspace avatars -->
      <button
        v-for="workspace in workspacesStore.workspaces"
        :key="workspace.id"
        class="workspace-icon"
        :class="{ active: workspace.id === workspacesStore.currentWorkspaceId }"
        :style="iconStyle"
        :title="workspace.name"
        @click="switchWorkspace(workspace.id)"
        @contextmenu.prevent="openContextMenu($event, workspace)"
      >
        <span
          v-if="workspace.avatar.type === 'emoji'"
          class="workspace-emoji"
          :style="emojiStyle"
        >
          {{ workspace.avatar.value }}
        </span>
        <img
          v-else
          :src="'file://' + workspace.avatar.value"
          class="workspace-image"
          :style="{
            width: iconSizeConfig.innerSize + 'px',
            height: iconSizeConfig.innerSize + 'px',
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
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useSessionsStore } from '@/stores/sessions'
import type { Workspace } from '@/types'
import CreatePanel from './CreatePanel.vue'
import { Images, MessageSquare, Plus } from 'lucide-vue-next'

defineProps<{
  mediaPanelOpen?: boolean,
  showSeparator?: boolean
}>()

// Initialize stores first (before any computed/watch that uses them)
const workspacesStore = useWorkspacesStore()
const sessionsStore = useSessionsStore()

// Dynamic icon sizing based on workspace count
const workspaceIconsRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)

// Calculate dynamic icon size based on workspace count
const iconSizeConfig = computed(() => {
  const totalIcons = workspacesStore.workspaces.length + 1 // +1 for default chat icon
  const gap = 4 // gap between icons in pixels
  const minIconSize = 20 // minimum icon size
  const maxIconSize = 32 // maximum icon size
  const padding = 8 // horizontal padding inside workspace-icons container

  // Calculate available width for icons
  // Using containerWidth if measured, otherwise estimate based on typical sidebar width
  const availableWidth = containerWidth.value > 0 ? containerWidth.value - padding : 150

  // Calculate ideal size to fit all icons
  const totalGapSpace = (totalIcons - 1) * gap
  const idealSize = Math.floor((availableWidth - totalGapSpace) / totalIcons)

  // Clamp between min and max
  const iconSize = Math.max(minIconSize, Math.min(maxIconSize, idealSize))

  // Inner icon/emoji size scales with container
  const innerSize = Math.max(10, Math.floor(iconSize * 0.5))
  const fontSize = Math.max(9, Math.floor(iconSize * 0.45))

  return {
    containerSize: iconSize,
    innerSize,
    fontSize,
    borderRadius: Math.max(5, Math.floor(iconSize * 0.25))
  }
})

// Computed styles for icons
const iconStyle = computed(() => ({
  width: iconSizeConfig.value.containerSize + 'px',
  height: iconSizeConfig.value.containerSize + 'px',
  minWidth: iconSizeConfig.value.containerSize + 'px',
  borderRadius: iconSizeConfig.value.borderRadius + 'px',
}))

const emojiStyle = computed(() => ({
  width: iconSizeConfig.value.innerSize + 'px',
  height: iconSizeConfig.value.innerSize + 'px',
  fontSize: iconSizeConfig.value.fontSize + 'px',
}))

// Update container width on mount and resize
function updateContainerWidth() {
  if (workspaceIconsRef.value) {
    containerWidth.value = workspaceIconsRef.value.clientWidth
  }
}

// ResizeObserver for tracking container width
let resizeObserver: ResizeObserver | null = null

function setupResizeObserver() {
  if (workspaceIconsRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateContainerWidth()
    })
    resizeObserver.observe(workspaceIconsRef.value)
  }
}

// Watch for workspace changes and update sizing
watch(() => workspacesStore.workspaces.length, () => {
  nextTick(updateContainerWidth)
})

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
  // Setup resize observer and initial width measurement
  nextTick(() => {
    updateContainerWidth()
    setupResizeObserver()
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  // Cleanup resize observer
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
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
  user-select: none;
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
  /* Size set dynamically via inline style */
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
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
  /* Size set dynamically via inline style or :size prop */
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
  filter: grayscale(1);
}

.workspace-emoji {
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
