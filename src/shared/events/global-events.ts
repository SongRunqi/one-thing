/**
 * Global Event Types
 *
 * Events not scoped to any session.
 */

export interface AppInitializedEvent {
  type: 'app:initialized'
  timestamp: number
}

export interface AppQuittingEvent {
  type: 'app:quitting'
  timestamp: number
}

export type GlobalEvent =
  | AppInitializedEvent
  | AppQuittingEvent
