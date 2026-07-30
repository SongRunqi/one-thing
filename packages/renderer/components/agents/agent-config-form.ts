/**
 * Agent editor form logic — tool allowlist + model binding.
 *
 * Kept out of the .vue so the "follow global ↔ allowlist" transitions and the
 * null semantics are unit-testable without mounting the panel. Both fields are
 * already live end-to-end in the engine (`getAgentToolAllowlist` in
 * app/engine/stream/agent-loop-runtime.ts, the coordinator's per-drive model
 * stamp); this module only decides what the editor sends over the existing
 * agents update channel.
 */

/** `null` = follow the global tool set. An array = an explicit allowlist. */
export type ToolAllowlistState = string[] | null

export interface AgentModelSelection {
	providerId?: string
	modelId?: string
	/** Preserved as-is: the editor never surfaces it, but must not drop it. */
	thinking?: string
}

export interface AgentModelBindingPayload {
	providerId: string
	modelId?: string
	thinking?: string
}

export function isFollowGlobal(state: ToolAllowlistState): boolean {
	return state === null
}

/**
 * Entering allowlist mode starts EMPTY rather than pre-checking everything:
 * a pre-filled list reads as "already curated" and the user would save a
 * frozen snapshot of today's tool set without meaning to.
 */
export function enterAllowlistMode(state: ToolAllowlistState): string[] {
	return state === null ? [] : [...state]
}

export function leaveAllowlistMode(): ToolAllowlistState {
	return null
}

export function isToolSelected(state: ToolAllowlistState, toolId: string): boolean {
	return state !== null && state.includes(toolId)
}

export function toggleTool(state: ToolAllowlistState, toolId: string): string[] {
	const current = state ?? []
	return current.includes(toolId)
		? current.filter(id => id !== toolId)
		: [...current, toolId]
}

/**
 * An empty allowlist means "no tools at all" — almost always a mis-click, and
 * the agent store normalizes `[]` back to "follow global" anyway, so saving it
 * would silently contradict what the form showed. Block instead: pick a tool,
 * or switch the mode back.
 */
export function validateToolAllowlist(state: ToolAllowlistState): string {
	if (state !== null && state.length === 0) {
		return 'Pick at least one tool, or switch back to following the global set.'
	}
	return ''
}

/** Array replaces the allowlist; `null` clears it (agent sees all tools). */
export function toolAllowlistPayload(state: ToolAllowlistState): string[] | null {
	if (state === null) return null
	const seen = new Set<string>()
	const out: string[] = []
	for (const raw of state) {
		const id = typeof raw === 'string' ? raw.trim() : ''
		if (!id || seen.has(id)) continue
		seen.add(id)
		out.push(id)
	}
	return out.length > 0 ? out : null
}

/** Stored agent → form state. An absent/empty list is "follow global". */
export function readToolAllowlist(tools: string[] | null | undefined): ToolAllowlistState {
	return Array.isArray(tools) && tools.length > 0 ? [...tools] : null
}

/* ---- boundaries: approvals + turn budget ---- */

/**
 * Only the two boundaries worth a control. `toolGrants`, workspace roots and
 * context policy stay in agents.json: settings UI exposes decisions, not
 * every knob (they would read as required configuration when they are not).
 */
export interface AgentPermissionModeChoice {
  value: string
  label: string
  hint: string
}

/** '' = inherit (the agent stays out of the composition entirely). */
export const AGENT_PERMISSION_MODE_CHOICES: readonly AgentPermissionModeChoice[] = [
  { value: '', label: 'inherit', hint: 'follow the session / global setting' },
  { value: 'normal', label: 'ask every time', hint: 'never silently runs a guarded tool' },
  { value: 'auto-accept-edits', label: 'auto-accept edits', hint: 'file writes go through; the rest still asks' },
  { value: 'dangerously-allow-all', label: 'allow everything', hint: 'no approvals at all' },
]

export interface AgentTurnBudgetChoice {
  value: string
  label: string
  turns: number | null
}

export const AGENT_TURN_BUDGET_CHOICES: readonly AgentTurnBudgetChoice[] = [
  { value: 'inherit', label: 'inherit', turns: null },
  { value: 'standard', label: 'standard (100)', turns: 100 },
  { value: 'long', label: 'long task (300)', turns: 300 },
]

/**
 * The choices a given agent may show. A value hand-written into agents.json
 * that matches no tier gets its own entry — the alternative is a form that
 * silently rounds someone's 42 to 100 the first time they press save.
 */
export function turnBudgetChoices(maxTurns?: number | null): AgentTurnBudgetChoice[] {
  const choices = [...AGENT_TURN_BUDGET_CHOICES]
  if (typeof maxTurns === 'number' && maxTurns > 0 && !choices.some(choice => choice.turns === maxTurns)) {
    choices.push({ value: `custom:${maxTurns}`, label: `custom (${maxTurns})`, turns: maxTurns })
  }
  return choices
}

/** Stored agent → form state. */
export function readTurnBudget(maxTurns?: number | null): string {
  if (typeof maxTurns !== 'number' || maxTurns <= 0) return 'inherit'
  return turnBudgetChoices(maxTurns).find(choice => choice.turns === maxTurns)?.value ?? 'inherit'
}

/** Form state → payload. `null` clears the override (back to inherit). */
export function turnBudgetPayload(value: string, maxTurns?: number | null): number | null {
  return turnBudgetChoices(maxTurns).find(choice => choice.value === value)?.turns ?? null
}

/** Form state → payload. `null` clears the override (back to inherit). */
export function permissionModePayload(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return AGENT_PERMISSION_MODE_CHOICES.some(choice => choice.value === trimmed) ? trimmed : null
}

/**
 * No provider means no binding. A provider without a model is still a valid
 * pin (the coordinator stamps providerId alone and lets that provider's
 * default model apply), so it is preserved rather than dropped.
 */
export function modelBindingPayload(
	selection: AgentModelSelection | null,
): AgentModelBindingPayload | null {
	const providerId = selection?.providerId?.trim() || ''
	if (!providerId) return null
	const modelId = selection?.modelId?.trim() || ''
	const thinking = selection?.thinking?.trim() || ''
	return {
		providerId,
		...(modelId ? { modelId } : {}),
		...(thinking ? { thinking } : {}),
	}
}
