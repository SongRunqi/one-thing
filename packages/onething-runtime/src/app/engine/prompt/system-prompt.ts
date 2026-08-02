import {
  type CoreBuildPromptContextOptions,
  type CoreBuildPromptResult,
  type CorePromptRequestMessage,
} from '@onething/core/engine'
import type { AgentProviderData } from '@onething/core/agent-loop'
import type { SkillDefinition, AppSettings } from '@shared/ipc.js'
import type { JsonObject, JsonObjectProperty } from '@shared/json.js'
import {
  buildOnethingPrompt,
  buildOnethingSystemPrompt,
  loadAgentsMdInstructions,
  type BuildOnethingPromptContextOptions,
} from '@onething/runtime/prompts'
import { getMacOSAutomationDocsPath } from '../../stores/paths.js'
import { getTodoPlanDirectory } from '../../todo-plan/store.js'
import { defaultAgent, findAgent } from '../../agents/index.js'
import * as store from '../../store.js'
import {
  buildCollabRoomSystemPrompt,
  isAgentPairDmRoom,
  isUserDmRoom,
} from '@onething/runtime/collab'
import { collabRoomMembers } from '../../collab/members.js'
import { collabUserPromptFields } from '../../collab/user-identity.js'
import type { PromptProviderConfig } from './plugin-context.js'
import type { PromptActiveProject, PromptKnownProjects } from './types.js'

export interface BuildPromptContextOptions extends Omit<CoreBuildPromptContextOptions, 'settings' | 'skills' | 'activeProject' | 'knownProjects'> {
  settings?: AppSettings
  skills: SkillDefinition[]
  activeProject?: PromptActiveProject
  knownProjects?: PromptKnownProjects
}

type PromptMessageContent = JsonObjectProperty | object
type PromptToolCall = { toolCallId: string; toolName: string; args: JsonObject }

export type PromptRequestMessage =
  | { role: 'system' | 'developer' | 'user'; content: PromptMessageContent }
  | {
      role: 'assistant'
      content: PromptMessageContent
      reasoningContent?: string
      providerData?: AgentProviderData[]
      toolCalls?: PromptToolCall[]
    }
  | {
      role: 'tool'
      content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: PromptMessageContent }>
    }

export interface BuildPromptOptions extends BuildPromptContextOptions {
  providerId: string
  providerConfig?: PromptProviderConfig
  historyMessages: PromptRequestMessage[]
}

export interface BuildPromptResult extends Omit<CoreBuildPromptResult, 'messages'> {
  messages: PromptRequestMessage[]
}

/**
 * Room turns get a persona-only system prompt (docs/multi-agent-collab.md D3,
 * 评审修订「模拟房间」): the product prompt's assistant identity + tool/memory/
 * workspace sections make the model "an app assistant simulating a chat",
 * not the person itself. baseSystemPrompt becomes the persona + roster, and
 * every product developer section (plugins included — soul-memory rules must
 * not leak into personas) is disabled. Mirrors the probe-validated setup.
 */
