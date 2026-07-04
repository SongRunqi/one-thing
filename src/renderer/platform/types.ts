import type { SessionEventEnvelope } from '@shared/events'
import type { ElectronAPI } from '@/types'

export type PlatformEnvironment = 'electron' | 'web'

export interface PlatformCapabilities {
  localFileSystem: boolean
  workspaceFileSystem: boolean
  nativeWindowControls: boolean
  shellTools: boolean
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
