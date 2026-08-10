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
  /**
   * 呈现形态(C 期,L3)。`'webview'` = 内容是插件静态根里的一张 HTML,
   * 跑在 sandbox iframe 里;缺省 `'descriptor'` = 描述树。
   */
  view?: 'descriptor' | 'webview'
  /** webview 面板的入口(静态根内相对路径),仅 view === 'webview' 有值。 */
  entry?: string
  /**
   * 插件有没有登记初始化数据的 handler(`panel:init:<panelId>`)。
   *
   * **零代码的纯静态面板是合法的**(声明先于代码):manifest 声明 view+entry
   * 就足以让宿主把 iframe 挂起来,插件可以完全不调 registerWorkspacePanel。
   * 没有这个字段的话,宿主只能靠"请求失败的错误文案里有没有 no request
   * handler"来分辨"没登记"与"登记了但炸了" —— 那是字符串反查,会漂。
   */
  hasInit?: boolean
}

// ── webview 面板(C 期,L3) ────────────────────
//
// 协议常量在 core 的 `plugins/webview.ts`;renderer 吃不到 core,所以这里重述。
// 形状漂移会在 webview 容器测试里当场暴露(它同时吃两边的字面量)。

/** 插件静态资源协议。`onething-plugin://<pluginId>/<path>`。 */
export const PLUGIN_WEBVIEW_SCHEME = 'onething-plugin'

export function pluginWebviewEntryUrl(pluginId: string, entry: string): string {
  return `${PLUGIN_WEBVIEW_SCHEME}://${pluginId}/${entry.replace(/^\/+/, '')}`
}

/**
 * 宿主 ⇄ iframe 的消息名。
 *
 * host → iframe:`init`(首帧握手,带 token 与初始化数据)、`refresh`(插件
 * 调了 ctx.refresh(),宿主重拉之后推来)、`result`(invoke 的回帖)。
 * iframe → host:`ready`(握手确认)、`invoke`(调一个 action)。
 */
export const PLUGIN_WEBVIEW_MESSAGE = {
  init: 'init',
  refresh: 'refresh',
  ready: 'ready',
  invoke: 'invoke',
  result: 'result',
} as const

// ── 氛围层(G2,全窗动画覆盖)────────────────────
//
// 与 webview 面板同一套 token 握手,只是消息集不同:氛围层是纯视觉,没有
// invoke/result(它永远不回调宿主),多了 geometry(枚举地标矩形)与
// pause/resume(窗口失焦/隐藏即停)。协议常量单源在 core 的 `plugins/ambient.ts`;
// renderer 吃不到 core,所以这里重述。形状漂移会在氛围层容器测试里当场暴露。

export const PLUGIN_AMBIENT_MESSAGE = {
  /** host → iframe:首帧握手,带 token。 */
  init: 'ambient-init',
  /**
   * host → iframe:地标词表(名字 × kind × cardinality),握手确认后**发一次**。
   *
   * 静态表单独一条消息,是为了让热路径的 geometry 不背语义字段(L0,
   * `docs/design/plugin-ui/ambient-landmarks-2026-08.md` §4.1)。
   */
  vocabulary: 'ambient-vocabulary',
  /** host → iframe:枚举地标的矩形(viewport + composerRect + surfaces,…)。 */
  geometry: 'ambient-geometry',
  /** host → iframe:窗口失焦/隐藏,停 rAF。 */
  pause: 'ambient-pause',
  /** host → iframe:窗口重新可见,恢复 rAF。 */
  resume: 'ambient-resume',
  /** iframe → host:握手确认。 */
  ready: 'ambient-ready',
} as const

/**
 * 地标的**种类**。`surface` = 可落面(雪能堆在它顶边上);`envelope` = 兜底
 * 包络 —— 也可落,但只在**没有更细的 surface 罩住该列**时才算数(否则天际线
 * 会被包络压成平顶,v1 的病根)。语义进词表而不是让插件点名 composer,
 * 是为了插件对着 kind 写通用物理、不对名字硬编码(§8.1 口诀)。`region`
 * (氛围区,如"避开正文区")是预留格,**本期不建** —— 表 append-only,将来
 * 加一个种类不破老插件(设计文档 §3)。
 */
export type PluginAmbientAnchorKind = 'surface' | 'envelope'

/**
 * 地标的**基数**。singleton 走 querySelector(至多一个,map 里一格);
 * per-item 走 querySelectorAll(同名 N 个矩形,只进 surfaces 数组)。
 */
export type PluginAmbientAnchorCardinality = 'singleton' | 'per-item'

export interface PluginAmbientAnchorSpec {
  kind: PluginAmbientAnchorKind
  cardinality: PluginAmbientAnchorCardinality
}

/**
 * 氛围层地标词表(L0,设计文档 §5)。
 *
 * **宿主命名、append-only**:插件不能发明地标,组件挂表外的名字等于没挂
 * (没人来量)。加一个地标 = 这里一行 + 组件一个 `data-ambient-anchor`。
 *
 * 这张表原样作为 `vocabulary` 消息的 `anchors` 字段过线 —— 插件对着 kind 写
 * 通用物理,不对名字硬编码(换一个氛围插件读同一张表)。
 *
 * 键序 = 测量序 = surfaces 数组里的出场序。
 *
 * 只有视觉层级低于 `--z-ambient` 的**基础 chrome** 可挂标:浮层(菜单/对话框/
 * popover)挂标必得"雪被对话框盖住"的穿帮,禁挂(设计文档 §2)。
 */
export const PLUGIN_AMBIENT_ANCHORS: Readonly<Record<string, PluginAmbientAnchorSpec>> = {
  /** 输入区整摞的**包络**(ChatPanel `.composer-container`):v1 兼容 + 物理兜底。 */
  composer: { kind: 'envelope', cardinality: 'singleton' },
  /** 输入框本体(InputBox `.composer`)—— 真正的"输入框顶边"。 */
  'composer.input': { kind: 'surface', cardinality: 'singleton' },
  /** S 状态带上的每一枚 chip(后台任务 / 目标 / 电台 / 插件块)。 */
  'status.chip': { kind: 'surface', cardinality: 'per-item' },
  /**
   * 输入区内的每个可见块:composer.above 各块与抽屉壳、权限账页、
   * dock(队列/引用/附件)、协作输入提示行。语义是"输入摞里一切看得见的
   * 卡片状东西",不限于插件贡献的 —— 雪该落在最上面那张卡上,而不是
   * 穿过它落到输入框顶边(2026-08-10 盲区盘点)。
   */
  'composer.block': { kind: 'surface', cardinality: 'per-item' },
} as const
