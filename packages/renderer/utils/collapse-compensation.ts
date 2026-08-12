/**
 * 自动塌缩的滚动补偿。
 *
 * 规则只有一条:**任何「自动」(非用户点击)的高度塌缩,如果发生在当前视口
 * 可见内容的上方,必须把塌掉的高度从 scrollTop 里减掉** —— 用户正在读的那行字
 * 在屏幕上不动。用户自己点收起不补偿:那是主动行为,内容上移是预期内的。
 *
 * 为什么不只靠浏览器原生的 scroll anchoring:消息列表的滚动容器确实是
 * `overflow-anchor: auto`(MessageList 只在哨兵/空态/分页药丸上显式关掉),
 * 但原生锚定既不可断言也不可测(jsdom / happy-dom 根本没实现),而且流式期间
 * 跟底逻辑会持续程序化写 scrollTop,和锚定调整互相盖写。所以原生锚定留着当
 * 免费的第一层,这里这层是**确定性的、可单测的**那条腰带。
 *
 * 用法(组件在塌缩前一刻拿快照,DOM 落定后调用返回的函数):
 *
 * ```ts
 * const apply = beginCollapseCompensation(rootEl)   // 塌缩前(pre-flush watcher)
 * nextTick(() => apply?.())                          // 塌缩后
 * ```
 */

/** 元素上/下边相对滚动容器视口顶的位置,以及「本来就贴底」。 */
export interface CollapseAnchorGeometry {
  /** 元素上边 - 容器视口顶。负数 = 元素起点在视口顶之上。 */
  top: number
  /** 元素下边 - 容器视口顶。 */
  bottom: number
  /** 塌缩前滚动容器已经停在自然底部(跟底态),此时交给跟底逻辑。 */
  atBottom: boolean
}

/** 元素上边贴着视口顶时算「可见」,不补偿。 */
const VIEWPORT_TOP_EPSILON_PX = 1
/** 贴底判定容差,与 useFollowScroll 的 BOTTOM_EPSILON 同量级。 */
const BOTTOM_EPSILON_PX = 2

/**
 * 纯计算:返回应当**加到** scrollTop 上的增量(塌缩时为负数,0 表示不补偿)。
 *
 * 只在两种几何关系下补偿(与录屏里那两个跳动源一一对应):
 * - 元素整体在视口顶之上(底边也在上面):用户读的内容全部在它下方;
 * - 元素横跨视口顶:用户读的内容在它下半段之下。
 * 元素完全落在视口内(top >= 0)时不补偿 —— 用户看得见它在收,那不是"内容
 * 被抽走",而且补偿会把它上方的内容反向推下来。
 */
export function computeCollapseCompensation(
  before: CollapseAnchorGeometry,
  afterBottom: number,
): number {
  // 贴底态由跟底逻辑负责,补偿会和它打架。
  if (before.atBottom) return 0
  // 元素起点在视口内 → 它上方什么也没塌。
  if (before.top >= -VIEWPORT_TOP_EPSILON_PX) return 0
  const delta = afterBottom - before.bottom
  // 只补偿"变矮"。长高(流式往里塞内容)不是这层的事。
  if (delta >= 0) return 0
  return delta
}

/** 从元素往上找真正的纵向滚动容器。 */
export function findScrollContainer(el: HTMLElement | null | undefined): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const view = node.ownerDocument?.defaultView
    const overflowY = view?.getComputedStyle(node).overflowY
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

/** 量一次快照;元素或容器缺一不可。 */
export function measureCollapseAnchor(
  el: HTMLElement | null | undefined,
  scroller: HTMLElement | null | undefined,
): CollapseAnchorGeometry | null {
  if (!el || !scroller) return null
  const elRect = el.getBoundingClientRect()
  const scrollerRect = scroller.getBoundingClientRect()
  return {
    top: elRect.top - scrollerRect.top,
    bottom: elRect.bottom - scrollerRect.top,
    atBottom:
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= BOTTOM_EPSILON_PX,
  }
}

/**
 * 在塌缩发生**之前**调用:拿到快照并返回一个「DOM 落定后执行」的补偿函数。
 * 返回 null 表示这次无从补偿(元素/容器不在)。返回的函数给出实际写入的位移。
 */
export function beginCollapseCompensation(
  el: HTMLElement | null | undefined,
  scroller?: HTMLElement | null,
): (() => number) | null {
  const target = el ?? null
  const box = scroller ?? findScrollContainer(target)
  const before = measureCollapseAnchor(target, box)
  if (!target || !box || !before) return null

  return () => {
    const afterRect = target.getBoundingClientRect()
    const boxRect = box.getBoundingClientRect()
    const delta = computeCollapseCompensation(before, afterRect.bottom - boxRect.top)
    if (delta === 0) return 0
    const next = Math.max(0, box.scrollTop + delta)
    const applied = next - box.scrollTop
    if (applied === 0) return 0
    box.scrollTop = next
    return applied
  }
}
