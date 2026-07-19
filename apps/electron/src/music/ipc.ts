import { ipcMain } from 'electron'
import type { ElectronIpcMainLike } from '../voice/ipc'

export interface ElectronMusicIpcChannels {
  getState: string
  setup: string
  command: string
  getNowPlaying: string
  getRadio: string
  getLyrics: string
}

export interface RegisterElectronMusicIpcHandlersOptions {
  channels: ElectronMusicIpcChannels
  getState(): unknown
  setup(request: unknown): unknown
  /** Transport controls for the composer's music bar. */
  command(request: unknown): unknown
  /** Current now-playing snapshot, for renderers that subscribe mid-song. */
  getNowPlaying(): unknown
  /** Radio brief snapshot: is the station on, and is it healthy. */
  getRadio(): unknown
  /** Current song's timed lyrics, for renderers that arrive mid-song. */
  getLyrics(): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronMusicIpcHandlers(
  options: RegisterElectronMusicIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getState, () => options.getState())
  host.handle(options.channels.setup, (_event, request: unknown) => options.setup(request))
  host.handle(options.channels.command, (_event, request: unknown) => options.command(request))
  host.handle(options.channels.getNowPlaying, () => options.getNowPlaying())
  host.handle(options.channels.getRadio, () => options.getRadio())
  host.handle(options.channels.getLyrics, () => options.getLyrics())
}
