/**
 * Global Event Types (Stub — Phase 2+)
 *
 * Events not scoped to any session. Phase 1 defines only
 * `app:initialized` as a proof-of-concept.
 */

export interface AppInitializedEvent {
  type: 'app:initialized'
  timestamp: number
}

export type GlobalEvent =
  | AppInitializedEvent
