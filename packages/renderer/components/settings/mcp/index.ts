/**
 * MCP Settings Components
 *
 * 用于配置和管理 MCP (Model Context Protocol) 服务器
 */

export { default as MCPSettingsPanel } from './MCPSettingsPanel.vue'
export { default as MCPServerList } from './MCPServerList.vue'
export { default as MCPServerItem } from './MCPServerItem.vue'
export { default as MCPServerDialog } from './MCPServerDialog.vue'
export { default as MCPImportDialog } from './MCPImportDialog.vue'

export {
  useMCPServers,
  parseConfigFile,
  parseServerEntry,
  parseCommandLine,
  parseCommandParts,
  getServerSummary,
  type ServerForm,
} from './useMCPServers'
