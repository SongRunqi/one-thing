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
import { SayTool } from '../../collab/say-tool.js'
// agent-im-dm.md D5:群房工具面里 say/board/dm 是同一档。CLI daemon 跑真房间,
// 少了 dm,注入面上写着的工具在这台机器上就调不出来。
import { DmTool } from '../../collab/dm-tool.js'
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
  SayTool,
  DmTool,
  TimeTool,
  WebSearchTool,
  WebOpenTool,
]

export function registerHeadlessBuiltinTools(): void {
  for (const tool of headlessBuiltinTools) {
    registerTool(tool)
  }

  console.log(`[BuiltinTools] Registered ${headlessBuiltinTools.length} headless built-in tools`)
}
