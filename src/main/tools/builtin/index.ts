/**
 * Built-in Tools Registration
 *
 * All tools use the Tool.define() pattern:
 * 1. Create a new file using Tool.define()
 * 2. Export the tool (e.g., `export const MyTool = Tool.define(...)`)
 * 3. Import and add to the `builtinTools` array below
 */

import { registerTool } from '../registry.js'

// Import built-in tools
import { BashTool } from './bash.js'
import { EditTool } from './edit.js'
import { ReadTool } from './read.js'
import { WriteTool } from './write.js'
import { GlobTool } from './glob.js'
import { GrepTool } from './grep.js'
import { SkillTool } from './skill.js'

// Web search
import { WebSearchTool } from './web-search/index.js'

// All built-in tools (Tool.define() format)
// Note: SkillTool is async and needs separate initialization
const builtinTools = [
  BashTool,
  EditTool,
  ReadTool,
  WriteTool,
  GlobTool,
  GrepTool,
  // Web tools
  WebSearchTool,
]

// Async tools that need initialization with context
export const asyncBuiltinTools = [
  SkillTool,
]

/**
 * Register all built-in tools with the registry
 */
export function registerBuiltinTools(): void {
  // Register static tools
  for (const tool of builtinTools) {
    registerTool(tool)
  }

  // Register async tools (e.g., SkillTool)
  for (const tool of asyncBuiltinTools) {
    registerTool(tool)
  }

  console.log(`[BuiltinTools] Registered ${builtinTools.length + asyncBuiltinTools.length} built-in tools (${asyncBuiltinTools.length} async)`)
}
