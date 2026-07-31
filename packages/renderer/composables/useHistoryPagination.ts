/**
 * 历史分页(向上翻旧、向下翻新)—— 去复用重构 R1 从 `MessageList.vue` 抬出的
 * 那一段,**行为逐字不变**。
 *
 * 为什么抬:房面(`RoomSurface`)自带滚动容器,而"滚到顶就补一页"这件事在旧壳
 * 里长在 `MessageList` 身上。两处各写一遍的代价不是重复代码,是**两套阈值**
 * —— 补页时机一旦分叉,两个面的翻页手感就会开始不一样,而没有人会去比。
 *
 * 抬出来的边界:
 *  - 阈值与"该不该补"是**纯函数**(下面三个 export),可以单独测;
 *  - 补页前后的锚点保存/恢复是 DOM 操作,留在 composable 里,靠注入的
 *    scroller / content ref 工作;
 *  - 补页完成后要刷新哪些测量(导航轨、大纲、可见用户消息)由调用方通过
 *    `onLoaded` 决定 —— 那些是列表外壳各自的事,不属于分页。
 */
import { ref, type Ref } from 'vue'
import { nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'

export const HISTORY_AUTO_LOAD_THRESHOLD_RATIO = 1.75

export interface HistoryPageStateLike {
  hasMoreBefore?: boolean
  hasMoreAfter?: boolean
  isLoadingOlder?: boolean
}

export interface HistoryScrollGeometry {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/**
 * Use clientHeight-based threshold so it scales with viewport size
 * and large messages don't require pixel-perfect top-edge hugging.
 */
export function getAutoLoadThreshold(geometry: Pick<HistoryScrollGeometry, 'clientHeight'>): number {
  return Math.round(geometry.clientHeight * HISTORY_AUTO_LOAD_THRESHOLD_RATIO)
}

export function shouldAutoLoadOlder(
  geometry: HistoryScrollGeometry,
  state: HistoryPageStateLike | null | undefined,
): boolean {
  if (!state?.hasMoreBefore || state.isLoadingOlder) return false
  return geometry.scrollTop <= getAutoLoadThreshold(geometry)
}

export function shouldAutoLoadNewer(
  geometry: HistoryScrollGeometry,
  state: HistoryPageStateLike | null | undefined,
): boolean {
  if (!state?.hasMoreAfter || state.isLoadingOlder) return false
  const distanceToBottom = geometry.scrollHeight - geometry.scrollTop - geometry.clientHeight
  return distanceToBottom <= getAutoLoadThreshold(geometry)
}

interface TopAnchor {
  messageId: string
  offsetWithinMessage: number
}

export interface UseHistoryPaginationOptions {
  scroller: Ref<HTMLElement | null>
  /** 行所在的容器 —— 顶部锚点从它的 `[data-message-id]` 里取。 */
  content: Ref<HTMLElement | null>
  getSessionId: () => string | undefined
  getPageState: () => HistoryPageStateLike | null | undefined
  /** 会话切换中:补页会把刚恢复的位置冲掉。 */
  isSwitching: () => boolean
  /** 跟随态 —— 补旧页前后必须原样还回去。 */
  isFollowing: Ref<boolean>
  /** 清掉 tail/anchor 模式(用户已经翻到顶,钉底或钉旧锚点都是错的)。 */
  clearScrollMode: () => void
  getMessageRowById: (messageId: string) => HTMLElement | null
  writeScrollTop: (top: number) => void
  /** 真的补进来了才调:刷新各自的测量。 */
  onLoaded?: () => void
  /** 每次尝试结束都调(成功与否):更新"回到底部"按钮之类。 */
  onSettled?: () => void
}

export function useHistoryPagination(options: UseHistoryPaginationOptions) {
  const chatStore = useChatStore()
  const prepending = ref(false)
  let loadingNewer = false

  function readGeometry(): HistoryScrollGeometry | null {
    const el = options.scroller.value
    if (!el) return null
    return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
  }

  function captureTopAnchor(): TopAnchor | null {
    const scroller = options.scroller.value
    const content = options.content.value
    if (!scroller || !content) return null

    const rows = Array.from(content.querySelectorAll<HTMLElement>('[data-message-id]'))
    const viewportTop = scroller.scrollTop
    const row = rows.find(candidate => candidate.offsetTop + candidate.offsetHeight > viewportTop)
    if (!row) return null

    const messageId = row.dataset.messageId
    if (!messageId) return null

    return {
      messageId,
      offsetWithinMessage: viewportTop - row.offsetTop,
    }
  }

  function restoreTopAnchor(anchor: TopAnchor | null) {
    if (!anchor) return
    const scroller = options.scroller.value
    const row = options.getMessageRowById(anchor.messageId)
    if (!scroller || !row) return
    options.writeScrollTop(row.offsetTop + anchor.offsetWithinMessage)
  }

  async function loadOlderHistoryIfNeeded(force = false) {
    const sessionId = options.getSessionId()
    const geometry = readGeometry()
    const state = options.getPageState()
    if (options.isSwitching()) return
    if (!sessionId || !geometry || !state?.hasMoreBefore || state.isLoadingOlder || prepending.value) return
    if (!force && !shouldAutoLoadOlder(geometry, state)) return

    const anchor = captureTopAnchor()
    // Clear tail/anchor mode before prepend — the user has scrolled to the
    // top to load history, so pinning to bottom or a stale anchor is wrong.
    // Restore position is handled by restoreTopAnchor below.
    options.clearScrollMode()
    prepending.value = true
    const wasFollowing = options.isFollowing.value
    try {
      const loaded = await chatStore.loadOlderMessages(sessionId)
      if (loaded) {
        await nextTick()
        restoreTopAnchor(anchor)
        options.onLoaded?.()
      }
    } finally {
      options.isFollowing.value = wasFollowing
      prepending.value = false
      options.onSettled?.()
    }
  }

  async function loadNewerHistoryIfNeeded() {
    const sessionId = options.getSessionId()
    const geometry = readGeometry()
    const state = options.getPageState()
    if (options.isSwitching()) return
    if (!sessionId || !geometry || !state?.hasMoreAfter || state.isLoadingOlder || loadingNewer) return
    if (!shouldAutoLoadNewer(geometry, state)) return

    loadingNewer = true
    try {
      const loaded = await chatStore.loadNewerMessages(sessionId)
      if (loaded) {
        await nextTick()
        options.onLoaded?.()
      }
    } finally {
      loadingNewer = false
      options.onSettled?.()
    }
  }

  return {
    loadOlderHistoryIfNeeded,
    loadNewerHistoryIfNeeded,
    /** 正在向上补页 —— 补页期间的跟随/测量都要让路。 */
    isPrepending: () => prepending.value,
  }
}
