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
import { GrepTool } from './grep.js'
import { VariableTool } from './variable.js'
import { GoalTool } from './goal.js'
import { BoardTool } from '../../collab/board-tool.js'
import { HistoryTool } from '../../collab/history-tool.js'
import { NotebookTool } from '../../collab/actors/notebook-tool.js'
import { SayTool, registerCollabSendMessageLegacyAlias } from '../../collab/say-tool.js'
import { RadioTool } from './radio.js'
import { PracticeTool } from './practice.js'
import { TaskTool } from './task.js'
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
  // 找文件名归 Find,找文件内容归 Grep。Glob 有意不注册:它与 Find 是同一件事
  // (都按 glob 找路径),2026-07 的工具裁减正是为此把它摘掉的。
  GrepTool,
  VariableTool,
  GoalTool,
  BoardTool,
  HistoryTool,
  // Collab v3 D2:跨房私人笔记。场子门(agent/work)在 collab/tool-surface.ts,
  // 所以普通对话看不到它 —— 注册是全局的,可见性不是。
  NotebookTool,
  SayTool,
  RadioTool,
  PracticeTool,
  // 派工(自举差距审计 P0-3)。只在桌面全量档:它开真会话、真花 token、
  // 真在本机跑工具 —— headless 与 readonly 两档都不该有。
  TaskTool,
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
  registerCollabSendMessageLegacyAlias()

  console.log(`[BuiltinTools] Registered ${builtinTools.length} built-in tools`)
}
