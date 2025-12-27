/**
 * Tool Core - Unified Tool Definition System
 *
 * Provides a consistent interface for defining tools with:
 * - Zod schema parameter validation
 * - Real-time metadata streaming
 * - Type-safe execution context
 * - Async initialization for dynamic descriptions
 *
 * Inspired by OpenCode's tool system design.
 */

import { z } from 'zod'

/**
 * Tool metadata - arbitrary key-value pairs for real-time UI updates
 */
export interface ToolMetadata {
  [key: string]: unknown
}

/**
 * Context passed to tool init function for dynamic configuration
 */
export interface InitContext {
  /** Available agents (for TaskTool) */
  agents?: Array<{ id: string; name: string; description: string }>
  /** Current workspace info */
  workspace?: { id: string; name: string }
  /** Current agent info (for SkillTool permission checking) */
  agent?: {
    id: string
    name: string
    permissions?: {
      skill?: Record<string, 'allow' | 'ask' | 'deny'>
    }
  }
  /** Available skills (for SkillTool) */
  skills?: Array<{
    id: string
    name: string
    description: string
    source: 'user' | 'project' | 'plugin'
    path: string
    directoryPath: string
    enabled: boolean
    instructions: string
    files?: Array<{ name: string; path: string; type: string }>
  }>
  /** Any additional context */
  [key: string]: unknown
}

/**
 * Tool execution context - provided to every tool during execution
 */
export interface ToolContext<M extends ToolMetadata = ToolMetadata> {
  /** Current session ID */
  sessionId: string
  /** Current message ID */
  messageId: string
  /** Current tool call ID - used for permission matching */
  toolCallId?: string
  /** Session's working directory - used as sandbox boundary for file access */
  workingDirectory?: string
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
  /**
   * Real-time metadata update callback
   * Call this to stream updates to the UI during tool execution
   */
  metadata(input: { title?: string; metadata?: Partial<M> }): void
}

/**
 * Tool execution result
 */
export interface ToolResult<M extends ToolMetadata = ToolMetadata> {
  /** Short title describing what happened */
  title: string
  /** Detailed output (shown to the LLM) */
  output: string
  /** Metadata for UI display */
  metadata: M
  /** Optional file attachments */
  attachments?: Array<{
    type: 'file' | 'image'
    path: string
    content?: string
  }>
}

/**
 * Tool definition info - complete tool specification
 */
export interface ToolInfo<
  P extends z.ZodType = z.ZodType,
  M extends ToolMetadata = ToolMetadata
> {
  /** Unique tool identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Description for LLM (used in system prompt) */
  description: string
  /** Tool category */
  category: 'builtin' | 'custom' | 'mcp'
  /** Zod schema for parameters */
  parameters: P
  /** Whether tool is enabled by default */
  enabled?: boolean
  /** Whether tool can be auto-executed without confirmation */
  autoExecute?: boolean
  /** Execute the tool with validated arguments */
  execute(args: z.infer<P>, ctx: ToolContext<M>): Promise<ToolResult<M>>
  /** Custom validation error formatter */
  formatValidationError?(error: z.ZodError): string
}

/**
 * Configuration for defining a tool (without id)
 */
export type ToolConfig<
  P extends z.ZodType = z.ZodType,
  M extends ToolMetadata = ToolMetadata
> = Omit<ToolInfo<P, M>, 'id'>

/**
 * Async tool initialization result - returned by init() function
 */
export interface ToolInitResult<
  P extends z.ZodType = z.ZodType,
  M extends ToolMetadata = ToolMetadata
> {
  /** Dynamic description for LLM */
  description: string
  /** Zod schema for parameters (can be dynamic) */
  parameters: P
  /** Execute the tool with validated arguments */
  execute(args: z.infer<P>, ctx: ToolContext<M>): Promise<ToolResult<M>>
  /** Custom validation error formatter */
  formatValidationError?(error: z.ZodError): string
}

/**
 * Async tool definition - supports dynamic initialization
 */
export interface ToolInfoAsync<
  P extends z.ZodType = z.ZodType,
  M extends ToolMetadata = ToolMetadata
