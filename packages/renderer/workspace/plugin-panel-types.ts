/**
 * 描述树在 renderer 侧的类型。
 *
 * 与 core 的 `packages/core/plugins/panel.ts` 是同一份协议 —— renderer 不能吃
 * core(它是主进程侧的包),所以这里重述结构。真正的守卫在 core 的
 * `validatePluginPanelTree`:树在过线之前就被校验过,renderer 只负责画。
 * 形状漂移会在插件面板测试里当场暴露(它同时吃两边)。
 */

export interface PluginPanelListItemData {
  id: string
  title: string
  subtitle?: string
  badge?: string
  actionId?: string
  payload?: unknown
}

export interface PluginPanelFormFieldData {
  key: string
  label: string
  hint?: string
  control: 'switch' | 'text' | 'number' | 'select' | 'string-list'
  options?: string[]
  value?: unknown
}

export type PluginPanelNodeData =
  | { type: 'stack'; gap?: 'none' | 'small' | 'medium'; children: PluginPanelNodeData[] }
  | { type: 'row'; children: PluginPanelNodeData[] }
  | { type: 'list'; title?: string; items: PluginPanelListItemData[]; emptyText?: string }
  | { type: 'markdown'; text: string }
  | { type: 'button'; label: string; actionId: string; payload?: unknown; variant?: 'default' | 'danger'; disabled?: boolean }
  | { type: 'form'; submitActionId?: string; submitLabel?: string; fields: PluginPanelFormFieldData[] }
  | { type: 'empty-state'; title: string; description?: string; actionId?: string; actionLabel?: string }

export interface PluginPanelTreeData {
  version: number
  title?: string
  body: PluginPanelNodeData
}

/** 插件贡献的面板在 renderer 侧的呈现单位。 */
export interface PluginWorkspacePanel {
  pluginId: string
  pluginName: string
  panelId: string
  label: string
  /**
   * 插件是否真的活着(加载成功)。
   *
   * 没有 `enabled` 字段:停用的插件根本不进这个清单(入口随之消失)。
   * 这里区分的是"启用了但没起来" —— 入口在,内容是一句人话的失败说明。
   */
  loaded: boolean
}
