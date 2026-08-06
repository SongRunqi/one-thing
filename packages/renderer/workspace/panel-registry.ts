/**
 * 工作区面板注册表 —— 面板存在感的**单一事实来源**。
 *
 * 在这之前,同一份清单被手抄在 ≥6 处,并且已经漂移出真实缺陷(设计文档 §2
 * 勘误表 P2 行):
 *  - `Sidebar.vue` 的 props 联合残留死成员 `'memory'`,而同文件的本地联合已经没有它;
 *  - `MediaPanel.vue` 的联合多出 `'archive'`,别处都没有;
 *  - 侧栏的 `workspaceActions` 漏了 `practice` —— 那个面板于是只能靠一条
 *    window 事件进入,图标入口根本不存在。
 *
 * 手抄清单的问题不是"重复",是**漏一个就等于把一个面板弄没**,而且编译器不会
 * 提醒。所以这里定义一次,别处一律派生。
 */
import type { Component } from 'vue'
import {
  Activity,
  Archive,
  Bot,
  CalendarClock,
  Images,
  Radio,
} from 'lucide-vue-next'

export interface WorkspacePanelDefinition {
  id: string
  label: string
  icon: Component
  /**
   * 出现在侧栏「⋯」工作区菜单里。
   *
   * dock 图标排在 workbench 形态下已经撤掉,这个菜单是这些面板**唯一**的
   * 图标入口 —— 少一项就是少一个进得去的面板。
   */
  inSidebarMenu: boolean
  /** 出现在工作区面板顶部的导航条。 */
  inPanelNav: boolean
  /**
   * 能否成为 App 的 `activeWorkspacePanel`。
   *
   * `false` 的成员只能在面板内部切(`archive` 就是这种:它是 MediaPanel 的
   * 一个 nav tab,不是一个可以从外面打开的工作区面板)。
   */
  openable: boolean
  /**
   * 深在组件树里、够不着 emit 链的地方用的 window 事件入口。
   * 收编进注册表是为了让"这个面板有几条进入路径"这件事有地方可查。
   */
  windowEvent?: string
}

/**
 * 内置面板。
 *
 * 顺序即呈现顺序(侧栏菜单与面板导航条都按它排)。
 */
export const BUILTIN_WORKSPACE_PANELS = [
  { id: 'media', label: 'Media', icon: Images, inSidebarMenu: true, inPanelNav: true, openable: true },
  {
    id: 'agents',
    label: 'Agents',
    icon: Bot,
    inSidebarMenu: true,
    inPanelNav: true,
    openable: true,
    // Agent 空间页:群聊气泡、dm 房头够不着 openWorkspacePanel 的 emit 链。
    windowEvent: 'agents:open-workspace',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: CalendarClock,
    inSidebarMenu: true,
    inPanelNav: true,
    openable: true,
    windowEvent: 'todo-plan:web-window-action',
  },
  { id: 'music', label: 'Music', icon: Radio, inSidebarMenu: true, inPanelNav: true, openable: true },
  {
    id: 'practice',
    label: 'Practice',
    icon: Activity,
    // 注意:practice 至今**不在**侧栏菜单里 —— 这是勘误表记录的既有缺陷。
    // 注册表如实记录现状;补入口是行为变化,不属于这次纯重构。
    inSidebarMenu: false,
    inPanelNav: true,
    openable: true,
    windowEvent: 'practice:open-workspace',
  },
  {
    id: 'archive',
    label: 'Archived Chats',
    icon: Archive,
    inSidebarMenu: false,
    inPanelNav: true,
    // 面板内部的 tab,不是可从外面打开的工作区面板(原先的 `archive` 特例)。
    openable: false,
  },
] as const satisfies readonly WorkspacePanelDefinition[]

/**
 * 派生清单的元素类型。
 *
 * 刻意**不**标成 `WorkspacePanelDefinition[]`:那个接口的 `id: string` 会把
 * `as const` 保住的字面量重新拓宽回 `string`,`activeWorkspacePanel` 拼错名字
 * 就又不报错了 —— 收编手抄清单不等于放弃类型。
 */
export type WorkspacePanelEntry = (typeof BUILTIN_WORKSPACE_PANELS)[number]

/** 面板导航条(含只能内部切的成员)。 */
export const WORKSPACE_NAV_PANELS: readonly WorkspacePanelEntry[] =
  BUILTIN_WORKSPACE_PANELS.filter(panel => panel.inPanelNav)

/** 侧栏「⋯」菜单项。 */
export const WORKSPACE_MENU_PANELS: readonly WorkspacePanelEntry[] =
  BUILTIN_WORKSPACE_PANELS.filter(panel => panel.inSidebarMenu)

/** 可从外面打开的面板 id。 */
export const OPENABLE_WORKSPACE_PANEL_IDS: readonly string[] = BUILTIN_WORKSPACE_PANELS
  .filter(panel => panel.openable)
  .map(panel => panel.id)

/**
 * 面板 id 的类型。
 *
 * 保持字面量联合而不是退化成 `string`:`activeWorkspacePanel` 拼错一个名字
 * 仍然要在编译期被抓住 —— 收编手抄清单不等于放弃类型。
 */
export type WorkspacePanelId = (typeof BUILTIN_WORKSPACE_PANELS)[number]['id']
export type OpenableWorkspacePanelId = Exclude<WorkspacePanelId, 'archive'>

export function isWorkspacePanelId(value: unknown): value is WorkspacePanelId {
  return typeof value === 'string' && BUILTIN_WORKSPACE_PANELS.some(panel => panel.id === value)
}

export function isOpenableWorkspacePanelId(value: unknown): value is OpenableWorkspacePanelId {
  return typeof value === 'string' && OPENABLE_WORKSPACE_PANEL_IDS.includes(value)
}

export function findWorkspacePanel(id: string): WorkspacePanelEntry | undefined {
  return BUILTIN_WORKSPACE_PANELS.find(panel => panel.id === id)
}

/**
 * 某个面板的 window 事件入口名。
 *
 * 事件名的**事实源**仍在各自的产生方(例如 agents 的常量在 stores/agents.ts),
 * 注册表只是把"这个面板还有一条 window 事件入口"这件事记下来 —— 收编的是
 * 可发现性,不是所有权。
 */
export function workspacePanelWindowEvent(id: WorkspacePanelId): string {
  const panel = findWorkspacePanel(id) as WorkspacePanelDefinition | undefined
  if (!panel?.windowEvent) throw new Error(`Workspace panel "${id}" has no window event entry`)
  return panel.windowEvent
}
