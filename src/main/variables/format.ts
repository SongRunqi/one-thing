/**
 * Pure formatting helpers — turn a ContextVariable[] snapshot into the
 * human-readable text injected into the system prompt and surfaced in
 * tool output. No side effects, no I/O.
 */

import * as os from 'os'
import type { ContextVariable } from './types.js'

export interface FormatOptions {
  /** Replace the leading home directory with `~` in any path-like values. */
  collapseHome?: boolean
  /** Optional cap on rendered length per value, with ellipsis. */
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

/**
 * Render a snapshot for inclusion in the system prompt.
 *
 *   - workdir: /Users/me/proj  (Current working directory.)
 *   - my_var: hello world
 *
 * Variables with empty values are omitted. Multiline values are folded
 * to the first line + an indicator of the remaining line count, since
 * the prompt section is meant to be skimmed.
 */
export function formatVariablesForPrompt(
  variables: ContextVariable[],
  options: FormatOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const home = opts.collapseHome ? os.homedir() : ''
  const lines: string[] = []

  for (const v of variables) {
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
