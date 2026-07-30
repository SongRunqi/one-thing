import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AgentDefinition, AgentUpdateRequest } from '@/types'
import {
  agentIdentity,
  isActiveAgent,
  isColleague,
  type AgentIdentity,
  type AgentRemovalOutcome,
} from '@shared/ipc'
import { platformApi } from '@/platform'

export const DEFAULT_AGENT_ID = 'default'

/**
 * Agent 空间页的四面(docs/design/agent-im-chat-ui.md §3.2)。
 *
 * P2 的「履历」升格成了「会话」——同一份四栏,名字换了,因为空间页里它旁边
 * 现在还站着文件与搜索,「履历」读起来像是把那三面也包了进去。
 */
export type AgentDetailTab = 'config' | 'sessions' | 'files' | 'search'

/**
 * App 监听这个事件展开 Agents 面板。深层组件(消息署名、房头)够不到 App 的
 * emit 链,PracticeStrip 的 'practice:open-workspace' 是同款先例;两端各写一次
 * 字面量,由这条注释与 App.vue 里的同名常量配对。
 */
export const AGENT_OPEN_WORKSPACE_EVENT = 'agents:open-workspace'

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<AgentDefinition[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const hasLoaded = ref(false)
  let activeLoad: Promise<AgentDefinition[]> | null = null

  /**
   * "Open the Agents panel on THIS agent", parked here rather than shouted as a
   * window event (docs/design/todo2-fix-plan.md P1-3).
   *
   * The requester is the sidebar; the reader is `AgentsPanelContent`, which the
   * workspace panel mounts LAZILY on first open. So a request and its reader are
   * never alive at the same time on the first jump — an event would be
   * dispatched into an empty room. A parked value survives the mount: the panel
   * reads it whenever it appears, then consumes it so a later re-open of the
   * panel does not silently jump again.
   */
  const pendingDetailAgentId = ref<string | null>(null)

  /**
   * 详情页停在哪一面(agent-im-dm.md §4.2):配置,还是履历。
   *
   * 单独一个 ref 而不是把 `consumeAgentDetailRequest` 的返回值换成对象:那个
   * 返回值已经有消费方与镜像测试,换形状是无谓的连带修改。读法固定为"先读
   * tab,再 consume"——consume 会把两个都清掉。
   */
  const pendingDetailTab = ref<AgentDetailTab | null>(null)

  function requestAgentDetail(agentId: string, tab: AgentDetailTab | null = null): void {
    pendingDetailAgentId.value = agentId || null
    pendingDetailTab.value = agentId ? tab : null
  }

  /**
   * 「进入我与 TA 的空间」的唯一入口(agent-im-chat-ui.md C3)。
   *
   * 三处入口 —— dm 房头身份、群聊署名头像、侧栏联系人行右键 —— 归到这一个函数
   * 上,所以"点头像会发生什么"只有一个答案。它本身不是新机制:寄存意图 + 请
   * App 开面板,两步都是既有链路,这里只是把它们捆成一个名字,免得每个调用点
   * 自己记得要派那个事件。
   */
  function openAgentSpace(agentId: string, tab: AgentDetailTab | null = null): void {
    if (!agentId) return
    requestAgentDetail(agentId, tab)
    window.dispatchEvent(new CustomEvent(AGENT_OPEN_WORKSPACE_EVENT))
  }

  function consumeAgentDetailRequest(): string | null {
    const agentId = pendingDetailAgentId.value
    pendingDetailAgentId.value = null
    pendingDetailTab.value = null
    return agentId
  }

  const defaultAgent = computed(() =>
    agents.value.find(agent => agent.id === DEFAULT_AGENT_ID) || agents.value[0] || null
  )

  /**
   * 社交面名册(agent-domain-model.md M2):AgentSelector、群成员选择器等
   * 「列出同事」的入口一律取这里 —— 只收 colleague 且 active;service
   * (radio-dj 等后台设施)与 retired 不进任何社交面。管理面(AgentsPanelContent)
   * 是例外,继续用 `agents` 显示全部。
   */
  const colleagues = computed(() =>
    agents.value.filter(agent => isColleague(agent) && isActiveAgent(agent))
  )

  /**
   * 管理面(域模型 §3.2)的两组:在职与已退休。管理页显示**全部 kind**(service
   * 也要能改),所以这两个只按 status 分,不掺 kind —— 社交面的过滤是 `colleagues`
   * 那一条,两件事别混。
   */
  const activeAgents = computed(() => agents.value.filter(agent => isActiveAgent(agent)))
  const retiredAgents = computed(() => agents.value.filter(agent => !isActiveAgent(agent)))

  /** 严格查找(域模型 M4):查无此人(含空 id)返回 null,绝不冒充 default。 */
  function findAgent(agentId?: string | null): AgentDefinition | null {
    if (!agentId) return null
    return agents.value.find(agent => agent.id === agentId) ?? null
  }

  /**
   * 渲染用(M4):署名/头像按 id 取身份投影;未知 id 返回「已注销」墓碑占位,
   * 永不炸也永不套 default 的名字头像。与 runtime store 的 displayAgent 镜像。
   */
  function displayAgent(agentId?: string | null): AgentIdentity {
    const agent = findAgent(agentId)
    if (agent) return agentIdentity(agent)
    return { id: agentId ?? '', name: '已注销', kind: 'colleague', status: 'retired' }
  }

  /**
   * 功能兜底语义(域模型 §3.3):无 agentId / 查无此人 → default agent。合法
   * 消费方:composer 当前 persona 展示、会话模型解析。消息署名/头像禁用
   * (会把未知 id 渲染成 default 冒充)—— 那类场景走 `displayAgent`。
   */
  function getAgent(agentId?: string | null): AgentDefinition | null {
    return findAgent(agentId) || defaultAgent.value
  }

  async function loadAgents(options: { force?: boolean } = {}): Promise<AgentDefinition[]> {
    if (!options.force && hasLoaded.value) return agents.value
    if (!options.force && activeLoad) return activeLoad

    isLoading.value = true
    error.value = null
    const load = (async () => {
      const response = await platformApi.listAgents()
      if (!response.success || !response.agents) {
        throw new Error(response.error || 'Failed to load agents')
      }
      agents.value = response.agents
      hasLoaded.value = true
      return agents.value
    })()
    activeLoad = load

    try {
      return await load
    } catch (err: any) {
      error.value = err?.message || 'Failed to load agents'
      throw err
    } finally {
      if (activeLoad === load) {
        activeLoad = null
        isLoading.value = false
      }
    }
  }

  async function createAgent(name: string, systemPrompt = ''): Promise<AgentDefinition> {
    const response = await platformApi.createAgent(name, systemPrompt)
    if (!response.success || !response.agent) {
      throw new Error(response.error || 'Failed to create agent')
    }
    agents.value = [...agents.value, response.agent]
    hasLoaded.value = true
    return response.agent
  }

  async function updateAgent(agentId: string, updates: Omit<AgentUpdateRequest, 'agentId'>): Promise<AgentDefinition> {
    const response = await platformApi.updateAgent(agentId, updates)
    if (!response.success || !response.agent) {
      throw new Error(response.error || 'Failed to update agent')
    }
    agents.value = agents.value.map(agent => agent.id === agentId ? response.agent! : agent)
    hasLoaded.value = true
    return response.agent
  }

  /**
   * UI 的「删除」(域模型 §3.2):后端决定它是退休还是硬删,前端照结果对账 ——
   * 退休就把那一行换成回传的墓碑(status 已 retired,仍留在名册里灰显),硬删
   * 才真从列表里摘掉。返回 outcome 让调用方分文案:「已退休」不是「已删除」。
   */
  async function deleteAgent(agentId: string): Promise<AgentRemovalOutcome> {
    const response = await platformApi.deleteAgent(agentId)
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete agent')
    }
    const retired = response.agent
    if (response.outcome === 'retired' && retired) {
      agents.value = agents.value.map(agent => agent.id === agentId ? retired : agent)
    } else {
      agents.value = agents.value.filter(agent => agent.id !== agentId)
    }
    hasLoaded.value = true
    return response.outcome ?? 'deleted'
  }

  /** 重新入职(§8)。只有 Agents 管理页调它 —— 社交面没有这个动作。 */
  async function restoreAgent(agentId: string): Promise<AgentDefinition> {
    const response = await platformApi.restoreAgent(agentId)
    if (!response.success || !response.agent) {
      throw new Error(response.error || 'Failed to restore agent')
    }
    agents.value = agents.value.map(agent => agent.id === agentId ? response.agent! : agent)
    hasLoaded.value = true
    return response.agent
  }

  return {
    agents,
    colleagues,
    activeAgents,
    retiredAgents,
    isLoading,
    error,
    hasLoaded,
    pendingDetailAgentId,
    pendingDetailTab,
    requestAgentDetail,
    openAgentSpace,
    consumeAgentDetailRequest,
    defaultAgent,
    findAgent,
    displayAgent,
    getAgent,
    loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    restoreAgent,
  }
})
