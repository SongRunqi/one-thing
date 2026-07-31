/**
 * 左栏「进行中」的取数与接线(C1,docs/design/im-workbench-layout.md §3 W1/W7)。
 *
 * 判定全在 `active-work.ts`(纯函数),这里只负责三件事:从哪儿读、什么时候补拉、
 * 以及把在场信号接到既有的那两本账上。
 *
 * ## 跨房聚合怎么办到的(本期最大的实现风险)
 *
 * `collabBoard` store 是「一间房一块板」:`boardFor(roomSessionId)` /
 * `load(roomSessionId)`。左栏要跨所有房聚合,而**为了聚合在启动时把每间房都
 * load 一遍是不可接受的**(N 间房 = N 次 IPC,拖慢启动;而且"左栏看得见"不该
 * 成为全量拉取的理由)。
 *
 * 这里走的是「已加载 + 定向补齐」,三条热源,没有一条是全量:
 *
 *  1. **渲染只读 `boards`。** 画卡片这条路上一次 IPC 都没有 —— 它读什么就画
 *     什么,永远不会因为"左栏想看"去发请求。
 *  2. **广播白拿。** `ensureSubscribed()` 之后,`collab:board-changed` 的快照
 *     **不问这间房有没有 load 过**都会被 `applySnapshot` 收下(store 那边本来
 *     就是这么写的)。于是"此刻真的在动的房"会自己把板推过来,而第一区要的
 *     恰恰就是在动的那些。别处已经加载的板(看板面板、私聊房头徽标、履历页)
 *     也一并白拿。
 *  3. **定向补齐一次。** 冷启时窗口错过了历史广播,所以补一次 —— 候选集从
 *     **内存里已有的会话列表**推导(`activeWorkHydrationTargets`):只拉"开过
 *     工作台的房",按最近活动排序,截到 8 间,推迟到 idle 再发。没干过活的房
 *     一次都不会被拉到。
 *
 * 代价写在 `activeWorkHydrationTargets` 的注释里:极端情况(房从没开过工作台却
 * 有 review 卡)冷启会漏一张,直到用户开房或一条广播落地。用一次可能的漏换掉
 * N 次必然的 IPC,这是本期刻意选的那一边。
 */
import { computed, onBeforeUnmount, watch, type ComputedRef } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useSessionsStore } from '@/stores/sessions'
import { useSceneLedger } from '@/composables/useSceneLedger'
import {
  ACTIVE_WORK_HYDRATION_LIMIT,
  activeWorkHydrationTargets,
  collectActiveWork,
  type ActiveWorkCardModel,
} from './active-work'

/** idle 补齐最迟等到这里就发 —— 一直不空闲也不能永远不补。 */
const HYDRATION_IDLE_TIMEOUT_MS = 2000

type IdleHandle = { cancel: () => void }

function scheduleIdle(run: () => void): IdleHandle {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback
  if (typeof idle === 'function') {
    const handle = idle(run, { timeout: HYDRATION_IDLE_TIMEOUT_MS })
    return {
      cancel: () => {
        const cancelIdle = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
        cancelIdle?.(handle)
      },
    }
  }
  const timer = setTimeout(run, 0)
  return { cancel: () => clearTimeout(timer) }
}

export interface UseActiveWorkReturn {
  cards: ComputedRef<ActiveWorkCardModel[]>
  /** 这间房此刻有一轮在跑(「在忙」)。与左栏别处同一份场账。 */
  isRoomBusy: (roomSessionId: string) => boolean
  /** 这间房有未读。判定仍然只有 sessions store 那一处。 */
  isRoomUnread: (roomSessionId: string) => boolean
}

export function useActiveWork(): UseActiveWorkReturn {
  const boardStore = useCollabBoardStore()
  const sessionsStore = useSessionsStore()
  const agentsStore = useAgentsStore()
  // 未读与「在忙」都取这一份场账(W7:同一份数据三种粒度),这里不新起口径。
  const ledger = useSceneLedger()

  // 广播是最便宜的那条热源,订阅一次就不用再管(store 自带去重)。
  boardStore.ensureSubscribed()

  /** 还在会话列表里的房。删掉的房留下的旧快照不该在左栏留一张死链卡。 */
  const knownRoomIds = computed(
    () => new Set((sessionsStore.roomSessions ?? []).map(room => room.id)),
  )

  const cards = computed(() => collectActiveWork({
    boards: boardStore.boards,
    identityOf: agentId => agentsStore.displayAgent(agentId),
    isKnownRoom: roomSessionId => knownRoomIds.value.has(roomSessionId),
    awaitingPermission: workSessionId => boardStore.hasPendingAsk(workSessionId),
  }))

  const busyRoomIds = computed(
    () => new Set(ledger.busyScenes.value.map(scene => scene.sessionId)),
  )
  const unreadRoomIds = computed(
    () => new Set(ledger.unreadScenes.value.map(scene => scene.sessionId)),
  )

  // 头像要名字要花名册。有卡了才拉(store 自带去重,全 app 仍是一次拉取),
  // 挂载时不拉 —— 一个没有活的左栏不该拽着名册启动。
  watch(() => cards.value.length, (count) => {
    if (count > 0 && !agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
  }, { immediate: true })

  // ── 定向补齐:整个 app 生命周期里只跑一次 ─────────────────────────────
  let hydrationStarted = false
  let idle: IdleHandle | null = null

  async function hydrate(): Promise<void> {
    const targets = activeWorkHydrationTargets({
      sessions: sessionsStore.sessions ?? [],
      loadedRoomIds: Object.keys(boardStore.boards ?? {}),
      isKnownRoom: roomSessionId => knownRoomIds.value.has(roomSessionId),
      limit: ACTIVE_WORK_HYDRATION_LIMIT,
    })
    // 串行:补齐是背景动作,不该和用户刚点开的那间房抢同一条 IPC 通道。
    // `load` 自己吞异常(失败就是这间房这次没热起来),这里不再包一层。
    for (const roomSessionId of targets) await boardStore.load(roomSessionId)
  }

  watch(() => (sessionsStore.sessions ?? []).length, (count) => {
    if (hydrationStarted || count === 0) return
    hydrationStarted = true
    idle = scheduleIdle(() => { idle = null; void hydrate() })
  }, { immediate: true })

  onBeforeUnmount(() => { idle?.cancel(); idle = null })

  return {
    cards,
    isRoomBusy: (roomSessionId: string) => busyRoomIds.value.has(roomSessionId),
    isRoomUnread: (roomSessionId: string) => unreadRoomIds.value.has(roomSessionId),
  }
}
