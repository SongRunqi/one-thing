/**
 * Sidebar Components
 *
 * 侧边栏组件集合，包含会话列表和管理功能
 */

export { default as Sidebar } from './Sidebar.vue'
export { default as SidebarHeader } from './SidebarHeader.vue'
export { default as SessionList } from './SessionList.vue'
export { default as SessionItem } from './SessionItem.vue'
export { default as SessionContextMenu } from './SessionContextMenu.vue'
export { default as SidebarResizeHandle } from './SidebarResizeHandle.vue'

export {
  useSessionOrganizer,
  type SessionWithBranches,
  type SessionOrganizerReturn,
} from './useSessionOrganizer'
