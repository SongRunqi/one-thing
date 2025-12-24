/**
 * Built-in Tools Registration
 *
 * This file exports all built-in tools and provides a function to register them.
 * To add a new built-in tool:
 * 1. Create a new file in this directory (e.g., my-tool.ts)
 * 2. Export `definition` and `handler` from that file
 * 3. Import and add them to the `builtinTools` array below
 */

import { registerTool } from '../registry.js'

// Import built-in tools
import * as getCurrentTime from './get-current-time.js'
import * as calculator from './calculator.js'
import * as bash from './bash.js'

// List of all built-in tools
// Note: delegate tool removed - Tool Agent now handles all tool execution internally
const builtinTools = [
  getCurrentTime,
  calculator,
  bash,
]

/**
 * Register all built-in tools with the registry
 */
export function registerBuiltinTools(): void {
  for (const tool of builtinTools) {
    registerTool(tool.definition, tool.handler)
  }

  console.log(`[BuiltinTools] Registered ${builtinTools.length} built-in tools`)
}
