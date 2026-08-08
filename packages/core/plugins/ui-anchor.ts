/**
 * 插件 UI **锚点**(R5.x-a)—— 宿主 UI 中允许插件嵌入的具名位置。
 *
 * 三条裁决落在这里:
 *  1. **锚点清单是宿主编译期常量,插件不能发明锚点。** 插件说"我要
 *     `composer.above`"宿主才知道往哪渲染;插件自造锚点名 = 宿主不知道在哪画。
 *     (对照:VS Code 的 contribution points 同样是宿主定义集合。)
 *  2. **锚点块 = 描述树**(复用 panel.ts 的协议/校验/渲染),与工作区面板同一套
 *     通道、同一套熔断账。"UI 永不执行插件代码"不因锚点而松动 —— 锚点是
 *     "渲染位置"的扩展,不是"执行模型"的扩展。
 *  3. **命名空间即契约**:锚点块走 `ui:render:<anchor>:<id>` /
 *     `ui:action:<anchor>:<id>` 请求通道,`ui:` 是宿主保留前缀(与 `panel:` 同规),
 *     插件不得自行注册该前缀下的 handler。
 *
 * 设计文档:docs/design/plugin-ui/plugin-ui-anchors-2026-08.md。
 */
import type {
  CorePluginPanelContext,
  PluginPanelActionResult,
  PluginPanelTree,
} from './panel.js'

// ── 锚点清单(单一事实源) ───────────────────────

export interface UiAnchorCapacity {
  /**
   * 该锚点最多容纳几个插件块。
   * 跨插件按全局规范顺序截断(见 ui-anchor-registry),插件内按 manifest 声明顺序。
   * **加载失败的块不计入**(折叠为聚合指示,健康插件不被挤掉)。
   */
  maxBlocks: number
  /** 单块最大高度(px)。宿主用它做溢出裁剪与滚动。 */
  maxHeight: number
  /** 推荐的描述树根节点形态(提示,不强制)。 */
  rootHint?: 'row' | 'stack' | 'any'
}

/**
 * 每个锚点的容量语义 —— **单一事实源**:锚点 id 的字面量联合从这里派生
 * (`keyof typeof UI_ANCHOR_CAPACITY`),UI_ANCHORS 的值反过来受它约束
 * (`satisfies`):任何一边漏配/多配/拼错都在 typecheck 变红。
 *
 * 注:设计文档初稿的 `UiAnchorId` 品牌类型 + `Record<品牌字面量, …>` 方案在
 * 实施时被否 —— TS 对品牌交叉键的映射类型**不做键集合校验**(漏键/多键都不红,
 * 实测),用普通字面量联合才能拿到真正的类型级钉住。
 */
export const UI_ANCHOR_CAPACITY = {
  /** 输入框上方横条(composer-stack 顶部)。单行,最多 3 块。 */
  'composer.above': { maxBlocks: 3, maxHeight: 32, rootHint: 'row' },
  /** 聊天面底部状态条(ChatPanel 内,MessageList 之下)。横向,每块 icon+短文本。 */
  'chat.status-bar': { maxBlocks: 8, maxHeight: 24, rootHint: 'row' },
  /**
   * 每条消息尾部(MessageItem 的 .message-footer,时间戳与操作行之间)。
   * 第一个**消息级**锚点:宿主按消息实例挂载,render ctx 额外带 messageId
   * (插件据此把状态按消息对号入座);只挂 assistant 消息。单行小字。
   */
  'message.footer': { maxBlocks: 6, maxHeight: 24, rootHint: 'row' },
} as const satisfies Record<string, UiAnchorCapacity>

/** 锚点 id 的字面量联合 —— 由容量表派生,不另写一份。
 *
 * 命名约定:`<区域>.<槽位>`,全小写(composer.above / chat.status-bar),
 * 与审计文档的候选清单(composer.dock / sidebar.menu / chat.header …)同规。
 *
 * 新增一个锚点要动**四处**:本表、UI_ANCHORS、renderer 侧挂点组件、拆除快照测试。 */
export type UiAnchor = keyof typeof UI_ANCHOR_CAPACITY

/**
 * 宿主支持的锚点清单(具名常量面)。值必须出自容量表的键集合 ——
 * `satisfies` 让拼错/自造锚点在 typecheck 就红。
 */
