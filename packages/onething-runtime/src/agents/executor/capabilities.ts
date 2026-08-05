/**
 * 执行器能力表(E0)。**唯一一处**回答「这个执行器支不支持 X」。
 *
 * 从前答案散在三个地方各写一份 id 名单(压缩、鉴权、工具装载),名单一致
 * 全靠自觉;每加一个外部执行体就要在三处补登,漏一处就是一个静默降级。
 * 这里把答案收成一张表:改一行,三处同时变。
 *
 * 填值纪律:**不确定的一律填保守值**(支持写 false、上下文写 theirs),并在
 * 该行注释里写清「保守在哪、什么时候能翻」。声明比真实能力乐观,代价是
 * 我们以为停住了其实没停;声明比真实能力保守,代价只是少用一条快路。
 */
import type { AgentExecutorCapabilities, AgentExecutorId, AgentExecutorKind } from './types.js'

export interface AgentExecutorDescriptor {
  id: AgentExecutorId
  kind: AgentExecutorKind
  capabilities: AgentExecutorCapabilities
}

/** 本地执行器 id。agent 未绑定外部连接器时的落点。 */
export const LOCAL_AGENT_EXECUTOR_ID = 'local'

/**
 * 本地执行器:引擎 + 我们自己的工具循环。
 * 宿主工具面对它来说不是「注入」——工具本来就是我们的,所以 hostTools 为真。
 */
const LOCAL_DESCRIPTOR: AgentExecutorDescriptor = {
  id: LOCAL_AGENT_EXECUTOR_ID,
  kind: 'local',
  capabilities: {
    hostTools: true,
    steer: true,
    // abort 就是本地能做到的最强中断(工具循环在我们进程里),没有更强的一档。
    interrupt: false,
    contextWindow: 'ours',
    persona: 'system',
  },
}

const EXTERNAL_DESCRIPTORS: AgentExecutorDescriptor[] = [
  {
    id: 'claude-code-agent',
    kind: 'external',
    capabilities: {
      // SDK 原生支持 mcpServers 的进程内注入(connector 声明
      // mcpInjection: 'in-process')——架构上可接;真接在 E3。
      hostTools: true,
      // connector 的 CLAUDE_CODE_CAPABILITIES.steer = false。
      steer: false,
      // query() 的 interrupt 是真中断(能让 CLI 侧回合停下),E5 接停止三级。
      interrupt: true,
      // 会话在 SDK 侧,上下文是它的;我们压缩只会把两边的账搞乱。
      contextWindow: 'theirs',
      // persona 走 SDK 的 systemPrompt(E4 接;今天 G9 只送最后一条 user 文本)。
      persona: 'system',
    },
  },
  {
    id: 'acp',
    kind: 'external',
    capabilities: {
      // 保守 false:ACP 的 MCP 注入是 config 形态(connector 声明
      // mcpInjection: 'config'),而 E3 的宿主工具面是进程内 server;
      // 两者能否对上尚未验证,E3 落地时按实测翻。
      hostTools: false,
      // connector 的 ACP_CAPABILITIES.steer = false。
      steer: false,
      // 保守 false:acp-connector.interrupt 依赖可选的 cancelSession 回调,
      // 缺席时是空操作——声明成真会让 E5 以为撤牌停住了其实没停。
      // 等 cancelSession 变成必接的装配项再翻真。
      interrupt: false,
      // ACP agent 自己维护会话上下文,与 claude-code 同理。
      contextWindow: 'theirs',
      // 保守 prepend:ACP 的 prompt 协议里没有 system 位,persona 只能拼在
      // 用户消息前面。若后续 connector 暴露 system 通道再翻。
      persona: 'prepend',
    },
  },
]

const DESCRIPTORS = new Map<string, AgentExecutorDescriptor>([
  [LOCAL_DESCRIPTOR.id, LOCAL_DESCRIPTOR],
  ...EXTERNAL_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor] as const),
])

/**
 * 未知 connectorId 的兜底:仍按外部处理(它显然不是本引擎),但能力全部
 * 保守——我们对它一无所知,声明任何一条支持都是猜。
 */
export function unknownExternalExecutorDescriptor(id: string): AgentExecutorDescriptor {
  return {
    id,
    kind: 'external',
    capabilities: {
      hostTools: false,
      steer: false,
      interrupt: false,
      contextWindow: 'theirs',
      persona: 'prepend',
    },
  }
}

export function localAgentExecutorDescriptor(): AgentExecutorDescriptor {
  return LOCAL_DESCRIPTOR
}

/** 已登记的执行器描述;未登记返回 undefined(调用方决定兜底成本地还是未知外部)。 */
export function findAgentExecutorDescriptor(id: string): AgentExecutorDescriptor | undefined {
  return DESCRIPTORS.get(id)
}

/**
 * 这个 id 是不是一个外部执行器。**这是 providerId 推导的唯一判据**——
 * 今天外部 agent 靠 providerId 被认出来(Iris 的 model.providerId =
 * 'claude-code-agent'),E0 保持这条映射以维持向后兼容。
 */
export function isExternalAgentExecutorId(id: string): boolean {
  return findAgentExecutorDescriptor(id)?.kind === 'external'
}

/** 全部已登记的描述(含 local)。core 事实下沉与测试用。 */
export function listAgentExecutorDescriptors(): AgentExecutorDescriptor[] {
  return [LOCAL_DESCRIPTOR, ...EXTERNAL_DESCRIPTORS]
}
