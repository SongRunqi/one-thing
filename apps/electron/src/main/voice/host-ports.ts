/**
 * Host injection points for pushing voice/music payloads to renderer surfaces.
 * The Electron host wires these to BrowserWindow broadcasts and the voice
 * runtime window; headless hosts leave them unset (no-op).
 *
 * Late-bound: consulted per call, so wiring at host startup takes effect even
 * for modules that captured the helpers at import time.
 */

export interface VoiceHostMessage {
  channel: string
  payload: unknown
  /** Skip the renderer that originated the message (echo suppression). */
  exceptWebContentsId?: number
}

export interface VoiceHostPorts {
  broadcastMessage?: (message: VoiceHostMessage) => void
}

let hostPorts: VoiceHostPorts = {}

export function configureVoiceHost(ports: VoiceHostPorts): void {
  hostPorts = ports
}

export function getVoiceHostPorts(): VoiceHostPorts {
  return hostPorts
}

/** Broadcast to every renderer surface; no-op until the host wires a port. */
export function broadcastVoiceHostMessage(message: VoiceHostMessage): void {
  hostPorts.broadcastMessage?.(message)
}
