import { registerTool } from '../registry.js'
import { ReadTool } from './read.js'
import { SkillViewTool } from './skill.js'
import { WebSearchTool } from './web-search/index.js'
import { WebOpenTool } from './web-search/open.js'
import { TimeTool } from '@onething/runtime/tools'

// 降级档工具集(ONETHING_SERVER_TOOLS=readonly):只保留对本机零副作用的
// 工具 —— 无 bash/write/edit,也不含可写运行时状态的 variable。
const readonlyBuiltinTools = [
  ReadTool,
  TimeTool,
  WebSearchTool,
  WebOpenTool,
]

const readonlyAsyncBuiltinTools = [
  SkillViewTool,
]

export function registerReadonlyBuiltinTools(): void {
  for (const tool of readonlyBuiltinTools) {
    registerTool(tool)
  }

  for (const tool of readonlyAsyncBuiltinTools) {
    registerTool(tool)
  }

  console.log(`[BuiltinTools] Registered ${readonlyBuiltinTools.length + readonlyAsyncBuiltinTools.length} readonly built-in tools (${readonlyAsyncBuiltinTools.length} async)`)
}
