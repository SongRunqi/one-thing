/**
 * 「场」的清单 —— 工作台式外壳(docs/design/im-workbench-layout.md §3 W1 / W7)。
 *
 * 一个**场** = 一个能被打开、能收到新话的对话现场:托管私聊房、群房、agent
 * 互聊房、以及直聊会话。左栏各区的未读墨点、"在忙"计数、以及将来任何一处
 * 汇总数字,数的都是"有未读的**场**数"(不是消息数),而且必须是同一份清单 ——
 * 否则某处写 3、列表里只躺着 2 行,用户会去找那第三条。
 *
 * 纪律(C0 起对 C1 有效):
 *  - 未读判定只有 `sessionsStore.isUnreadSession` 一处,这里**不重写**任何
 *    "什么算未读"的规则,只负责决定"哪些会话算一个场";
 *  - 场的宇宙取的是左栏真的会画出来的那几条 store selector
 *    (`userDmRoomSessions` / `groupRoomSessions` / `agentPairDmRoomSessions` /
 *    `filteredSessions`),所以计数不可能数到一个左栏里点不开的东西。
 *
 * 纯函数与 composable 分开:前者能被测试直接喂假数据,后者只做取数与接线。
 *
 * (取件自 `design/im-stage-d` 的 `useStageScenes`,逻辑一字未改;"Stage" 的
 *  舞台语汇换成方案 C 的"场账"语汇。)
 */
import { computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useSessionsStore } from '@/stores/sessions'
import { AGENT_AVATAR_FALLBACK } from '@/components/common/agent-avatar'

/** 场的三种形态。`dm` = 我和某个同事的托管私聊房,入口是"人"而不是"房名"。 */
export type SceneKind = 'dm' | 'room' | 'chat'

/** 一条 store 会话在这份清单里被读到的字段;`SessionListItem` 结构上满足它。 */
export interface SceneSource {
  id: string
  name?: string
  updatedAt?: number
  room?: { memberAgentIds?: string[] } | null
}

/** 身份投影(域模型 M4 的 `displayAgent`)—— 查无此人给墓碑,绝不冒充 default。 */
export interface SceneIdentity {
  name: string
  avatar?: string
  avatarImage?: string
}

export interface Scene {
  sessionId: string
  kind: SceneKind
  /** 行上显示的名字。dm 场用**同事现名**(房名冻结在建房那一刻,改名必须跟着变)。 */
  name: string
  /** dm 场才有:这一场对面的那个人。点头像进 Agent 空间页要用它。 */
  agentId: string
  avatar: string
  avatarImage?: string
  updatedAt: number
}

export interface BuildScenesInput {
  /** 托管私聊房(store 的 `userDmRoomSessions`)。 */
  dmRooms: readonly SceneSource[]
  /** 普通群(store 的 `groupRoomSessions`)。 */
  groupRooms: readonly SceneSource[]
  /** agent 互聊房(store 的 `agentPairDmRoomSessions`)。 */
  pairDmRooms: readonly SceneSource[]
  /** 直聊(store 的 `filteredSessions` —— 它已经把房/执行/工作台都摘干净了)。 */
  chats: readonly SceneSource[]
  identityOf: (agentId: string) => SceneIdentity
}

function sceneName(session: SceneSource, fallback: string): string {
  return (session.name || '').trim() || fallback
}

/**
 * 把四路 store selector 摆成一份扁平的场清单。
 *
 * 顺序 = 私聊 → 群 → 私下 → 直聊,与左栏的分区顺序同源;调用方要别的排序自己
 * 再排,这里不替它决定。
 */
export function buildScenes(input: BuildScenesInput): Scene[] {
  const scenes: Scene[] = []

  for (const session of input.dmRooms) {
    // 归属读结构化字段(禁反解 id,agents/identity.ts 纪律)。
    const agentId = session.room?.memberAgentIds?.[0] || ''
    const identity = input.identityOf(agentId)
    scenes.push({
      sessionId: session.id,
      kind: 'dm',
      name: identity.name || sceneName(session, '私聊'),
      agentId,
      avatar: identity.avatar || AGENT_AVATAR_FALLBACK,
      avatarImage: identity.avatarImage,
      updatedAt: session.updatedAt || 0,
    })
  }

  for (const session of input.groupRooms) {
    scenes.push({
      sessionId: session.id,
      kind: 'room',
      name: sceneName(session, '群聊'),
      agentId: '',
      avatar: '',
      updatedAt: session.updatedAt || 0,
    })
  }

  for (const session of input.pairDmRooms) {
    scenes.push({
      sessionId: session.id,
      kind: 'room',
      name: sceneName(session, '私下'),
      agentId: '',
      avatar: '',
      updatedAt: session.updatedAt || 0,
    })
  }

  for (const session of input.chats) {
    scenes.push({
      sessionId: session.id,
      kind: 'chat',
      name: sceneName(session, '未命名会话'),
      agentId: '',
      avatar: '',
      updatedAt: session.updatedAt || 0,
    })
  }

  return scenes
}

/** 按一条谓词摘出子集。未读/在忙两处共用它,免得各写一份 filter。 */
export function filterScenes(
  scenes: readonly Scene[],
  predicate: (sessionId: string) => boolean,
): Scene[] {
  return scenes.filter(scene => predicate(scene.sessionId))
}

/**
 * 左栏各区共用的那一份清单。
 *
 * 每个消费点各自 `useSceneLedger()` 一次是安全的:里面全是 computed,pinia 的
 * store 实例是共享的,所以两处读到的永远是同一份真相。
 */
export function useSceneLedger() {
  const sessionsStore = useSessionsStore()
  const agentsStore = useAgentsStore()
  const chatStore = useChatStore()
  const collabBoardStore = useCollabBoardStore()

  const scenes = computed(() => buildScenes({
    dmRooms: sessionsStore.userDmRoomSessions ?? [],
    groupRooms: sessionsStore.groupRoomSessions ?? [],
    pairDmRooms: sessionsStore.agentPairDmRoomSessions ?? [],
    chats: sessionsStore.filteredSessions ?? [],
    identityOf: agentId => agentsStore.displayAgent(agentId),
  }))

  /** 未读判定**只**转发 store 那一处 —— 各个消费点因此不可能各算一遍。 */
  const isUnread = (sessionId: string) => sessionsStore.isUnreadSession(sessionId)

  /**
   * 「在忙」= 这一场此刻真的有东西在跑。两个既有信号的并集:
   *  - 直聊 / 私聊:chat store 的 `isSessionGenerating`(侧栏列表本来就吃它);
   *  - 群房:collabBoard 的 `isRoomTurnActive`(一轮发言开合各翻一次,与停止按钮同靶)。
   * 不新起第三本账。
   */
  const isBusy = (sessionId: string) => {
    if (chatStore.isSessionGenerating?.(sessionId)) return true
    return collabBoardStore.isRoomTurnActive?.(sessionId) === true
  }

  const unreadScenes = computed(() => filterScenes(scenes.value, isUnread))
  const busyScenes = computed(() => filterScenes(scenes.value, isBusy))

  return {
    scenes,
    unreadScenes,
    busyScenes,
    /** 汇总上的数字 = **有未读的场数**,不是消息条数。 */
    unreadCount: computed(() => unreadScenes.value.length),
  }
}