> {
  /** Unique tool identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Tool category */
  category: 'builtin' | 'custom' | 'mcp'
  /** Whether tool is enabled by default */
  enabled?: boolean
  /** Whether tool can be auto-executed without confirmation */
  autoExecute?: boolean
  /** Async initialization function - called once to get description and parameters */
  init: (ctx?: InitContext) => Promise<ToolInitResult<P, M>>
  /** Cached initialization result (set after first init call) */
  _initialized?: ToolInitResult<P, M>
}

/**
 * Union type for both static and async tools
 */
export type ToolInfoUnion<
  P extends z.ZodType = z.ZodType,
  M extends ToolMetadata = ToolMetadata
> = ToolInfo<P, M> | ToolInfoAsync<P, M>

/**
 * Check if a tool is async (has init function)
 */
export function isAsyncTool<P extends z.ZodType, M extends ToolMetadata>(
  tool: ToolInfoUnion<P, M>
): tool is ToolInfoAsync<P, M> {
  return 'init' in tool && typeof tool.init === 'function'
}

/**
 * Tool namespace - provides Tool.define() and related utilities
 */
export namespace Tool {
  export type Metadata = ToolMetadata
  export type Context<M extends ToolMetadata = ToolMetadata> = ToolContext<M>
  export type Result<M extends ToolMetadata = ToolMetadata> = ToolResult<M>
  export type Info<P extends z.ZodType = z.ZodType, M extends ToolMetadata = ToolMetadata> = ToolInfo<P, M>
  export type InfoAsync<P extends z.ZodType = z.ZodType, M extends ToolMetadata = ToolMetadata> = ToolInfoAsync<P, M>
  export type InfoUnion<P extends z.ZodType = z.ZodType, M extends ToolMetadata = ToolMetadata> = ToolInfoUnion<P, M>
  export type InitResult<P extends z.ZodType = z.ZodType, M extends ToolMetadata = ToolMetadata> = ToolInitResult<P, M>

  /**
   * Configuration for async tool definition
   */
  export interface AsyncConfig<M extends ToolMetadata = ToolMetadata> {
    name: string
    category: 'builtin' | 'custom' | 'mcp'
    enabled?: boolean
    autoExecute?: boolean
  }

  /**
   * Define a new tool with type-safe parameters (static version)
   *
   * @example
   * ```typescript
   * const readTool = Tool.define('read', {
   *   name: 'Read File',
   *   description: 'Read contents of a file',
   *   category: 'builtin',
   *   parameters: z.object({
   *     path: z.string().describe('File path to read'),
   *     offset: z.number().optional().describe('Line offset'),
   *   }),
   *   async execute(args, ctx) {
   *     ctx.metadata({ title: `Reading ${args.path}` })
   *     const content = await fs.readFile(args.path, 'utf-8')
   *     return {
   *       title: `Read ${args.path}`,
   *       output: content,
   *       metadata: { lineCount: content.split('\n').length }
   *     }
   *   }
   * })
   * ```
   */
  export function define<P extends z.ZodType, M extends ToolMetadata = ToolMetadata>(
    id: string,
    config: ToolConfig<P, M>
  ): ToolInfo<P, M>

  /**
   * Define a new tool with async initialization for dynamic descriptions
   *
   * @example
   * ```typescript
   * const taskTool = Tool.define('task', {
   *   name: 'Task',
   *   category: 'builtin',
   * }, async (ctx) => {
   *   const agents = ctx?.agents || []
   *   return {
   *     description: `Launch a subagent. Available: ${agents.map(a => a.name).join(', ')}`,
   *     parameters: z.object({
   *       agent: z.enum(agents.map(a => a.id) as [string, ...string[]]),
   *       prompt: z.string(),
   *     }),
   *     async execute(args, toolCtx) {
   *       // ...
   *     }
   *   }
   * })
   * ```
   */
  export function define<P extends z.ZodType, M extends ToolMetadata = ToolMetadata>(
    id: string,
    config: AsyncConfig<M>,
    init: (ctx?: InitContext) => Promise<ToolInitResult<P, M>>
  ): ToolInfoAsync<P, M>

