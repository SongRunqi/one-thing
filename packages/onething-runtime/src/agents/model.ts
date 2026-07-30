/**
 * Agent 域模型的投影层(M1,docs/design/agent-domain-model.md §2)。
 *
 * `OnethingAgentDefinition` 是存储真源(agents.json 一行);这里的三个投影是
 * 访问路径,不是新真源——调用方按需取面,自文档化「我要的是哪一面」:
 * roster/联系人拿身份面,prompt builder/引擎拿心智面,执行守卫拿能力面。
 * 在场面(Presence)永不落库、永远现算,不在此文件(A3 的 presence.ts)。
 *
 * MIRROR NOTE: `isColleague` / `isActiveAgent` 在 shared 包的 IPC 契约层
 * (agents 契约文件)有一份语义相同的实现供 renderer 使用——产品层禁止
 * import 那一层(boundary checker 强制),故两份实现;
 * 以 `__tests__/model.test.ts` 的镜像测试盯住。
 */
import type {
  OnethingAgentDefinition,
  OnethingAgentExecutor,
  OnethingAgentKind,
  OnethingAgentModelBinding,
  OnethingAgentStatus,
} from './store.js'

/**
 * 身份面:被引用的最小面。变更要广播(署名/联系人跟随),retired 后永久保留
 * (墓碑)。消费方:联系人区、roster、签名气泡、履历页、墓碑渲染。
 * kind/status 在投影里已解析缺省(colleague/active),消费方不用再各自兜底。
 */
export interface OnethingAgentIdentity {
  id: string
  name: string
  title?: string
  avatar?: string
  avatarImage?: string
  color?: string
  description?: string
  kind: OnethingAgentKind
  status: OnethingAgentStatus
}

/**
 * 心智面:驱动一个回合时装配的东西。消费方:prompt builder、coordinator
 * 模型盖章、(前瞻)外部连接器。executor 已解析缺省({ type: 'native' })。
 */
export interface OnethingAgentMind {
  systemPrompt: string
  model?: OnethingAgentModelBinding
  executor: OnethingAgentExecutor
}

/**
 * 能力面:执行期守卫。经 resolveAgentProfile 与 session/settings 复合成
 * EffectiveAgentProfile(app/agents/profile.ts,已落地,复合链不动)。
 */
export interface OnethingAgentCapability {
  tools?: string[]
  toolGrants?: string[]
  permissionMode?: string
  maxTurns?: number
}

/** 身份面投影。 */
export function agentIdentity(agent: OnethingAgentDefinition): OnethingAgentIdentity {
  return {
    id: agent.id,
    name: agent.name,
    title: agent.title,
    avatar: agent.avatar,
    avatarImage: agent.avatarImage,
    color: agent.color,
    description: agent.description,
    kind: agent.kind ?? 'colleague',
    status: agent.status ?? 'active',
  }
}

/** 心智面投影。 */
export function agentMind(agent: OnethingAgentDefinition): OnethingAgentMind {
  return {
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    executor: agent.executor ?? { type: 'native' },
  }
}

/** 能力面投影。 */
export function agentCapability(agent: OnethingAgentDefinition): OnethingAgentCapability {
  return {
    tools: agent.tools,
    toolGrants: agent.toolGrants,
    permissionMode: agent.permissionMode,
    maxTurns: agent.maxTurns,
  }
}

/**
 * 社交面判定(M2):联系人区、roster 候选、群成员选择器、AgentSelector 只收
 * colleague。缺省 kind 按 colleague 解释(旧 agents.json 无此字段)。
 */
export function isColleague(agent: Pick<OnethingAgentDefinition, 'kind'>): boolean {
  return (agent.kind ?? 'colleague') === 'colleague'
}

/** 生命周期判定(M3):缺省 status 按 active 解释。 */
export function isActiveAgent(agent: Pick<OnethingAgentDefinition, 'status'>): boolean {
  return (agent.status ?? 'active') === 'active'
}
