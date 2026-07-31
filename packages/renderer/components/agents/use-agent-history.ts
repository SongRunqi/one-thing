/**
 * 一个 agent 的履历(会话 / 文件 / 搜索三面共用的那一份账)。
 *
 * 从 AgentsPanelContent 原样抬出来的:归类口径仍然只有一处
 * (`buildAgentHistory` + sessions store 的 `agentPresence` / `agentDirectChatSessions`),
 * 这里只负责把它接上看板标题、并在需要时补拉一次看板 —— 管理页与右栏空间页
 * 消费同一个 composable,不存在第二本账。
 */
import { computed, watch, type Ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { buildAgentHistory, type AgentHistoryRow } from '@/utils/agent-sessions'

/**
 * 卡标题现查(Q4 纪律:状态/标题一律现查,不入任何快照)。
 *
 * 懒取 store:不挂 pinia 的面板单测会在 setup 阶段就炸。查不到返回空串,
 * `buildAgentHistory` 会退到短号 —— 宁可少说不说错。
 */
export function lookupTaskTitle(taskId: string): string {
  if (!taskId) return ''
  try {
    return useCollabBoardStore().findTask(taskId)?.task.title || ''
  } catch {
    return ''
  }
}

export function historyRowTitle(row: AgentHistoryRow): string {
  return row.readOnly ? `${row.label} · 只读转录` : row.label
}

export function formatUpdated(timestamp: number): string {
  if (!timestamp) return 'Custom'
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function useAgentHistory(agentId: Ref<string>) {
  const sessionsStore = useSessionsStore()

  const history = computed(() => buildAgentHistory({
    presence: sessionsStore.agentPresence(agentId.value),
    directChats: sessionsStore.agentDirectChatSessions(agentId.value),
    sessions: sessionsStore.sessions,
    taskTitle: lookupTaskTitle,
  }))

  /**
   * 看板只在打开过看板面板的房间里是热的,所以卡标题现查在冷启动时会全线落空。
   * 挂上这个 composable 的面一出现就按这个 agent 待过的房间补拉一次;拉不到就是
   * 短号,不影响四栏成立。
   */
  function ensureBoardData(): void {
    const id = agentId.value
    if (!id) return
    const presence = sessionsStore.agentPresence(id)
    const roomIds = new Set<string>(presence.roomSessionIds)
    if (presence.dmRoomId) roomIds.add(presence.dmRoomId)
    // 工作台会话可能挂在这个 agent 已经不在的房间上 —— 卡还在那儿,标题得查得到。
    for (const sessionId of presence.workSessionIds) {
      const roomSessionId = sessionsStore.sessions.find(s => s.id === sessionId)?.collab?.roomSessionId
      if (roomSessionId) roomIds.add(roomSessionId)
    }
    try {
      const boardStore = useCollabBoardStore()
      for (const roomId of roomIds) void boardStore.load(roomId)
    } catch {
      // 没挂 pinia(面板单测):标题退到短号,四栏照常。
    }
  }

  /** 私聊房 id 来自 presence(唯一归类口径),不在这儿反解 id。 */
  const dmRoomSessionId = computed(() => {
    if (!agentId.value) return ''
    try {
      return sessionsStore.agentPresence(agentId.value).dmRoomId || ''
    } catch {
      return ''
    }
  })

  return { history, ensureBoardData, dmRoomSessionId, watchAgent: (fn: () => void) => watch(agentId, fn) }
}

export type { AgentHistoryRow }
