/**
 * Sidebar Components
 *
 * Sidebar component collection, including session list and management features
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
