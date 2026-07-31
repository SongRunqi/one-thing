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
  ACTIVE_WORK_GROUPS,
  ACTIVE_WORK_STATUSES,
  activeWorkHydrationTargets,
  collectActiveWork,
  groupActiveWorkCards,
  hasActiveWorkSignal,
  isActiveWorkStatus,
  resolveActiveWorkRowMeta,
  resolveActiveWorkStage,
  resolveActiveWorkTag,
  type ActiveWorkCardModel,
  type ActiveWorkGroup,
  type ActiveWorkStage,
  type ActiveWorkTag,
  type ActiveWorkTone,
} from './active-work'
export { useActiveWork } from './useActiveWork'

export {
  SIDEBAR_RAIL_CATEGORIES,
  SIDEBAR_RAIL_STORAGE_KEY,
  SIDEBAR_ROOM_FACE_LIMIT,
  resolveRailBadges,
  resolveRailCategories,
  resolveRailCategory,
  shouldShowActiveWorkSection,
  takeRoomFaces,
  type SidebarRailBadges,
  type SidebarRailCategory,
  type SidebarRailCategoryId,
  type SidebarRoomFaces,
} from './sidebar-sections'

export {
  useSessionOrganizer,
  type SessionWithBranches,
  type SessionOrganizerReturn,
} from './useSessionOrganizer'
