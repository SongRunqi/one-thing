import { registerTool } from '../registry.js'
import { BashTool } from './bash.js'
import { EditTool } from './edit.js'
import { ReadTool } from './read.js'
import { WriteTool } from './write.js'
import { VariableTool } from './variable.js'
import { BoardTool } from '../../collab/board-tool.js'
// W14b: a room turn's whole surface is say + board. The CLI daemon runs real
// rooms (that is where the 自测 闭环 lives), and without `say` an activated
// member physically cannot speak — the stream is thinking only.
import { HistoryTool } from '../../collab/history-tool.js'
import { SayTool, registerCollabSendMessageLegacyAlias } from '../../collab/say-tool.js'
import { WebSearchTool } from './web-search/index.js'
import { WebOpenTool } from './web-search/open.js'
import { TimeTool } from '@onething/runtime/tools'

const headlessBuiltinTools = [
  BashTool,
  EditTool,
  ReadTool,
  WriteTool,
  VariableTool,
  BoardTool,
  HistoryTool,
  SayTool,
  TimeTool,
  WebSearchTool,
  WebOpenTool,
]

export function registerHeadlessBuiltinTools(): void {
  for (const tool of headlessBuiltinTools) {
    registerTool(tool)
  }
  registerCollabSendMessageLegacyAlias()

  console.log(`[BuiltinTools] Registered ${headlessBuiltinTools.length} headless built-in tools`)
}
