<template>
  <div class="tools-dropdown" ref="dropdownRef">
    <button
      class="toolbar-btn tools-btn"
      :class="{ active: toolsEnabled }"
      :title="toolsEnabled ? 'Tools enabled' : 'Tools disabled'"
      @click="togglePanel"
    >
      <Toolbox :size="18" :stroke-width="2" />
      <span v-if="toolsEnabled" class="tools-status-dot"></span>
    </button>

    <Teleport to="body">
      <div
        v-if="showPanel"
        class="tools-menu"
        :style="panelPosition"
        @click.stop
      >
        <!-- Master toggle -->
        <div class="tools-menu-header">
          <div class="tools-menu-title">
            <Toolbox :size="16" :stroke-width="2" />
            <span>Tools</span>
          </div>
          <label class="tools-toggle">
            <input type="checkbox" :checked="toolsEnabled" @change="toggleTools" />
            <span class="tools-toggle-slider"></span>
          </label>
        </div>

        <!-- Tool list (grouped) -->
        <div class="tools-menu-list">
          <div v-for="group in groupedTools" :key="group.id" class="tool-group">
            <div
              class="tool-group-header"
              :class="{ collapsed: group.collapsed, disabled: !toolsEnabled }"
            >
              <div class="group-header-left" @click="toggleGroupCollapse(group.id)">
                <ChevronDown class="group-chevron" :size="12" :stroke-width="2" />
                <span class="group-name">{{ group.name }}</span>
                <span v-if="group.source === 'mcp'" class="group-badge mcp">MCP</span>
                <span class="group-count">{{ group.tools.length }}</span>
              </div>
              <label v-if="group.source === 'mcp'" class="tool-item-toggle" @click.stop>
                <input
                  type="checkbox"
                  :checked="isGroupEnabled(group)"
                  :disabled="!toolsEnabled"
                  @change="toggleGroupEnabled(group)"
                />
                <span class="tool-item-toggle-slider"></span>
              </label>
            </div>
            <div class="tool-group-items" :class="{ collapsed: group.collapsed }">
              <div
                v-for="tool in group.tools"
                :key="tool.id"
                class="tool-item"
                :class="{ disabled: !toolsEnabled || (group.source === 'mcp' && !isGroupEnabled(group)) }"
              >
                <span class="tool-name">{{ tool.name || tool.id }}</span>
                <label v-if="group.source === 'builtin'" class="tool-item-toggle">
                  <input
                    type="checkbox"
                    :checked="isToolEnabled(tool.id)"
                    :disabled="!toolsEnabled"
                    @change="toggleToolEnabled(tool.id)"
                  />
                  <span class="tool-item-toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
          <div v-if="availableTools.length === 0" class="tools-empty">
            No tools available
          </div>
        </div>

        <!-- Settings link -->
        <button class="tools-menu-settings" @click="openSettings">
          <Settings :size="14" :stroke-width="2" />
          <span>Advanced Settings</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { Toolbox, ChevronDown, Settings } from 'lucide-vue-next'

interface ToolDefinition {
  id: string
  name: string
  description?: string
  source?: 'builtin' | 'mcp'
  serverId?: string
  serverName?: string
}

interface ToolGroup {
  id: string
  name: string
  source: 'builtin' | 'mcp'
  tools: ToolDefinition[]
  collapsed: boolean
}

const emit = defineEmits<{
  (e: 'toolsEnabledChange', enabled: boolean): void
  (e: 'openSettings'): void
}>()

const settingsStore = useSettingsStore()

const showPanel = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const panelPosition = ref<{ top?: string; bottom?: string; left: string }>({ bottom: '0px', left: '0px' })
const availableTools = ref<ToolDefinition[]>([])
const collapsedGroups = ref<Set<string>>(new Set())

const toolsEnabled = ref(settingsStore.settings?.tools?.enableToolCalls ?? true)

watch(() => settingsStore.settings?.tools?.enableToolCalls, (newValue) => {
  if (newValue !== undefined) {
    toolsEnabled.value = newValue
  }
})

