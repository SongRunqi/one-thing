import type { SessionEventEnvelope } from '@shared/events'
import type { ElectronAPI } from '@/types'

export type PlatformEnvironment = 'electron' | 'web'

export interface PlatformCapabilities {
  localFileSystem: boolean
  workspaceFileSystem: boolean
  nativeWindowControls: boolean
  shellTools: boolean
  /** Real PTY terminal available on this host. */
  terminal: boolean
  /** Embedded WebContentsView browser available (Electron only; web falls back to iframe). */
  embeddedBrowser: boolean
  /** Multi-agent collab rooms (需要主进程 RoomCoordinator;desktop only in P0). */
  collabRooms: boolean
  clipboardWrite: boolean
  desktopWindows: boolean
  globalMenuEvents: boolean
}

export type PlatformApi = ElectronAPI & {
  readonly environment: PlatformEnvironment
  readonly capabilities: PlatformCapabilities
  getCapabilities: () => Promise<PlatformCapabilities>
  onSessionEvent: (callback: (envelope: SessionEventEnvelope) => void) => () => void
}
