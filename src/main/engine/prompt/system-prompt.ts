import {
  type CoreBuildPromptContextOptions,
  type CoreBuildPromptResult,
  type CorePromptRequestMessage,
} from '@onething/core/engine'
import type { AgentProviderData } from '@onething/core/agent-loop'
import type { SkillDefinition, AppSettings } from '../../../shared/ipc.js'
import type { JsonObject, JsonObjectProperty } from '../../../shared/json.js'
import {
  buildOnethingPrompt,
  buildOnethingSystemPrompt,
  loadAgentsMdInstructions,
  type BuildOnethingPromptContextOptions,
} from '@onething/runtime/prompts'
import { getMacOSAutomationDocsPath } from '../../stores/paths.js'
import { getAgent } from '../../agents/index.js'
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

function coreOptions(ctx: BuildPromptContextOptions): BuildOnethingPromptContextOptions {
  return {
    ...ctx,
    host: {
      getAgent,
      getMacOSAutomationDocsPath,
    },
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
