import crypto from 'crypto'

const VALID_TOOL_NAME_RE = /^[a-zA-Z0-9_-]+$/
const aliasToOriginal = new Map<string, string>()
const originalToAlias = new Map<string, string>()

function shortHash(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 8)
}

export function createAIToolName(originalName: string, usedNames: Set<string>): string {
  let candidate = originalName.replace(/[^a-zA-Z0-9_-]/g, '-')
  candidate = candidate.replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!candidate) candidate = 'tool'

  if (!VALID_TOOL_NAME_RE.test(candidate)) {
    candidate = `tool-${shortHash(originalName)}`
  }

  if (usedNames.has(candidate) && aliasToOriginal.get(candidate) !== originalName) {
    candidate = `${candidate}-${shortHash(originalName)}`
  }

  usedNames.add(candidate)
  aliasToOriginal.set(candidate, originalName)
  originalToAlias.set(originalName, candidate)
  return candidate
}

export function resolveAIToolName(toolName: string): string {
  return aliasToOriginal.get(toolName) || toolName
}

export function getAIToolName(originalName: string): string {
  const existing = originalToAlias.get(originalName)
  if (existing) return existing
  if (VALID_TOOL_NAME_RE.test(originalName)) return originalName
  return createAIToolName(originalName, new Set(aliasToOriginal.keys()))
}
