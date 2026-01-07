/**
 * Custom Tool Executor
 *
 * Executes individual custom tools defined in CustomAgents.
 * Supports three execution types: bash, http, and builtin.
 */

import { spawn } from 'child_process'
import type {
  CustomToolDefinition,
  CustomToolResult,
  BashExecution,
  HttpExecution,
  BuiltinExecution,
} from '../../../shared/ipc/custom-agents.js'
import { executeTool } from '../../tools/index.js'

/**
 * Default timeout for tool execution (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000

/**
 * Interpolate template placeholders with actual values
 *
 * Replaces {{param}} with the corresponding value from args
 */
export function interpolateTemplate(
  template: string,
  args: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, paramName) => {
    const value = args[paramName]
    if (value === undefined || value === null) {
      return ''
    }
    // Escape shell special characters for bash commands
    if (typeof value === 'string') {
      return value
    }
    return String(value)
  })
}

/**
 * Escape a value for safe use in shell commands
 */
export function escapeShellArg(arg: string): string {
  // Replace single quotes with escaped version
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Execute a bash command
 */
async function executeBashTool(
  execution: BashExecution,
  args: Record<string, unknown>,
  context: {
    workingDirectory?: string
    abortSignal?: AbortSignal
  }
): Promise<CustomToolResult> {
  const startTime = Date.now()

  // Interpolate command template with args
  const command = interpolateTemplate(execution.command, args)

  const timeout = execution.timeout ?? DEFAULT_TIMEOUT

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      ...execution.env,
    }

    const child = spawn('bash', ['-c', command], {
      cwd: context.workingDirectory || process.cwd(),
      env,
      timeout,
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    // Handle abort signal
    if (context.abortSignal) {
      const abortHandler = () => {
        killed = true
        child.kill('SIGTERM')
      }
      context.abortSignal.addEventListener('abort', abortHandler, { once: true })
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      resolve({
        success: false,
        output: '',
        error: `Command execution failed: ${error.message}`,
        executionTimeMs: Date.now() - startTime,
      })
    })

    child.on('close', (code) => {
      const executionTimeMs = Date.now() - startTime

      if (killed) {
        resolve({
          success: false,
          output: stdout,
          error: 'Command was aborted',
          executionTimeMs,
        })
        return
      }

      const success = code === 0
      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '')

      resolve({
        success,
        output: output.trim(),
        error: success ? undefined : `Command exited with code ${code}`,
        executionTimeMs,
      })
    })
  })
}

/**
 * Execute an HTTP request
 */
async function executeHttpTool(
  execution: HttpExecution,
  args: Record<string, unknown>,
  context: {
    abortSignal?: AbortSignal
  }
): Promise<CustomToolResult> {
  const startTime = Date.now()

  try {
    // Interpolate URL and body templates
    const url = interpolateTemplate(execution.url, args)
    const body = execution.bodyTemplate
      ? interpolateTemplate(execution.bodyTemplate, args)
      : undefined

    const timeout = execution.timeout ?? DEFAULT_TIMEOUT

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: execution.method,
      headers: execution.headers,
      signal: context.abortSignal,
    }

    // Add body for POST/PUT/PATCH
    if (body && ['POST', 'PUT', 'PATCH'].includes(execution.method)) {
      fetchOptions.body = body

      // Set content-type if not already set
      if (!execution.headers?.['Content-Type']) {
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Content-Type': 'application/json',
        }
      }
    }

    // Create timeout controller
    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout)

    // Combine abort signals
    const combinedSignal = context.abortSignal
      ? AbortSignal.any([context.abortSignal, timeoutController.signal])
      : timeoutController.signal

    fetchOptions.signal = combinedSignal

    const response = await fetch(url, fetchOptions)
    clearTimeout(timeoutId)

    const responseText = await response.text()
    const executionTimeMs = Date.now() - startTime

    // Try to parse as JSON for better formatting
    let output = responseText
    try {
      const json = JSON.parse(responseText)
      output = JSON.stringify(json, null, 2)
    } catch {
      // Keep as plain text
    }

    return {
      success: response.ok,
      output: `[${response.status} ${response.statusText}]\n${output}`,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      executionTimeMs,
    }
  } catch (error: any) {
    const executionTimeMs = Date.now() - startTime

    if (error.name === 'AbortError') {
      return {
        success: false,
        output: '',
        error: 'Request was aborted or timed out',
        executionTimeMs,
      }
    }

    return {
      success: false,
      output: '',
      error: `HTTP request failed: ${error.message}`,
      executionTimeMs,
    }
  }
}

/**
 * Execute a builtin tool
 */
async function executeBuiltinTool(
  execution: BuiltinExecution,
  args: Record<string, unknown>,
  context: {
    sessionId: string
    messageId: string
    workingDirectory?: string
  }
): Promise<CustomToolResult> {
  const startTime = Date.now()

  try {
    // Map args if argsMapping is provided
    let mappedArgs = args
    if (execution.argsMapping) {
      mappedArgs = {}
      for (const [builtinParam, customParam] of Object.entries(execution.argsMapping)) {
        if (customParam in args) {
          mappedArgs[builtinParam] = args[customParam]
        }
      }
    }

    // Execute the builtin tool
    const result = await executeTool(execution.toolId, mappedArgs, {
      sessionId: context.sessionId,
      messageId: context.messageId,
      workingDirectory: context.workingDirectory,
    })

    const executionTimeMs = Date.now() - startTime

    // Format output
    let output: string
    if (result.data) {
      output = typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data, null, 2)
    } else {
      output = result.error || 'No output'
    }

    return {
      success: result.success,
      output,
      error: result.error,
      executionTimeMs,
    }
  } catch (error: any) {
    const executionTimeMs = Date.now() - startTime

    return {
      success: false,
      output: '',
      error: `Builtin tool execution failed: ${error.message}`,
      executionTimeMs,
    }
  }
}

/**
 * Execute a custom tool
 *
 * Dispatches to the appropriate executor based on execution type.
 */
export async function executeCustomTool(
  tool: CustomToolDefinition,
  args: Record<string, unknown>,
  context: {
    sessionId: string
    messageId: string
    workingDirectory?: string
    abortSignal?: AbortSignal
  }
): Promise<CustomToolResult> {
  const { execution } = tool

  console.log(`[CustomTool] Executing ${tool.id} (${execution.type})`)
  console.log(`[CustomTool] Args:`, JSON.stringify(args).substring(0, 200))

  switch (execution.type) {
    case 'bash':
      return executeBashTool(execution, args, {
        workingDirectory: context.workingDirectory,
        abortSignal: context.abortSignal,
      })

    case 'http':
      return executeHttpTool(execution, args, {
        abortSignal: context.abortSignal,
      })

    case 'builtin':
      return executeBuiltinTool(execution, args, {
        sessionId: context.sessionId,
        messageId: context.messageId,
        workingDirectory: context.workingDirectory,
      })

    default:
      return {
        success: false,
        output: '',
        error: `Unknown execution type: ${(execution as any).type}`,
      }
  }
}