  // Implementation
  export function define<P extends z.ZodType, M extends ToolMetadata = ToolMetadata>(
    id: string,
    config: ToolConfig<P, M> | AsyncConfig<M>,
    init?: (ctx?: InitContext) => Promise<ToolInitResult<P, M>>
  ): ToolInfo<P, M> | ToolInfoAsync<P, M> {
    // Async tool with init function
    if (init) {
      return {
        id,
        name: config.name,
        category: config.category,
        enabled: config.enabled ?? true,
        autoExecute: config.autoExecute ?? false,
        init,
      } as ToolInfoAsync<P, M>
    }

    // Static tool
    const staticConfig = config as ToolConfig<P, M>
    return {
      id,
      ...staticConfig,
      enabled: staticConfig.enabled ?? true,
      autoExecute: staticConfig.autoExecute ?? false,
    }
  }

  /**
   * Initialize an async tool (call init and cache result)
   */
  export async function initialize<P extends z.ZodType, M extends ToolMetadata>(
    tool: ToolInfoAsync<P, M>,
    ctx?: InitContext
  ): Promise<ToolInitResult<P, M>> {
    if (tool._initialized) {
      return tool._initialized
    }
    const result = await tool.init(ctx)
    tool._initialized = result
    return result
  }

  /**
   * Get the initialized result of an async tool (throws if not initialized)
   */
  export function getInitialized<P extends z.ZodType, M extends ToolMetadata>(
    tool: ToolInfoAsync<P, M>
  ): ToolInitResult<P, M> {
    if (!tool._initialized) {
      throw new Error(`Tool "${tool.id}" has not been initialized. Call Tool.initialize() first.`)
    }
    return tool._initialized
  }

  /**
   * Reset an async tool's initialization (for re-initialization with new context)
   */
  export function resetInit<P extends z.ZodType, M extends ToolMetadata>(
    tool: ToolInfoAsync<P, M>
  ): void {
    tool._initialized = undefined
  }

  /**
   * Validate tool arguments against its schema
   * Returns validated args or throws ZodError
   */
  export function validateArgs<P extends z.ZodType>(
    tool: ToolInfo<P>,
    args: unknown
  ): z.infer<P> {
    return tool.parameters.parse(args)
  }

  /**
   * Safe validation - returns result object instead of throwing
   */
  export function safeValidateArgs<P extends z.ZodType>(
    tool: ToolInfo<P>,
    args: unknown
  ): { success: true; data: z.infer<P> } | { success: false; error: z.ZodError } {
    const result = tool.parameters.safeParse(args)
    if (result.success) {
      return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
  }

  /**
   * Execute a tool with validation
   */
  export async function execute<P extends z.ZodType, M extends ToolMetadata>(
    tool: ToolInfo<P, M>,
    args: unknown,
    ctx: ToolContext<M>
  ): Promise<ToolResult<M>> {
    // Validate arguments
    const validatedArgs = validateArgs(tool, args)
    // Execute with validated args
    return tool.execute(validatedArgs, ctx)
  }

  /**
   * Create a no-op metadata callback (for testing or when UI updates aren't needed)
   */
  export function noopMetadata(): (input: { title?: string; metadata?: Partial<ToolMetadata> }) => void {
    return () => {}
  }

  /**
   * Create a basic context for testing
   */
  export function createTestContext(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: 'test-session',
      messageId: 'test-message',
      metadata: noopMetadata(),
      ...overrides,
    }
  }
}

/**
 * Convert Zod schema to JSON Schema for AI SDK compatibility
 * Uses Zod 4's native toJSONSchema() method
 */
export function zodToJsonSchema(schema: z.ZodType): {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
} {
  try {
    // Use Zod 4's native toJSONSchema() method
    const schemaWithMethod = schema as z.ZodType & { toJSONSchema?: () => Record<string, unknown> }
    if (typeof schemaWithMethod.toJSONSchema === 'function') {
      const jsonSchema = schemaWithMethod.toJSONSchema()
      return {
        type: 'object',
        properties: (jsonSchema.properties as Record<string, unknown>) || {},
        required: (jsonSchema.required as string[]) || [],
      }
    }

    // Fallback for schemas without toJSONSchema (shouldn't happen in Zod 4)
    console.warn('[zodToJsonSchema] Schema does not have toJSONSchema method')
    return { type: 'object', properties: {}, required: [] }
  } catch (error) {
    console.error('[zodToJsonSchema] Error converting schema:', error)
    return { type: 'object', properties: {}, required: [] }
  }
}