const groupedTools = computed(() => {
  const groups: ToolGroup[] = []
  const builtinTools = availableTools.value.filter(t => t.source !== 'mcp')
  const mcpTools = availableTools.value.filter(t => t.source === 'mcp')

  if (builtinTools.length > 0) {
    groups.push({
      id: 'builtin',
      name: 'Built-in Tools',
      source: 'builtin',
      tools: builtinTools,
      collapsed: collapsedGroups.value.has('builtin'),
    })
  }

  const mcpServerGroups = new Map<string, ToolDefinition[]>()
  for (const tool of mcpTools) {
    const serverId = tool.serverId || 'unknown'
    if (!mcpServerGroups.has(serverId)) {
      mcpServerGroups.set(serverId, [])
    }
    mcpServerGroups.get(serverId)!.push(tool)
  }

  for (const [serverId, tools] of mcpServerGroups) {
    const serverName = tools[0]?.serverName || serverId
    groups.push({
      id: `mcp:${serverId}`,
      name: serverName,
      source: 'mcp',
      tools,
      collapsed: collapsedGroups.value.has(`mcp:${serverId}`),
    })
  }

  return groups
})

async function loadAvailableTools() {
  try {
    const tools: ToolDefinition[] = []
    const builtinResponse = await window.electronAPI.getTools()
    if (builtinResponse.success && builtinResponse.tools) {
      for (const tool of builtinResponse.tools) {
        tools.push({
          id: tool.id,
          name: tool.name || tool.id,
          description: tool.description,
          source: 'builtin',
        })
      }
    }

    const mcpResponse = await window.electronAPI.mcpGetServers()
    if (mcpResponse.success && mcpResponse.servers) {
      for (const server of mcpResponse.servers) {
        if (server.status === 'connected' && server.tools) {
          for (const tool of server.tools) {
            tools.push({
              id: `mcp:${server.config.id}:${tool.name}`,
              name: tool.name,
              description: tool.description,
              source: 'mcp',
              serverId: server.config.id,
              serverName: server.config.name,
            })
          }
        }
      }
    }

    availableTools.value = tools
  } catch (error) {
    console.error('Failed to load tools:', error)
  }
}

function togglePanel() {
  if (!showPanel.value && dropdownRef.value) {
    const rect = dropdownRef.value.getBoundingClientRect()
    const panelWidth = 260
    let left = rect.left
    const bottom = window.innerHeight - rect.top + 4

    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8
    }

    panelPosition.value = { bottom: `${bottom}px`, left: `${left}px` }
  }
  showPanel.value = !showPanel.value

  if (showPanel.value) {
    loadAvailableTools()
  }
}

function toggleTools() {
  toolsEnabled.value = !toolsEnabled.value
  if (settingsStore.settings?.tools) {
    settingsStore.settings.tools.enableToolCalls = toolsEnabled.value
    settingsStore.saveSettings(settingsStore.settings)
  }
  emit('toolsEnabledChange', toolsEnabled.value)
}

function toggleGroupCollapse(groupId: string) {
  if (collapsedGroups.value.has(groupId)) {
    collapsedGroups.value.delete(groupId)
  } else {
    collapsedGroups.value.add(groupId)
  }
  collapsedGroups.value = new Set(collapsedGroups.value)
}

function isToolEnabled(toolId: string): boolean {
  return settingsStore.settings?.tools?.tools?.[toolId]?.enabled ?? true
}

function toggleToolEnabled(toolId: string) {
  if (settingsStore.settings?.tools) {
    if (!settingsStore.settings.tools.tools) {
      settingsStore.settings.tools.tools = {}
    }
    const current = settingsStore.settings.tools.tools[toolId]
    settingsStore.settings.tools.tools[toolId] = {
      ...current,
      enabled: !(current?.enabled ?? true)
    }
    settingsStore.saveSettings(settingsStore.settings)
  }
}

function isGroupEnabled(group: ToolGroup): boolean {
  if (group.source !== 'mcp') return true
  return group.tools.some(tool => isToolEnabled(tool.id))
}

