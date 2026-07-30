import { computed, onMounted, type ComputedRef, type Ref } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import type { AgentModelBinding } from '@shared/ipc'

interface SessionAgentLike {
  agentId?: string
}

/**
 * The model binding of a session's agent, for surfaces that DISPLAY the
 * effective model (the picker chip, the think toggle).
 *
 * The engine ranks an agent's binding above an unpinned session model, so any
 * surface that shows "the model this session will use" has to know about it —
 * a picker that ignores the binding shows one provider while the request goes
 * to another, which is exactly the provider-resolution incident shape.
 */
export function useSessionAgentModel(
  session: Ref<SessionAgentLike | null | undefined> | ComputedRef<SessionAgentLike | null | undefined>,
): ComputedRef<AgentModelBinding | null> {
  const agentsStore = useAgentsStore()

  onMounted(() => {
    // Cached after the first call; the picker must not render a stale chip
    // just because nothing else happened to load the agent list yet.
    void agentsStore.loadAgents().catch(() => {})
  })

  // 功能兜底,不是署名(域模型 M4):无 agentId / 查无此人的会话跑的就是 default
  // persona,chip 必须显示它的绑定 —— 与引擎侧 resolveAgentProfileForSession 的
  // `findAgent ?? defaultAgent` 同一条规则。身份展示类一律走 displayAgent。
  return computed(() => agentsStore.getAgent(session.value?.agentId)?.model ?? null)
}
