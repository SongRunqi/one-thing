/**
 * 声明式面板的**描述树协议**(R5)。
 *
 * 两条裁决落在这里:
 *  1. **静态存在感走 manifest**:面板的 id/label/icon 声明在
 *     `contributes.panels`(R2 已建),运行期的 `registerWorkspacePanel` 只绑定
 *     行为。宿主凭清单就能渲染面板入口 —— 未启用的插件也有入口(点开提示启用)。
 *  2. **UI 永不执行插件代码**:插件交出的是一棵**纯数据**的描述树,渲染由宿主做。
 *     这是"窄腰"在 UI 侧的落地:插件能表达什么,与插件代码在哪执行,彻底解耦。
 *
 * 宪法第 2 条在这里是硬约束:**描述树禁函数成员**。按钮回调用 actionId 寻址,
 * 不是塞一个闭包 —— 闭包过不了 IPC,更过不了 H 线的进程边界。
 */
import { describeNonSerializable } from './request-channel.js'

/**
 * 协议版本。
 *
 * 描述树要活很多期(R5 只开这一小撮节点),留一个版本字段,宿主才能在将来
 * 同时认识新旧两棵树而不必猜。
 */
export const PLUGIN_PANEL_PROTOCOL_VERSION = 1

/** 请求通道上的两个 action 名 —— 宿主与插件的约定。 */
export const PLUGIN_PANEL_RENDER_ACTION = 'panel:render'
export const PLUGIN_PANEL_INVOKE_ACTION = 'panel:action'

export interface PluginPanelStackNode {
  type: 'stack'
  /** 纵向堆叠;gap 走宿主的间距刻度,不接受任意像素值。 */
  gap?: 'none' | 'small' | 'medium'
  children: PluginPanelNode[]
}

export interface PluginPanelListItem {
  id: string
  title: string
  subtitle?: string
  badge?: string
  /** 点击整行时派发的 action;省略则该行不可点。 */
  actionId?: string
  /** 随 action 一起回传的负载(必须 JSON-可序列化)。 */
  payload?: unknown
}

export interface PluginPanelListNode {
  type: 'list'
  title?: string
  items: PluginPanelListItem[]
  /** 列表为空时的替代内容。 */
  emptyText?: string
}

export interface PluginPanelMarkdownNode {
  type: 'markdown'
  /** 由宿主渲染 —— 插件给的是文本,不是 HTML。 */
  text: string
}

export interface PluginPanelButtonNode {
  type: 'button'
  label: string
  actionId: string
  payload?: unknown
  variant?: 'default' | 'danger'
  disabled?: boolean
}

export interface PluginPanelRowNode {
  type: 'row'
  children: PluginPanelNode[]
}

/** 表单:直接复用 R3 的控件描述,不发明第二套控件语言。 */
export interface PluginPanelFormNode {
  type: 'form'
  /** 提交按钮的 action;省略则表单只读。 */
  submitActionId?: string
  submitLabel?: string
  fields: PluginPanelFormField[]
}

export interface PluginPanelFormField {
  key: string
  label: string
  hint?: string
  control: 'switch' | 'text' | 'number' | 'select' | 'string-list'
  options?: string[]
  value?: unknown
}

export interface PluginPanelEmptyStateNode {
  type: 'empty-state'
  title: string
  description?: string
  actionId?: string
  actionLabel?: string
}

export type PluginPanelNode =
  | PluginPanelStackNode
  | PluginPanelRowNode
  | PluginPanelListNode
  | PluginPanelMarkdownNode
  | PluginPanelButtonNode
  | PluginPanelFormNode
  | PluginPanelEmptyStateNode

export interface PluginPanelTree {
  version: number
  /** 面板标题栏的补充文案(可选)。 */
  title?: string
  body: PluginPanelNode
}

/**
 * action 的返回。
 *
 * `refresh` 让插件说"我改了状态,重新拉一次 render",不必自己再拼一棵树;
 * `tree` 让它直接给新树(省一次往返)。两者都不给 = 什么也不做。
 */
export interface PluginPanelActionResult {
  refresh?: boolean
  tree?: PluginPanelTree
  /** 一句给用户看的反馈(宿主用 toast 呈现)。 */
  notice?: string
}

const PANEL_NODE_TYPES = new Set([
  'stack', 'row', 'list', 'markdown', 'button', 'form', 'empty-state',
])

const FORM_CONTROLS = new Set(['switch', 'text', 'number', 'select', 'string-list'])

/** 描述树最大深度 —— 一棵能渲染的面板树不需要更深,深了多半是拼错了。 */
const MAX_PANEL_DEPTH = 12

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 校验一棵描述树。返回错误字符串,不抛 —— 调用方要把它变成面板的错误态,
 * 而不是让整个外壳崩掉。
 *
 * **禁函数成员**是这里的主命题(宪法第 2 条):塞进来的闭包在 IPC 上会被静默
 * 丢弃,插件那边看着"注册成功了",用户点下去毫无反应 —— 当场拒掉才说得清。
 */
