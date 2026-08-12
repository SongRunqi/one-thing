/**
 * 展开意图记录(messagelist 整改 · 第三步)。
 *
 * 消息列表里的"展开/收起"过去有三套互不相通的状态机,而且状态都存在**组件实例
 * 内部**:ProcessRail 的 `userToggled`、CollapseGroup 的 `expandedKeys`、
 * CollapsePanel 的 `internalExpanded`。只要那一段 DOM 因为 key 变化重挂载,
 * 实例状态就没了,"默认值"重新生效 —— 用户点的收起被流式过程一遍遍推翻。
 *
 * 这里存的是**用户的显式意图**,活在组件树之外,按稳定 ID 寻址:
 *
 * - `rail-<messageId>-<组锚>` —— 过程组外壳
 * - `steps-<messageId>:activity-<toolCallId>` —— 工具行
 * - `reasoning-<messageId>-<turnIndex>` —— 行内思考块
 * - `thinking-<messageId>` —— 顶部 MessageThinking
 *
 * 三态优先级固定为 **用户记录 > 流式自动态 > 静态默认**(`resolveExpansion`)。
 * 只在内存里 —— 关掉窗口就忘掉是对的:这是一次阅读会话中的姿态,不是偏好。
 */
import { reactive } from 'vue'

const intents = reactive(new Map<string, boolean>())

/** 用户是否对这个 ID 表过态;没表过返回 undefined(而不是 false)。 */
export function getExpansionIntent(id: string | undefined): boolean | undefined {
  if (!id) return undefined
  return intents.get(id)
}

export function setExpansionIntent(id: string | undefined, expanded: boolean): void {
  if (!id) return
  intents.set(id, expanded)
}

/**
 * 三态合流:用户记录 > 流式自动态 > 静态默认。
 *
 * `auto` 传 undefined 表示"此刻没有自动态可言",于是落到 `fallback`。
 */
export function resolveExpansion(
  id: string | undefined,
  auto: boolean | undefined,
  fallback = false,
): boolean {
  const recorded = getExpansionIntent(id)
  if (recorded !== undefined) return recorded
  return auto ?? fallback
}

/** 测试与会话切换用:不传前缀清空全部,传前缀只清该前缀下的记录。 */
export function clearExpansionIntents(prefix?: string): void {
  if (!prefix) {
    intents.clear()
    return
  }
  for (const key of [...intents.keys()]) {
    if (key.startsWith(prefix)) intents.delete(key)
  }
}
