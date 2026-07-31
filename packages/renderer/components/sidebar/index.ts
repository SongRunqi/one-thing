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
export { default as ActiveWorkSection } from './ActiveWorkSection.vue'
export { default as ActiveWorkCard } from './ActiveWorkCard.vue'

export {
  ACTIVE_WORK_STATUSES,
  activeWorkHydrationTargets,
  collectActiveWork,
  isActiveWorkStatus,
  resolveActiveWorkStage,
  resolveActiveWorkTag,
  type ActiveWorkCardModel,
  type ActiveWorkStage,
  type ActiveWorkTag,
  type ActiveWorkTone,
} from './active-work'
export { useActiveWork } from './useActiveWork'

export {
  useSessionOrganizer,
  type SessionWithBranches,
  type SessionOrganizerReturn,
} from './useSessionOrganizer'
