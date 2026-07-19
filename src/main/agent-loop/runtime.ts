import type { InitContext } from '../tools/core/tool.js'
import type { ToolExecutionContext } from '../tools/types.js'
import type { ToolSettings } from '../../shared/ipc.js'
import {
  buildAgentLoopRuntime as buildCoreAgentLoopRuntime,
} from '@onething/core/agent-loop'
import type {
  AgentLoopOptions,
  AgentAfterTurnHook,
  AgentBeforeTurnHook,
  AgentMessage,
  AgentOutputModality,
  AgentPromptInjector,
  AgentProvider,
  AgentReasoningEffort,
  AgentSkillContext,
  AgentTool,
  AgentToolPolicy,
} from '@onething/core/agent-loop'
import { agentToolsFromRegistry } from './tools.js'

export interface AgentRegistryToolRuntimeOptions {
  initContext?: InitContext
  executionContext: Omit<ToolExecutionContext, 'toolCallId'>
  toolSettings?: ToolSettings
}

export interface AgentRuntimeToolOptions {
  tools?: AgentTool[]
  registry?: AgentRegistryToolRuntimeOptions
  policy?: AgentToolPolicy
  selectedToolNames?: string[]
}

export interface AgentRuntimePromptOptions {
  systemPrompt?: string | (() => string | Promise<string>)
  injectors?: AgentPromptInjector[]
  injectSkills?: boolean
}

export interface BuildAgentLoopRuntimeOptions {
  provider: AgentProvider
  model: string
  messages: AgentMessage[]
  requestedOutputModalities?: AgentOutputModality[]
  sessionId: string
  messageId: string
  workingDirectory?: string
  abortSignal?: AbortSignal
  tools?: AgentRuntimeToolOptions
  skills?: AgentSkillContext[]
  prompt?: AgentRuntimePromptOptions
  temperature?: number
  maxTokens?: number
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: AgentReasoningEffort
  maxTurns?: number
  beforeTurn?: AgentBeforeTurnHook
  afterTurn?: AgentAfterTurnHook
  onEvent?: AgentLoopOptions['onEvent']
}

export async function buildAgentLoopRuntime(
  options: BuildAgentLoopRuntimeOptions,
): Promise<AgentLoopOptions> {
  const toolOptions = options.tools ?? {}
  const registryTools = toolOptions.registry
    ? await agentToolsFromRegistry({
        ...toolOptions.registry,
        selectedToolNames: toolOptions.selectedToolNames,
      })
    : []
  const tools = [
    ...registryTools,
    ...(toolOptions.tools ?? []),
  ]

  return buildCoreAgentLoopRuntime({
    provider: options.provider,
    model: options.model,
    messages: options.messages,
    requestedOutputModalities: options.requestedOutputModalities,
    sessionId: options.sessionId,
    messageId: options.messageId,
    workingDirectory: options.workingDirectory,
    abortSignal: options.abortSignal,
    tools: {
      tools,
      policy: toolOptions.policy,
      selectedToolNames: toolOptions.selectedToolNames,
    },
    skills: options.skills,
    prompt: options.prompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    thinking: options.thinking,
    reasoningEffort: options.reasoningEffort,
    maxTurns: options.maxTurns,
    beforeTurn: options.beforeTurn,
    afterTurn: options.afterTurn,
    onEvent: options.onEvent,
  })
}