function toggleGroupEnabled(group: ToolGroup) {
  if (!settingsStore.settings?.tools || group.source !== 'mcp') return

  if (!settingsStore.settings.tools.tools) {
    settingsStore.settings.tools.tools = {}
  }

  const anyEnabled = group.tools.some(tool => isToolEnabled(tool.id))
  const newState = !anyEnabled

  for (const tool of group.tools) {
    settingsStore.settings.tools.tools[tool.id] = {
      ...settingsStore.settings.tools.tools[tool.id],
      enabled: newState
    }
  }

  settingsStore.saveSettings(settingsStore.settings)
}

function openSettings() {
  showPanel.value = false
  emit('openSettings')
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (showPanel.value && dropdownRef.value && !dropdownRef.value.contains(target)) {
    const menu = document.querySelector('.tools-menu')
    if (!menu?.contains(target)) {
      showPanel.value = false
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
.tools-dropdown {
  position: relative;
}

.toolbar-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.toolbar-btn:hover {
  background: var(--hover);
  color: var(--text);
  border-color: var(--border);
}

.toolbar-btn.active {
  color: var(--accent);
}

.tools-status-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 4px var(--accent);
}

.tools-menu {
  position: fixed;
  width: 260px;
  background: var(--bg-elevated);
  backdrop-filter: blur(24px);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  z-index: 9999;
  overflow: hidden;
  animation: menuSlideUp 0.2s ease-out;
}

@keyframes menuSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.tools-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid var(--border);
}

.tools-menu-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.tools-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.tools-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.tools-toggle-slider {
  display: block;
  width: 40px;
  height: 22px;
  background: rgba(120, 120, 128, 0.32);
  border-radius: 11px;
  position: relative;
  transition: background 0.25s ease;
}

.tools-toggle-slider::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.25s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.tools-toggle input:checked + .tools-toggle-slider {
  background: var(--accent);
}

.tools-toggle input:checked + .tools-toggle-slider::after {
  transform: translateX(18px);
}

.tools-menu-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
}

.tool-group { margin-bottom: 4px; }
.tool-group:last-child { margin-bottom: 0; }

.tool-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border-radius: 6px;
  transition: all 0.15s ease;
  user-select: none;
}

.tool-group-header.disabled { opacity: 0.5; }
.tool-group-header:hover { background: var(--hover); color: var(--text); }

.group-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  cursor: pointer;
}

.group-chevron {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.tool-group-header.collapsed .group-chevron { transform: rotate(-90deg); }

.group-name { flex: 1; }

.group-badge {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.group-badge.mcp {
  background: rgba(139, 92, 246, 0.15);
  color: rgb(139, 92, 246);
}

.group-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 8px;
  opacity: 0.8;
}

.tool-group-items {
  padding-left: 8px;
  overflow: hidden;
  transition: max-height 0.2s ease, opacity 0.2s ease;
  max-height: 500px;
  opacity: 1;
}

.tool-group-items.collapsed { max-height: 0; opacity: 0; }

.tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.tool-item:last-child { margin-bottom: 0; }
.tool-item:hover { background: var(--hover); }
.tool-item.disabled { opacity: 0.5; }

.tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.tools-empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

.tool-item-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.tool-item-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.tool-item-toggle-slider {
  display: block;
  width: 36px;
  height: 20px;
  background: rgba(120, 120, 128, 0.32);
  border-radius: 10px;
  position: relative;
  transition: background 0.25s ease;
}

.tool-item-toggle-slider::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.25s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.tool-item-toggle input:checked + .tool-item-toggle-slider {
  background: var(--accent);
}

.tool-item-toggle input:checked + .tool-item-toggle-slider::after {
  transform: translateX(16px);
}

.tools-menu-settings {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  background: transparent;
  border-left: none;
  border-right: none;
  border-bottom: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.tools-menu-settings:hover {
  background: rgba(59, 130, 246, 0.08);
}
</style>
