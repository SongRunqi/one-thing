/**
 * Built-in Tools Registration
 *
 * All tools use the V2 format (Tool.define() pattern):
 * 1. Create a new file using Tool.define()
 * 2. Export the tool (e.g., `export const MyTool = Tool.define(...)`)
 * 3. Import and add to the `builtinTools` array below
 */

import { registerToolV2 } from '../registry.js'

// Import built-in tools (V2 format)
import { BashTool } from './bash-v2.js'
import { EditTool } from './edit.js'
import { ReadTool } from './read.js'
import { WriteTool } from './write.js'
import { GlobTool } from './glob.js'
import { GrepTool } from './grep.js'
import { SkillTool } from './skill.js'
import { PlanTool } from './plan.js'
import { CustomAgentTool } from './custom-agent.js'
import { MemoryTool } from './memory.js'

// Automation tools
import { MouseTool } from './mouse.js'
import { KeyboardTool } from './keyboard.js'
import { ScreenshotTool } from './screenshot.js'

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
  PlanTool,
  MemoryTool,
  // Automation tools
  MouseTool,
  KeyboardTool,
  ScreenshotTool,
  // Web tools
  WebSearchTool,
]

// Async tools that need initialization with context
export const asyncBuiltinTools = [
  SkillTool,
  CustomAgentTool,
]

/**
 * Register all built-in tools with the registry
 * @deprecated Use registerBuiltinToolsV2 instead
 */
export function registerBuiltinTools(): void {
  // No-op - legacy tools removed
  console.log('[BuiltinTools] Legacy registration skipped (all tools migrated to V2)')
}

/**
 * Register all V2 built-in tools with the registry
 */
export function registerBuiltinToolsV2(): void {
  // Register static tools
  for (const tool of builtinTools) {
    registerToolV2(tool)
  }

  // Register async tools (e.g., SkillTool)
  for (const tool of asyncBuiltinTools) {
    registerToolV2(tool)
  }

  console.log(`[BuiltinTools] Registered ${builtinTools.length + asyncBuiltinTools.length} built-in tools (${asyncBuiltinTools.length} async)`)
}
