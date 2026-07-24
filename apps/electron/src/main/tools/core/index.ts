/**
 * Tool Core Module Exports
 */

export { Tool, zodToJsonSchema } from './tool.js'
export type { ToolMetadata, ToolContext, ToolResult, ToolInfo, ToolConfig } from './tool.js'

export {
  replace,
  normalizeLineEndings,
  trimDiff,
  REPLACERS,
  SimpleReplacer,
  LineTrimmedReplacer,
  BlockAnchorReplacer,
  WhitespaceNormalizedReplacer,
  IndentationFlexibleReplacer,
  EscapeNormalizedReplacer,
  TrimmedBoundaryReplacer,
  ContextAwareReplacer,
  MultiOccurrenceReplacer,
} from './replacers.js'
export type { Replacer } from './replacers.js'
