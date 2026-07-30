/**
 * Built-in Tools Registration
 *
 * All tools use the Tool.define() pattern.
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
import { FindTool } from './find.js'
import { VariableTool } from './variable.js'
import { GoalTool } from './goal.js'
import { BoardTool } from '../../collab/board-tool.js'
import { SayTool } from '../../collab/say-tool.js'
import { DmTool } from '../../collab/dm-tool.js'
import { RadioTool } from './radio.js'
import { PracticeTool } from './practice.js'
import { BashOutputTool, FartTool, KillBashTool, TimeTool } from '@onething/runtime/tools'

// Web search
import { WebSearchTool } from './web-search/index.js'
import { WebOpenTool } from './web-search/open.js'

// All built-in tools (Tool.define() format)
// Note: some tools are async and need separate initialization
const builtinTools = [
  BashTool,
  BashOutputTool,
  KillBashTool,
  EditTool,
  ReadTool,
  WriteTool,
  FindTool,
  VariableTool,
  GoalTool,
  BoardTool,
  SayTool,
  DmTool,
  RadioTool,
  PracticeTool,
  TimeTool,
  FartTool,
  // Web tools
  WebSearchTool,
  WebOpenTool,
]

/**
 * Register all built-in tools with the registry
 */
export function registerBuiltinTools(): void {
  for (const tool of builtinTools) {
    registerTool(tool)
  }

  console.log(`[BuiltinTools] Registered ${builtinTools.length} built-in tools`)
}
