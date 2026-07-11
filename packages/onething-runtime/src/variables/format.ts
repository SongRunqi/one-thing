import * as os from 'node:os'
import type { ContextVariable } from './types.js'

export interface FormatOptions {
  collapseHome?: boolean
  maxValueLength?: number
}

const DEFAULT_OPTIONS: Required<FormatOptions> = {
  collapseHome: true,
  maxValueLength: 512,
}

function collapse(value: string, home: string): string {
  if (!home || !value.startsWith(home)) return value
  return '~' + value.slice(home.length)
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max) + '…'
}

function renderLines(
  variables: ContextVariable[],
  opts: Required<FormatOptions>,
): string {
  const home = opts.collapseHome ? os.homedir() : ''
  const lines: string[] = []

  for (const v of variables) {
    // workdir is rendered by the prompt builder's dedicated "# Work Directory"
    // section; skip it here so the same directories are never injected twice.
    if (v.name === 'workdir') continue

    if (!v.value) continue

    const firstLine = v.value.split('\n')[0]
    const restLines = v.value.split('\n').length - 1
    const displayValue = restLines > 0
      ? `${firstLine} (+${restLines} more line${restLines === 1 ? '' : 's'})`
      : firstLine

    const collapsed = home ? collapse(displayValue, home) : displayValue
    const trimmed = truncate(collapsed, opts.maxValueLength)
    const note = v.description ? ` (${v.description})` : ''
    lines.push(`- ${v.name}: ${trimmed}${note}`)
  }

  return lines.join('\n')
}

/**
 * Prompt text for the static channel only (the system-prompt
 * "# Context Variables" section). Variables without an explicit volatility
 * default to 'static'.
 */
export function formatVariablesForPrompt(
  variables: ContextVariable[],
  options: FormatOptions = {},
): string {
  return splitVariablesForPrompt(variables, options).systemText
}

export interface VariablePromptSections {
  /** static channel → system-prompt section; changes bust the cache prefix */
  systemText: string
  /** turn channel → <context-update> injection after the latest user message */
  turnText: string
}

/**
 * Split variables into the two prompt channels by volatility.
 * 'on-demand' variables go to neither channel — they only appear in
 * `variable` tool output and the Context inspector.
 */
export function splitVariablesForPrompt(
  variables: ContextVariable[],
  options: FormatOptions = {},
): VariablePromptSections {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const statics = variables.filter(v => (v.volatility ?? 'static') === 'static')
  const turns = variables.filter(v => v.volatility === 'turn')
  return {
    systemText: renderLines(statics, opts),
    turnText: renderLines(turns, opts),
  }
}
