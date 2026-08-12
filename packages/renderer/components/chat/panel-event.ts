import type { SplitDirection } from '@/stores/workspace-tree'

/** Bubbled up one `panel-event` at a time through nested PanelTree levels so each level only needs to declare a single emit. */
export type PanelEvent =
  | { type: 'focus'; leafId: string }
  | { type: 'openSplitSearch'; leafId: string }
  | { type: 'closePanel'; leafId: string }
  | { type: 'equalize'; leafId: string }
  | { type: 'splitWithBranch'; leafId: string; sessionId: string }
  | { type: 'toggleSidebar'; leafId: string }
  | { type: 'openSearch'; leafId: string }
  | { type: 'createNewChat'; leafId: string }
  | { type: 'toggleInspector'; leafId: string }
  | { type: 'openFile'; leafId: string; filePath: string }
  | { type: 'reviewGoal'; leafId: string; sessionId: string }
  | { type: 'switchSession'; leafId: string; sessionId: string }
  | { type: 'splitDrop'; leafId: string; direction: SplitDirection; sessionId: string; sourcePanelId: string }
  | { type: 'toggleSidePanel'; leafId: string }
