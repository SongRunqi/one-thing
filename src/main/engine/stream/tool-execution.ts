/**
 * Tool Execution Module
 * Handles tool detection, execution, and step management
 */

import * as store from '../../store.js'
import type { Step, StepType, SkillDefinition, ToolCall } from '../../../shared/ipc.js'
import type { JsonObject } from '../../../shared/json.js'
import { analyzeTool, executeTool } from '../../tools/index.js'
import { isMCPTool, executeMCPTool } from '../../mcp/index.js'
import type { ToolExecutionContext, ToolExecutionResult, ToolPartialResultUpdate } from '../../tools/types.js'
import type { ToolEffect, ToolPreview } from '@onething/core/tools'
import type { StreamContext } from './stream-processor.js'
import { createEventOnlyEmitter } from '../../events/event-only-emitter.js'
import { enforcePermissionPolicy } from '../../tools/core/permission-policy.js'
import {
  createCoreId,
  createToolExecutionStepWithFactory,
  detectSkillUsage,
  generateStepTitle,
  getStepType,
} from '@onething/core/engine'
import type { JsonValue } from '@onething/core'
import {
  executeOnethingDirectTool,
  executeOnethingToolAndUpdate,
} from '@onething/runtime/tools'

export {
  detectSkillUsage,
  generateStepTitle,
  getStepType,
}

/**
 * Execute a tool directly without going through Tool Agent LLM
 * This is the new direct execution path for simple tool calls
 */
export async function executeToolDirectly(
  toolName: string,
  args: JsonObject,
  context: {
    sessionId: string
    messageId: string
    toolCallId?: string
    workingDirectory?: string  // Session's active working directory
    workingDirectoryRoots?: string[] // Additional sandbox roots
    abortSignal?: AbortSignal
    onMetadata?: ToolExecutionContext['onMetadata']
    onPartialResult?: (update: ToolPartialResultUpdate) => void
    // Step event callbacks for sub-agent tools (e.g., CustomAgent)
    onStepStart?: (step: Step) => void
    onStepComplete?: (step: Step) => void
    beforeSideEffect?: () => Promise<void>
  }
): Promise<ToolExecutionResult> {
  return executeOnethingDirectTool<
    ToolExecutionResult,
    ToolExecutionContext,
    NonNullable<ToolExecutionContext['onMetadata']> extends (update: infer TUpdate) => void ? TUpdate : never,
    ToolPartialResultUpdate,
    Step,
    ToolEffect,
    ToolPreview
  >({
    toolName,
    args,
    context,
    isMCPTool,
    executeMCPTool,
    analyzeTool,
    executeTool,
    enforcePermission: enforcePermissionPolicy,
    logger: console,
  })
}

/**
 * Create a new step object with full tool call information
 */
export function createStep(
  toolCall: ToolCall,
  skillName?: string | null,
  turnIndex?: number
): Step {
  return createToolExecutionStepWithFactory(toolCall, {
    createId: createCoreId,
    now: Date.now,
    skillName,
    turnIndex,
  }) as Step
}

/**
 * Execute a tool (MCP or built-in) and update tool call status
 */
export async function executeToolAndUpdate(
  ctx: StreamContext,
  toolCall: ToolCall,
  toolCallData: { toolName: string; args: JsonObject },
  allToolCalls: ToolCall[],
  _skills: SkillDefinition[] = [],
  turnIndex?: number,
  existingStepId?: string,
  options: {
    beforeSideEffect?: () => Promise<void>
  } = {},
): Promise<void> {
  const emitter = createEventOnlyEmitter(ctx)
  await executeOnethingToolAndUpdate<
    ToolCall,
    Step,
    ToolExecutionResult,
    NonNullable<ToolExecutionContext['onMetadata']> extends (update: infer TUpdate) => void ? TUpdate : never,
    ToolPartialResultUpdate,
    unknown,
    JsonValue | undefined,
    ToolCall['changes']
  >({
    ctx: {
      sessionId: ctx.sessionId,
      assistantMessageId: ctx.assistantMessageId,
      abortSignal: ctx.abortSignal,
    },
    toolCall,
    toolCallData,
    allToolCalls,
    turnIndex,
    existingStepId,
    beforeSideEffect: options.beforeSideEffect,
    store: {
      getSession: store.getSession,
      updateMessageToolCalls: store.updateMessageToolCalls,
    },
    emitter,
    executeToolDirectly: (name, directArgs, directContext) =>
      executeToolDirectly(name, directArgs, directContext as Parameters<typeof executeToolDirectly>[2]),
    createStep,
    now: Date.now,
    logger: console,
  })
}
