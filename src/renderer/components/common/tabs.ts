import type { ComputedRef, InjectionKey, Ref, VNodeChild } from 'vue'

export type TabPaneName = string | number
export type TabsType = '' | 'card' | 'border-card'
export type TabsPosition = 'top' | 'right' | 'bottom' | 'left'
export type TabsEditAction = 'add' | 'remove'

export interface TabPaneSlotProps {
  active: boolean
  disabled: boolean
  index: number
  label: string
  name: TabPaneName
}

export interface TabPaneState {
  uid: number
  element: Ref<HTMLElement | null>
  label: ComputedRef<string>
  name: ComputedRef<TabPaneName | undefined>
  disabled: ComputedRef<boolean>
  closable: ComputedRef<boolean>
  lazy: ComputedRef<boolean>
  renderLabel?: (props: TabPaneSlotProps) => VNodeChild
}

export interface TabsPaneContext extends TabPaneSlotProps {
  closable: boolean
  lazy: boolean
  uid: number
}

export type TabsBeforeLeave = (
  newName: TabPaneName,
  oldName: TabPaneName | undefined,
) => boolean | void | Promise<boolean | void>

export interface TabsContext {
  registerPane: (pane: TabPaneState) => void
  unregisterPane: (uid: number) => void
  isPaneActive: (uid: number) => boolean
  getPaneName: (uid: number) => TabPaneName | undefined
  getPaneTabId: (uid: number) => string | undefined
  getPanePanelId: (uid: number) => string | undefined
}

export const tabsContextKey: InjectionKey<TabsContext> = Symbol('tabs-context')