export function validatePluginPanelTree(tree: unknown): string | null {
  if (!isPlainRecord(tree)) return 'panel tree must be an object'
  if (typeof tree.version !== 'number') return 'panel tree must carry a numeric "version"'
  if (tree.version > PLUGIN_PANEL_PROTOCOL_VERSION) {
    return `panel tree version ${tree.version} is newer than this host supports (${PLUGIN_PANEL_PROTOCOL_VERSION})`
  }
  if (tree.title !== undefined && typeof tree.title !== 'string') {
    return 'panel tree "title" must be a string'
  }

  // 整棵树过一次序列化浅校验:函数/Map/Set/类实例一律在这里止步。
  const problem = describeNonSerializable(tree, 'panel tree')
  if (problem) return `panel tree must be pure data: ${problem}`

  return validateNode(tree.body, 'body', 0)
}

function validateNode(node: unknown, path: string, depth: number): string | null {
  if (depth > MAX_PANEL_DEPTH) return `${path}: panel tree is nested deeper than ${MAX_PANEL_DEPTH} levels`
  if (!isPlainRecord(node)) return `${path} must be an object`

  const type = node.type
  if (typeof type !== 'string' || !PANEL_NODE_TYPES.has(type)) {
    return `${path}.type must be one of ${[...PANEL_NODE_TYPES].join('/')}`
  }

  switch (type) {
    case 'stack':
    case 'row': {
      if (!Array.isArray(node.children)) return `${path}.children must be an array`
      for (const [index, child] of node.children.entries()) {
        const error = validateNode(child, `${path}.children[${index}]`, depth + 1)
        if (error) return error
      }
      return null
    }
    case 'list': {
      if (!Array.isArray(node.items)) return `${path}.items must be an array`
      for (const [index, item] of node.items.entries()) {
        if (!isPlainRecord(item)) return `${path}.items[${index}] must be an object`
        if (typeof item.id !== 'string' || !item.id) return `${path}.items[${index}].id must be a non-empty string`
        if (typeof item.title !== 'string') return `${path}.items[${index}].title must be a string`
      }
      return null
    }
    case 'markdown':
      return typeof node.text === 'string' ? null : `${path}.text must be a string`
    case 'button': {
      if (typeof node.label !== 'string' || !node.label) return `${path}.label must be a non-empty string`
      if (typeof node.actionId !== 'string' || !node.actionId) {
        // 按钮靠 actionId 寻址,不是靠闭包 —— 这条正是"禁函数成员"的实际用法。
        return `${path}.actionId must be a non-empty string (buttons address actions by id, not by callback)`
      }
      return null
    }
    case 'form': {
      if (!Array.isArray(node.fields)) return `${path}.fields must be an array`
      for (const [index, field] of node.fields.entries()) {
        if (!isPlainRecord(field)) return `${path}.fields[${index}] must be an object`
        if (typeof field.key !== 'string' || !field.key) return `${path}.fields[${index}].key must be a non-empty string`
        if (typeof field.label !== 'string') return `${path}.fields[${index}].label must be a string`
        if (typeof field.control !== 'string' || !FORM_CONTROLS.has(field.control)) {
          return `${path}.fields[${index}].control must be one of ${[...FORM_CONTROLS].join('/')}`
        }
        if (field.control === 'select' && (!Array.isArray(field.options) || field.options.length === 0)) {
          return `${path}.fields[${index}] uses control "select" and needs a non-empty "options" array`
        }
      }
      return null
    }
    case 'empty-state':
      return typeof node.title === 'string' && node.title ? null : `${path}.title must be a non-empty string`
    default:
      return `${path}.type "${type}" is not supported`
  }
}

export function validatePluginPanelActionResult(result: unknown): string | null {
  if (result === undefined || result === null) return null
  if (!isPlainRecord(result)) return 'panel action result must be an object'
  const problem = describeNonSerializable(result, 'panel action result')
  if (problem) return `panel action result must be pure data: ${problem}`
  if (result.tree !== undefined) return validatePluginPanelTree(result.tree)
  return null
}

// ── 插件侧注册面 ─────────────────────────────

export interface CorePluginPanelContext {
  /** 本次调用的地址(来自请求通道)。 */
  readonly requestId: string
  readonly abortSignal: AbortSignal
  /**
   * 让宿主重新拉一次 render。
   *
   * 这是插件**主动**刷新面板的唯一出口 —— 走既有的通知通道投递,
   * 不另开一条轨(§5.2 第 4 条:自定义事件不跨 IPC,R5 需要投递面时复用现成的)。
   */
  refresh(): void
}

export interface CorePluginPanelRegistration<TTree = PluginPanelTree, TResult = PluginPanelActionResult> {
  /** 必须与 manifest 的 contributes.panels 里某一项的 id 一致。 */
  id: string
  render(ctx: CorePluginPanelContext): TTree | Promise<TTree>
  onAction?(
    input: { actionId: string; payload?: unknown },
    ctx: CorePluginPanelContext,
  ): TResult | void | Promise<TResult | void>
}
