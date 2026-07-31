/**
 * 「和 TA 说话」的唯一实现:幂等建私聊房 → 刷新会话表 → 交回房间 id。
 *
 * 从 AgentsPanelContent 抬出来给管理页与右栏空间页共用。导航本身留给宿主
 * (管理页开完要合上自己,右栏开完原地不动)—— 这里只负责把房间弄出来,
 * 以及把「建房被拒」变成一句看得见的话:退休 / service / web 端没有 rooms
 * 都会走到这条,静默无反应是最坏的结果。
 */
import { ref } from 'vue'
import { platformApi } from '@/platform'
import { useSessionsStore } from '@/stores/sessions'

export function useAgentDmOpener() {
  const openingDm = ref(false)
  const dmError = ref('')

  async function openDmRoom(agentId: string): Promise<string> {
    if (!agentId || openingDm.value) return ''
    openingDm.value = true
    dmError.value = ''
    try {
      const response = await platformApi.ensureCollabDmRoom(agentId)
      if (!response?.success || !response.roomSessionId) {
        dmError.value = response?.error || '打不开私聊'
        return ''
      }
      await useSessionsStore().loadSessions()
      return response.roomSessionId
    } catch (cause) {
      dmError.value = cause instanceof Error ? cause.message : String(cause)
      return ''
    } finally {
      openingDm.value = false
    }
  }

  return { openingDm, dmError, openDmRoom }
}