function collabRoomOverrides(
  ctx: BuildPromptContextOptions,
): Partial<BuildOnethingPromptContextOptions> | null {
  const sessionId = (ctx as { sessionId?: string }).sessionId
  if (!sessionId) return null
  const session = store.getSession(sessionId)
  if (!session) return null

  /**
   * W18: the turn runs in the agent's execution session, so the room material
   * (persona, roster, room name, taskFacts) comes from the room that session is
   * currently answering — the drive wrote that pointer before emitting. The
   * session being built is NOT where the roster lives any more.
   */
  const roomSessionId = session.kind === 'agent'
    ? session.collab?.roomSessionId
    : session.kind === 'room' ? session.id : undefined
  if (!roomSessionId) return null
  const room = roomSessionId === session.id ? session : store.getSession(roomSessionId)
  if (room?.kind !== 'room' || !room.room) return null

  const selfAgent = session.agentId ? findAgent(session.agentId) : null
  if (!selfAgent) return null
  /**
   * 提示词里的花名册。带 `description`(模型据此判断这件事该找谁),且**退休的
   * 照列**(`includeRetired`)—— 与激活面相反,因为转录里还有它说过的话,花名册
   * 里没有它的话,模型读到那些发言会以为房间里混进了外人。
   *
   * 投影本身走 `collab/members.ts` 的单一点(架构审查 B8)。
   */
  const members = collabRoomMembers(room.room.memberAgentIds, {
    withDescription: true,
    includeRetired: true,
  })
  if (members.length === 0) return null

  return {
    baseSystemPrompt: buildCollabRoomSystemPrompt({
      self: {
        id: selfAgent.id,
        name: selfAgent.name,
        title: selfAgent.title,
        description: selfAgent.description,
        avatar: selfAgent.avatar,
        avatarImage: selfAgent.avatarImage,
      },
      members,
      roomName: room.name,
      // agent-dm-user.md §2.3:用户不再是匿名的「用户」——花名册里 TA 和同事
      // 同一书写法(`一天#yitian(用户)`),情况说明里的称呼也是 TA 的名字。
      ...collabUserPromptFields(),
      personaPrompt: selfAgent.systemPrompt || `你是${selfAgent.name}。`,
      // collab-team-v2 §8: the shared rules ride along on a real turn only —
      // the willingness judgement calls the same builder and needs none of it.
      includeCommonRules: true,
      // 花名册回到 system prompt(collab-turn-protocol-and-identity.md B)。
      // 它曾被搬进 `<ChatRoom><Members>`,而 v3 V2 删掉了那块载荷 —— 名单从此
      // 指向一段不存在的文本,模型于是把用户与花名册上的名字数成两个人。
      // members 与用户行(`一天#yitian(用户)`)都在手边,零新数据搬运。
      rosterInSystemPrompt: true,
      // 真回合的消息以 `<message from>` 信封到达,未读裹在 `<Notification>` 里 ——
      // 视野说明因此常开。它与花名册在哪是两个正交的事实,别再合成一个开关。
      driveEnvelope: true,
      // agent-im-dm.md §2.3:单成员 dm 房换成私聊那一版情况说明(群房零改动)。
      // 判定读的是**房**的配置,与工具面那条推导同源(app/agents/profile.ts)。
      dm: isUserDmRoom(room.room),
      // §3.1/D4:双成员 dm 房再换一版 —— 群版会把用户说成"群成员",而这间房里
      // 用户是**旁观者**。透明制要进 agent 的认知,不然它会以为这是暗通道。
      dmPair: isAgentPairDmRoom(room.room),
    }),
    toolGuidelines: [],
    // 禁用整批产品段的理由是「soul-memory rules must not leak into personas」——
    // 防的是**产品说明文案**污染 persona。而 `<context-variables>` 不是产品说明,
    // 它是通往运行时状态板的那句指路,正是群聊里最该有的东西
    // (agent-self-state-variables.md §5):此前群房里模型看不到任何变量的值,
    // 却握着 `variable` 工具,而那个工具当时唯一的读法是全量 list —— 既没有被动
    // 可见性,主动读的代价又最高。`context-update-convention` 一并解禁:否则状态
    // 块进来了,却没有任何文案告诉模型那是什么。
    disabledSections: [
      'agent', // persona already IS the system prompt — no duplicate section
      'voice',
      'runtime-context',
      'workdir',
      'active-project',
      'known-projects',
      'skills',
      'os',
      'todo',
      'agents-md',
      'plugins',
    ],
  }
}

function coreOptions(ctx: BuildPromptContextOptions): BuildOnethingPromptContextOptions {
  return {
    ...ctx,
    host: {
      // persona 功能兜底(域模型 §3.3):无 agentId / 查无此人 → default persona。
      getAgent: (agentId: string | undefined) => findAgent(agentId) ?? defaultAgent(),
      getMacOSAutomationDocsPath,
      getTodoPlanDirectory,
    },
    ...(collabRoomOverrides(ctx) ?? {}),
  }
}

export async function buildSystemPrompt(
  ctx: BuildPromptContextOptions,
): Promise<{ system: string; developer: string[] }> {
  return buildOnethingSystemPrompt(coreOptions(ctx))
}

export async function buildPrompt(options: BuildPromptOptions): Promise<BuildPromptResult> {
  return buildOnethingPrompt({
    ...coreOptions(options),
    providerId: options.providerId,
    historyMessages: options.historyMessages as CorePromptRequestMessage[],
  }) as Promise<BuildPromptResult>
}

export {
  loadAgentsMdInstructions,
}
