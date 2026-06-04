export interface ToolFailureParameterSummary {
  summary: string
  parameters: Record<string, unknown>
}

export function summarizeToolFailureParameters(
  toolName: string | undefined,
  args: Record<string, unknown> | undefined,
): ToolFailureParameterSummary | null {
  if (!args || Object.keys(args).length === 0) return null

  const normalizedToolName = (toolName || '').toLowerCase()
  if (normalizedToolName === 'edit') {
    const path = typeof args.path === 'string' ? args.path : undefined
    const edits = Array.isArray(args.edits) ? args.edits : []
    return {
      summary: [
        path ? `path: ${shortPath(path)}` : '',
        `edits: ${edits.length}`,
      ].filter(Boolean).join(' · '),
      parameters: {
        ...(path ? { path } : {}),
        edits,
      },
    }
  }

  if (normalizedToolName === 'bash') {
    const command = typeof args.command === 'string' ? args.command : undefined
    return command
      ? { summary: `command: ${command}`, parameters: { command } }
      : { summary: 'parameters', parameters: args }
  }

  const preferredKeys = ['path', 'pattern', 'command', 'name', 'action']
  const parts = preferredKeys
    .filter(key => args[key] !== undefined)
    .map(key => `${key}: ${String(args[key])}`)

  return {
    summary: parts.length > 0 ? parts.join(' · ') : 'parameters',
    parameters: args,
  }
}

function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || normalized || path
}
