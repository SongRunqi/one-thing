import {
  executeTool,
  getEnabledToolsAsync,
  initializeToolRegistry,
  setInitContext,
} from '../tools/registry.js'
import type { InitContext } from '../tools/core/tool.js'
import type { ToolExecutionContext } from '../tools/types.js'
import type { ToolSettings } from '@shared/ipc.js'
import { toJsonObject, toJsonValue } from '@shared/json.js'
import {
  agentModelToolsFromDefinitions,
  agentToolDefinitionsFromSourceTools,
  agentToolsFromToolDefinitions,
} from '@onething/core/agent-loop'
import type {
  AgentModelToolDefinition,
  AgentSourceToolDefinition,
  AgentToolExecutionAdapter,
  AgentToolExecutionAdapterResult,
} from '@onething/core/agent-loop'
import type { AgentTool } from '@onething/core/agent-loop'
import { resolveAIToolName } from '@onething/core/agent-loop'

export {
  agentModelToolsFromDefinitions,
  agentToolDefinitionsFromSourceTools,
  agentToolsFromToolDefinitions,
}
export type {
  AgentModelToolDefinition,
  AgentSourceToolDefinition,
  AgentToolExecutionAdapter,
  AgentToolExecutionAdapterResult,
}

export interface AgentRegistryToolOptions {
  initContext?: InitContext
  executionContext: Omit<ToolExecutionContext, 'toolCallId'>
  toolSettings?: ToolSettings
  selectedToolNames?: string[]
}

export async function agentToolsFromRegistry(options: AgentRegistryToolOptions): Promise<AgentTool[]> {
  await initializeToolRegistry()
  setInitContext(options.initContext)

  if (options.toolSettings?.enableToolCalls === false) {
    return []
  }

  const selected = options.selectedToolNames?.length
    ? new Set(options.selectedToolNames)
    : undefined
  const sourceTools = await getEnabledToolsAsync(options.toolSettings?.tools)
  const sourceDefinitions = agentToolDefinitionsFromSourceTools(sourceTools)
  const definitions = selected
    ? Object.fromEntries(
        Object.entries(sourceDefinitions)
          .filter(([name]) => selected.has(name) || selected.has(resolveAIToolName(name))),
      )
    : sourceDefinitions

  return agentToolsFromToolDefinitions(definitions, async (name, args, ctx) => {
    const result = await executeTool(resolveAIToolName(name), args, {
      ...options.executionContext,
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      toolCallId: ctx.toolCallId,
      workingDirectory: ctx.workingDirectory ?? options.executionContext.workingDirectory,
      abortSignal: ctx.abortSignal ?? options.executionContext.abortSignal,
      onMetadata: ctx.onMetadata
        ? update => ctx.onMetadata?.({
            title: update.title,
            metadata: toJsonObject(update.metadata),
          })
        : options.executionContext.onMetadata,
      onPartialResult: ctx.onPartialResult
        ? update => ctx.onPartialResult?.(update)
        : options.executionContext.onPartialResult,
    })
    return {
      ...result,
      data: toJsonValue(result.data),
    }
  })
}
