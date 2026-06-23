import {
  executeTool,
  getToolsForAI,
  initializeToolRegistry,
  setInitContext,
} from '../tools/registry.js'
import type { InitContext } from '../tools/core/tool.js'
import type { ToolExecutionContext } from '../tools/types.js'
import type { ToolSettings } from '../../shared/ipc.js'
import type { AgentTool } from './types.js'

export interface AgentRegistryToolOptions {
  initContext?: InitContext
  executionContext: Omit<ToolExecutionContext, 'toolCallId'>
  toolSettings?: ToolSettings
  selectedToolNames?: string[]
}

export async function agentToolsFromRegistry(options: AgentRegistryToolOptions): Promise<AgentTool[]> {
  await initializeToolRegistry()
  setInitContext(options.initContext)

  const selected = options.selectedToolNames?.length
    ? new Set(options.selectedToolNames)
    : undefined
  const toolsForAI = await getToolsForAI(options.toolSettings?.tools)

  return Object.entries(toolsForAI)
    .filter(([name]) => !selected || selected.has(name))
    .map(([name, schema]) => ({
      name,
      description: schema.description,
      parameters: schema.parameters,
      async execute(args, ctx) {
        const result = await executeTool(name, args, {
          ...options.executionContext,
          sessionId: ctx.sessionId,
          messageId: ctx.messageId,
          toolCallId: ctx.toolCallId,
          workingDirectory: ctx.workingDirectory ?? options.executionContext.workingDirectory,
          abortSignal: ctx.abortSignal ?? options.executionContext.abortSignal,
          onMetadata: ctx.onMetadata ?? options.executionContext.onMetadata,
          onPartialResult: (ctx.onPartialResult as ToolExecutionContext['onPartialResult']) ?? options.executionContext.onPartialResult,
        })
        if (!result.success) {
          return {
            content: '',
            error: result.error || `Tool failed: ${name}`,
            data: result,
            requiresConfirmation: result.requiresConfirmation,
            commandType: result.commandType,
            aborted: result.aborted,
            rejected: result.rejected,
            rejectionReason: result.rejectionReason,
          }
        }
        const output = result.data?.output ?? result.data ?? ''
        return {
          content: typeof output === 'string' ? output : JSON.stringify(output),
          data: result.data,
          requiresConfirmation: result.requiresConfirmation,
          commandType: result.commandType,
          aborted: result.aborted,
          rejected: result.rejected,
          rejectionReason: result.rejectionReason,
        }
      },
    }))
}