export const UI_ANCHORS = {
  composerAbove: 'composer.above',
  statusBar: 'chat.status-bar',
  messageFooter: 'message.footer',
} as const satisfies Record<string, UiAnchor>

/** 这个字符串是不是宿主认识的锚点。未知锚点的处置见 loader/投影层(降级,不拒绝)。 */
export function isUiAnchor(value: string): value is UiAnchor {
  return value in UI_ANCHOR_CAPACITY
}

/**
 * 键集合一致性守卫:`UI_ANCHOR_CAPACITY` 的键集合必须等于 `UI_ANCHORS` 的
 * 产出集合。类型层面由 `Record<UiAnchor, …>` 兜住"漏配",这条运行时断言兜住
 * "多配"(加了一个锚点常量却忘了删容量表里的旧键,反之亦然)。
 * 装配期调用一次;测试里逐键反查。
 */
export function assertUiAnchorRegistryConsistency(): void {
  const anchors = Object.values(UI_ANCHORS) as string[]
  const capacities = Object.keys(UI_ANCHOR_CAPACITY)
  const missing = anchors.filter(id => !(id in UI_ANCHOR_CAPACITY))
  const extra = capacities.filter(id => !anchors.includes(id as UiAnchor))
  if (missing.length || extra.length) {
    throw new Error(
      `UI anchor registry inconsistency: missing capacity for [${missing.join(', ')}], `
      + `stale capacity for [${extra.join(', ')}]`,
    )
  }
}

// ── 请求通道寻址 ────────────────────────────

/** 请求通道上的两个 action 名 —— 宿主与插件的约定(与 panel:* 同规)。 */
export const PLUGIN_UI_RENDER_ACTION = 'ui:render'
export const PLUGIN_UI_INVOKE_ACTION = 'ui:action'

/** 块地址:`<anchor>:<id>` —— action 与 surface 共用的中段。 */
export function uiSlotAddress(anchorId: string, slotId: string): string {
  return `${anchorId}:${slotId}`
}

/**
 * 块在降级语义里的 surface id:`ui:<anchor>:<id>`。
 *
 * render 与 action 折叠成同一个 surface(describePluginSurface 负责)——
 * 它们是同一块 UI,分开降级会出现"画得出来但点不动"。panel-refresh 通知的
 * panelId 字段也用这个值,renderer 按它与块对号入座。
 */
export function uiSlotSurfaceId(anchorId: string, slotId: string): string {
  return `ui:${uiSlotAddress(anchorId, slotId)}`
}

/** `ui:` 是宿主保留的命名空间 —— 插件不能自己往里登记 handler(与 panel: 同规)。 */
export function isReservedPluginUiAction(action: string): boolean {
  return action.startsWith('ui:')
}

// ── 插件侧注册面 ─────────────────────────────

/**
 * 锚点块的 render/onAction 上下文。
 *
 * 在面板 ctx(requestId / abortSignal / refresh)之上多两个字段,**v1 就带上**:
 *  - `anchor`:插件知道自己在哪个锚点,返回"单行友好"或"整页友好"的树;
 *  - `sessionId`:该块当前所属的会话(宿主在会话切换时重拉 render)。
 *    返回不依赖 sessionId 的树即天然"全局块"。
 *
 * 没有 sessionId,"plan 插件显示当前会话执行状态"在多窗口/多会话下必然显示
 * 错误会话的状态 —— 这是验收判据的硬性依赖,不能推迟到二期再改协议。
 */
export interface CorePluginUiSlotContext extends CorePluginPanelContext {
  readonly anchor: string
  readonly sessionId: string | null
  /**
   * 仅消息级锚点(message.footer):该块所属的消息 id —— 插件据此把状态
   * 按消息对号入座(每条消息一个块实例)。会话级锚点不携带。
   */
  readonly messageId?: string | null
}

export interface CorePluginUiSlotRegistration<
  TTree = PluginPanelTree,
  TResult = PluginPanelActionResult,
> {
  /** 必须是宿主锚点清单中的一员(未知锚点 = 代码错误,registration 熔断)。 */
  anchor: string
  /** 必须与 manifest 的 contributes.uiSlots 里某一项(同 anchor)的 id 一致。 */
  id: string
  render(ctx: CorePluginUiSlotContext): TTree | Promise<TTree>
  onAction?(
    input: { actionId: string; payload?: unknown },
    ctx: CorePluginUiSlotContext,
  ): TResult | void | Promise<TResult | void>
}
