import type { ComputedRef, InjectionKey, Ref } from 'vue'

export type MenuMode = 'vertical' | 'horizontal'
export type MenuTrigger = 'hover' | 'click'
export type MenuRoute = string | Record<string, unknown>
export type SubMenuExpandIconPosition = 'start' | 'end'

export interface MenuItemClicked {
  index: string
  indexPath: string[]
  route?: MenuRoute
}

export type MenuSelectEvent = (
  index: string,
  indexPath: string[],
  item: MenuItemClicked,
) => void

export type MenuOpenEvent = (index: string, indexPath: string[]) => void
export type MenuCloseEvent = (index: string, indexPath: string[]) => void

export interface MenuRegisteredItem {
  index: ComputedRef<string>
  indexPath: ComputedRef<string[]>
  disabled: ComputedRef<boolean>
  route: ComputedRef<MenuRoute | undefined>
}

export interface MenuRegisteredSubMenu {
  index: ComputedRef<string>
  indexPath: ComputedRef<string[]>
  disabled: ComputedRef<boolean>
}

export interface MenuContext {
  activeIndex: Ref<string>
  mode: ComputedRef<MenuMode>
  collapse: ComputedRef<boolean>
  uniqueOpened: ComputedRef<boolean>
  menuTrigger: ComputedRef<MenuTrigger>
  popperOffset: ComputedRef<number>
  showTimeout: ComputedRef<number>
  hideTimeout: ComputedRef<number>
  registerItem: (item: MenuRegisteredItem) => void
  unregisterItem: (index: string) => void
  registerSubMenu: (subMenu: MenuRegisteredSubMenu) => void
  unregisterSubMenu: (index: string) => void
  isItemActive: (index: string) => boolean
  isSubMenuActive: (index: string) => boolean
  isSubMenuOpen: (index: string) => boolean
  selectItem: (item: MenuItemClicked) => void
  toggleSubMenu: (index: string, indexPath: string[], open?: boolean) => void
  closeAllSubMenus: () => void
}

export interface SubMenuContext {
  indexPath: ComputedRef<string[]>
  level: ComputedRef<number>
}

export const menuContextKey: InjectionKey<MenuContext> = Symbol('menu-context')
export const subMenuContextKey: InjectionKey<SubMenuContext> = Symbol('sub-menu-context')
