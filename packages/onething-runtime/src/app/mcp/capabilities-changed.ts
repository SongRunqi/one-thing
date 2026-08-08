/**
 * Capabilities-changed fan-out (P2-1).
 *
 * When a server pushes `notifications/{tools,prompts,resources}/list_changed`
 * (legacy unsolicited delivery, or routed through an auto-opened
 * `subscriptions/listen` on a 2026-07-28 connection), the client runtime
 * re-reads the capability lists and updates its own state. The MODEL-facing
 * side — the tools catalog + router definitions — must regenerate too, but
 * the client cannot reach the bridge without closing an import cycle
 * (bridge ← manager ← client). Late-bound port, like the other configure*
 * seams: host IPC assemblies wire it to their `registerTools` path at boot.
 */

let handler: ((serverId: string) => void) | null = null

export function configureMCPCapabilitiesChangedHandler(h: ((serverId: string) => void) | null): void {
  handler = h
}

export function notifyMCPCapabilitiesChanged(serverId: string): void {
  handler?.(serverId)
}

/** Test hook. */
export function resetMCPCapabilitiesChangedHandlerForTests(): void {
  handler = null
}
