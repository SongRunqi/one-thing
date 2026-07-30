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
  type CollabAgentLike,
} from '@onething/runtime/collab'
import { getCollabSelfTaskFacts } from '../../collab/board-store.js'
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

  const toRosterAgent = (agentId: string): CollabAgentLike | null => {
    const agent = findAgent(agentId)
    if (!agent) return null
    return {
      id: agent.id,
      name: agent.name,
      title: agent.title,
      description: agent.description,
      avatar: agent.avatar,
      avatarImage: agent.avatarImage,
    }
  }
  const selfAgent = session.agentId ? findAgent(session.agentId) : null
  if (!selfAgent) return null
  const members = room.room.memberAgentIds
    .map(toRosterAgent)
    .filter((member): member is CollabAgentLike => member !== null)
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
      personaPrompt: selfAgent.systemPrompt || `你是${selfAgent.name}。`,
      // W9.3: whatever the board says this agent is currently on the hook for.
      // Every activation reason gets it — an agent must not have to be told
      // about its own in-flight work by another agent's (possibly wrong) claim.
      taskFacts: getCollabSelfTaskFacts(roomSessionId, selfAgent.id),
      // collab-team-v2 §8: the shared rules ride along on a real turn only —
      // the willingness judgement calls the same builder and needs none of it.
      includeCommonRules: true,
      // agent-im-dm.md §2.3:单成员 dm 房换成私聊那一版情况说明(群房零改动)。
      // 判定读的是**房**的配置,与工具面那条推导同源(app/agents/profile.ts)。
      dm: isUserDmRoom(room.room),
      // §3.1/D4:双成员 dm 房再换一版 —— 群版会把用户说成"群成员",而这间房里
      // 用户是**旁观者**。透明制要进 agent 的认知,不然它会以为这是暗通道。
      dmPair: isAgentPairDmRoom(room.room),
    }),
    toolGuidelines: [],
    disabledSections: [
      'agent', // persona already IS the system prompt — no duplicate section
      'voice',
      'runtime-context',
      'context-update-convention',
      'workdir',
      'active-project',
      'known-projects',
      'skills',
      'os',
      'todo',
      'agents-md',
      'context-variables',
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
