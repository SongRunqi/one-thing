import { registerTool } from '../registry.js'
import { BashTool } from './bash.js'
import { EditTool } from './edit.js'
import { ReadTool } from './read.js'
import { WriteTool } from './write.js'
import { LsTool } from './ls.js'
import { SkillManageTool, SkillsListTool, SkillViewTool } from './skill.js'
import { VariableTool } from './variable.js'
import { CalculatorTool } from './calculator.js'
import { ProjectDirsTool } from '../../project-dirs/index.js'
import { WebSearchTool } from './web-search/index.js'
import { WebOpenTool } from './web-search/open.js'
import { WebFindTool } from './web-search/find.js'
import { TimeTool } from '@onething/runtime/tools'

const headlessBuiltinTools = [
  BashTool,
  EditTool,
  ReadTool,
  WriteTool,
  LsTool,
  VariableTool,
  TimeTool,
  CalculatorTool,
  ProjectDirsTool,
  WebSearchTool,
  WebOpenTool,
  WebFindTool,
]

const headlessAsyncBuiltinTools = [
  SkillsListTool,
  SkillViewTool,
  SkillManageTool,
]

export function registerHeadlessBuiltinTools(): void {
  for (const tool of headlessBuiltinTools) {
    registerTool(tool)
  }

  for (const tool of headlessAsyncBuiltinTools) {
    registerTool(tool)
  }

  console.log(`[BuiltinTools] Registered ${headlessBuiltinTools.length + headlessAsyncBuiltinTools.length} headless built-in tools (${headlessAsyncBuiltinTools.length} async)`)
}
