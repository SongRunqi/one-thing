import type {
  AIToolSchema,
  ToolCall,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from './types.js'
import type {
  InitContext,
  ToolExecutionMode,
  ToolInfo,
  ToolInfoAsync,
  ToolInfoUnion,
} from './core/tool.js'
import type { ToolEffect, ToolPreview } from '@onething/core/tools'
import type { JsonObject } from '@shared/json.js'
import { createOnethingToolRegistry } from '@onething/runtime/tools'
import type { OnethingToolExecutionContext } from '@onething/runtime/tools'
import { v4 as uuidv4 } from 'uuid'
import { registerBuiltinTools } from './builtin/index.js'
import { registerHeadlessBuiltinTools } from './builtin/headless.js'

const toolRegistry = createOnethingToolRegistry({
  logger: console,
  createToolCallId: uuidv4,
})

export interface ToolAnalysisResult {
  success: boolean
  effects?: ToolEffect[]
  preview?: ToolPreview
  error?: string
}

export function registerTool<T extends ToolInfoUnion>(tool: T): void {
  toolRegistry.registerTool(tool)
}

export function unregisterTool(toolId: string): boolean {
  return toolRegistry.unregisterTool(toolId)
}

export function getTool(toolId: string): ToolInfo | undefined {
  return toolRegistry.getTool(toolId) as ToolInfo | undefined
}

export function getToolAsync(toolId: string): ToolInfoAsync | undefined {
  return toolRegistry.getToolAsync(toolId) as ToolInfoAsync | undefined
}

export function hasTool(toolId: string): boolean {
  return toolRegistry.hasTool(toolId)
}

export function getToolExecutionMode(toolId: string): ToolExecutionMode {
  return toolRegistry.getToolExecutionMode(toolId) as ToolExecutionMode
}

export function getAllTools(): ToolDefinition[] {
  return toolRegistry.getAllTools() as ToolDefinition[]
}

export async function getAllToolsAsync(): Promise<ToolDefinition[]> {
  return await toolRegistry.getAllToolsAsync() as ToolDefinition[]
}

export async function getEnabledToolsAsync(
  toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>,
): Promise<ToolDefinition[]> {
  return await toolRegistry.getEnabledToolsAsync(toolSettings) as ToolDefinition[]
}

export function getAllStaticTools(): ToolInfo[] {
  return toolRegistry.getAllStaticTools() as ToolInfo[]
}

export function getAllAsyncTools(): ToolInfoAsync[] {
  return toolRegistry.getAllAsyncTools() as ToolInfoAsync[]
}

export function getEnabledTools(): ToolDefinition[] {
  return toolRegistry.getEnabledTools() as ToolDefinition[]
}

export function getEnabledStaticTools(): ToolInfo[] {
  return toolRegistry.getEnabledStaticTools() as ToolInfo[]
}

export function getEnabledAsyncTools(): ToolInfoAsync[] {
  return toolRegistry.getEnabledAsyncTools() as ToolInfoAsync[]
}

export function setInitContext(ctx: InitContext | undefined): void {
  toolRegistry.setInitContext(ctx)
}

export function getInitContext(): InitContext | undefined {
  return toolRegistry.getInitContext() as InitContext | undefined
}

export async function initializeAsyncTools(ctx?: InitContext): Promise<void> {
  await toolRegistry.initializeAsyncTools(ctx)
}

export async function getToolsForAI(
  toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>,
): Promise<Record<string, AIToolSchema>> {
  return await toolRegistry.getToolsForAI(toolSettings) as Record<string, AIToolSchema>
}

export async function analyzeTool(
  toolId: string,
  args: JsonObject,
  context: ToolExecutionContext,
): Promise<ToolAnalysisResult> {
  return await toolRegistry.analyzeTool(toolId, args, context as OnethingToolExecutionContext) as ToolAnalysisResult
}

export async function executeTool(
  toolId: string,
  args: JsonObject,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  return await toolRegistry.executeTool(toolId, args, context as OnethingToolExecutionContext) as ToolExecutionResult
}

export function createToolCall(
  toolId: string,
  toolName: string,
  args: JsonObject,
): ToolCall {
  return toolRegistry.createToolCall(toolId, toolName, args) as ToolCall
}

export function canAutoExecute(
  toolId: string,
  toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>,
): boolean {
  return toolRegistry.canAutoExecute(toolId, toolSettings)
}

export async function initializeToolRegistry(): Promise<void> {
  // Static import: this runs inside the factory's top-level await, and a
  // dynamic import that lands in a chunk cycling back to the entry deadlocks
  // (or TDZ-crashes) single-file server bundles.
  await toolRegistry.initializeToolRegistry(() => {
    registerBuiltinTools()
  }, 'tools')
}

export async function initializeHeadlessToolRegistry(): Promise<void> {
  await toolRegistry.initializeToolRegistry(() => {
    registerHeadlessBuiltinTools()
  }, 'headless tools')
}

export function isInitialized(): boolean {
  return toolRegistry.isInitialized()
}
