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
    | 'textarea' | 'slider' | 'checkbox-group' | 'radio' | 'date' | 'color'
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
  // ── v2(R5.x-b)—— 与 core/plugins/panel.ts 同一份协议 ──
  | { type: 'table'; columns: Array<{ key: string; label: string; width?: number }>; rows: Array<{ key: string; cells: Record<string, string | number | boolean | null> }>; emptyText?: string }
  | { type: 'tabs'; items: Array<{ id: string; label: string; body: PluginPanelNodeData }> }
  | { type: 'progress'; value?: number; indeterminate?: boolean; label?: string }
  | { type: 'spinner'; label?: string }
  | { type: 'badge'; text: string; tone?: 'default' | 'accent' | 'danger' | 'success' }
  | { type: 'image'; url: string; alt: string; maxWidth?: number }
  | { type: 'link'; text: string; url?: string; actionId?: string; payload?: unknown }
  | { type: 'code'; text: string; language?: string }
  | { type: 'divider' }

export interface PluginPanelTreeData {
  version: number
  title?: string
  body: PluginPanelNodeData
  /** 树级轮询(v2):宿主在块可见时按周期重拉;下限 1000ms(1Hz 上限)。 */
  refreshIntervalMs?: number
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
