import type { HTMLAttributes, InjectionKey } from 'vue'

export type CollapsePanelKey = string | number
export type CollapsePanelVariant = 'outlined' | 'plain'
export type CollapsePanelContentVariant = 'panel' | 'plain'
export type ExpandIconPosition = 'start' | 'inline-end' | 'end'
export type ExpandIconDisplay = 'always' | 'hover'
export type CollapsePanelContentKind = 'text' | 'code'
export type CollapsePanelStatus =
  | 'idle'
  | 'pending'
  | 'executing'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface CollapseGroupContext {
  accordion: boolean
  variant?: CollapsePanelVariant
  contentVariant?: CollapsePanelContentVariant
  expandIconPosition?: ExpandIconPosition
  expandIconDisplay?: ExpandIconDisplay
  registerPanel: (key: CollapsePanelKey, defaultExpanded: boolean) => void
  unregisterPanel: (key: CollapsePanelKey) => void
  isExpanded: (key: CollapsePanelKey, fallbackExpanded: boolean) => boolean
  hasExpanded: (keys: CollapsePanelKey[]) => boolean
  setExpanded: (key: CollapsePanelKey, expanded: boolean) => void
}

export const collapseGroupKey: InjectionKey<CollapseGroupContext> = Symbol('collapse-group')

export interface NestedCollapseItem<TData = unknown> {
  key: CollapsePanelKey
  title?: string
  data?: TData
  children?: NestedCollapseItem<TData>[]
  panel?: boolean
  class?: HTMLAttributes['class']
  childrenClass?: HTMLAttributes['class']
  attrs?: Record<string, unknown>
  defaultCollapsed?: boolean
  defaultExpandedWhenKeys?: CollapsePanelKey[]
  disabled?: boolean
  collapsible?: boolean
  eager?: boolean
  status?: CollapsePanelStatus
  streaming?: boolean
  content?: string
  contentKind?: CollapsePanelContentKind
  contentVariant?: CollapsePanelContentVariant
  contentClass?: HTMLAttributes['class']
  contentAttrs?: Record<string, unknown>
  language?: string
  filePath?: string
  wrapContent?: boolean
  variant?: CollapsePanelVariant
  expandIconPosition?: ExpandIconPosition
  expandIconDisplay?: ExpandIconDisplay
}

export interface NestedCollapsePanelChange<TData = unknown> {
  item: NestedCollapseItem<TData>
  expanded: boolean
  depth: number
}
