/**
 * 房面滚动的两条**纯规则**(真机走查:私聊已经滚到最底,右下角圆钮还亮着)。
 *
 * 抬成纯函数是因为它们是"语义"而不是"样式":到底就该灭、向上补页不许改写向下
 * 那一边的账 —— 这两句话能在没有 DOM 的地方被钉住,就不该只靠肉眼走查。
 *
 * 两条都只服务 `RoomSurface`。旧壳(`MessageList`)有它自己那份同形状的代码,
 * 一个字都不经过这里 —— classic 逐像素回滚闸不受影响。
 */
import { shouldShowScrollToBottomButton, type ScrollGeometry } from '@/composables/useFollowScroll'

/** 分页台账里与"向下那一边"有关的两栏。 */
export interface TailLedger {
  /** 已加载的窗口之后还有没有消息(= 视野底部不是对话末尾)。 */
  hasMoreAfter: boolean
  /** 向下翻页的游标 —— 指向已加载窗口的**最后一条**。 */
  backwardsCursor: string | null
}

/**
 * 「回到底部」按钮该不该亮。
 *
 * 两个理由,任一成立就亮:
 *  1. 离已加载窗口的底还很远(阈值由 `useFollowScroll` 统一,与旧壳同一份);
 *  2. 这扇窗根本没到对话末尾(`hasMoreAfter`)—— 此时视野底 ≠ 真尾,用户需要一个
 *     回真尾的入口。
 *
 * 反过来说:**到了底、而且这扇窗就是真尾,就必须灭**。这条是这次修的主语义。
 */
export function shouldShowRoomScrollToBottom(
  geometry: ScrollGeometry,
  isFollowing: boolean,
  hasMoreAfter: boolean,
): boolean {
  if (hasMoreAfter) return true
  return shouldShowScrollToBottomButton(geometry, isFollowing)
}

/**
 * 向上补页之后,把"向下那一边"的账还原。
 *
 * 为什么需要:`chatStore.loadOlderMessages` 拿到"更旧那一页"的响应后,是整份
 * 覆盖分页台账的 —— 而那份响应里的 `hasMoreAfter` / `backwardsCursor` 描述的是
 * **那一页**的末尾,不是我们手上这扇窗的末尾。存储层两条路径都会这么答:
 *   - `fastOlderPage` 直接硬写 `hasMoreAfter: true`
 *     (`packages/core/session/storage/json-message-page.ts`);
 *   - 慢路径 / JSONL 分页是 `hasMoreAfter: last.seq < totalCount`,更旧那一页的
 *     末条当然小于总数,同样为 `true`。
 *
 * 于是**只要向上补过一次页,`hasMoreAfter` 就永久为真**,按钮被第 2 条理由强制
 * 点亮,滚到真底也不灭 —— 这就是真机看到的那个现象。
 *
 * 而向上补页在物理上改变不了"更新那一边"的事实:这扇窗的最后一条还是同一条。
 * 所以补页前抄下这两栏、补完原样写回,是最小且诚实的一刀。
 *
 * @returns 需要写回的补丁;两栏都没被动过则返回 `null`(不写空账)。
 */
export function repairTailLedgerAfterPrepend(
  before: TailLedger | null | undefined,
  after: TailLedger | null | undefined,
): TailLedger | null {
  if (!before || !after) return null
  if (after.hasMoreAfter === before.hasMoreAfter && after.backwardsCursor === before.backwardsCursor) {
    return null
  }
  return { hasMoreAfter: before.hasMoreAfter, backwardsCursor: before.backwardsCursor }
}
