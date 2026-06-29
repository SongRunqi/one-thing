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

export function formatVariablesForPrompt(
  variables: ContextVariable[],
  options: FormatOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const home = opts.collapseHome ? os.homedir() : ''
  const lines: string[] = []

  for (const v of variables) {
    if (v.name === 'workdir' && v.values && v.values.length > 0) {
      const [current, ...roots] = v.values
      const currentDisplay = truncate(home ? collapse(current, home) : current, opts.maxValueLength)
      if (v.value) {
        lines.push(`- workdir: ${currentDisplay} (current cwd; values[0])`)
      } else {
        lines.push('- workdir: (unset current cwd)')
        roots.unshift(current)
      }
      for (const root of roots) {
        const rootDisplay = truncate(home ? collapse(root, home) : root, opts.maxValueLength)
        lines.push(`  - extra root: ${rootDisplay}`)
      }
      continue
    }

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
