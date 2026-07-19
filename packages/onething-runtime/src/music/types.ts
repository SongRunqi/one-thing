/**
 * Music setup types.
 *
 * Host-free: nothing here imports Electron or node child_process. The driver
 * receives its process spawning capability through injection so the same code
 * can run under a headless host or a test double.
 */

/** The radio source the model reaches for by default. */
export type OnethingMusicRadioSource = 'fm' | 'daily'

/**
 * Which player ncm-cli drives.
 *
 * - `mpv`: ncm-cli plays the audio itself (legacy in-process sessions). `state`
 *   answers, so the model can see position and know when a song ends.
 * - `orpheus`: hands tracks to the local 网易云音乐 App, which owns playback and
 *   advances its own queue. `state` is rejected ("云音乐模式下不支持 state 命令"),
 *   so there is no progress to read — macOS only.
 */
export type OnethingMusicPlayerBackend = 'mpv' | 'orpheus'

export type OnethingMusicSetupStage = 'env' | 'credentials' | 'login' | 'ready'

export interface OnethingMusicToolStatus {
  installed: boolean
  version?: string
}

export interface OnethingMusicEnvStatus {
  /** Keyed by the provider descriptor's tool ids (ncm: 'ncm-cli', 'mpv'). */
  tools: Record<string, OnethingMusicToolStatus>
  npmAvailable: boolean
  brewAvailable: boolean
}

/**
 * Setup state — no playback.
 *
 * Playback used to live here (player state, programme queue, radioActive) back
 * when the app conducted the radio itself. The model drives ncm-cli through
 * bash now, so the current song is whatever `ncm-cli queue` says; mirroring it
 * here would only be a second, staler copy of a truth we do not own.
 */
export interface OnethingMusicRuntimeState {
  setupStage: OnethingMusicSetupStage
  env?: OnethingMusicEnvStatus
  configured: boolean
  loggedIn: boolean
  /** Which player ncm-cli is configured to drive. */
  playerBackend: OnethingMusicPlayerBackend
  source: OnethingMusicRadioSource
  lastError?: string
}

export type OnethingMusicEvent =
  | { type: 'state'; state: OnethingMusicRuntimeState }
  | { type: 'login-output'; chunk: string }
  | { type: 'install-output'; tool: string; chunk: string }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string }

// ============================================================================
// Process abstraction (injected by the host)
// ============================================================================

export interface OnethingMusicProcessResult {
  code: number | null
  stdout: string
  stderr: string
}

export interface OnethingMusicProcessRunOptions {
  command: string
  args: string[]
  /** Written to the child's stdin, then closed. Used to keep secrets off argv. */
  stdin?: string
  timeoutMs?: number
  env?: Record<string, string | undefined>
}

export interface OnethingMusicProcessStreamOptions extends OnethingMusicProcessRunOptions {
  onStdout?(chunk: string): void
  onStderr?(chunk: string): void
}

export interface OnethingMusicProcessHandle {
  /** Resolves when the child exits. */
  done: Promise<OnethingMusicProcessResult>
  kill(): void
}

export interface OnethingMusicProcessRunner {
  run(options: OnethingMusicProcessRunOptions): Promise<OnethingMusicProcessResult>
  spawn(options: OnethingMusicProcessStreamOptions): OnethingMusicProcessHandle
}

// ============================================================================
// Backend contract
// ============================================================================

/**
 * The music setup backend — what the settings wizard needs, and nothing else.
 *
 * Playback (search/play/queue/state/volume…) deliberately has no place here:
 * the model runs those ncm-cli commands itself through bash, so a typed
 * wrapper would only be a second, always-behind copy of a CLI whose command
 * tree is server-driven and grows without us.
 */
export interface OnethingMusicBackend {
  checkEnv(): Promise<OnethingMusicEnvStatus>
  /** `tool` is a descriptor tool id; unknown ids reject. */
  installTool(tool: string, onOutput?: (chunk: string) => void): Promise<void>
  setCredentials(appId: string, privateKey: string): Promise<void>
  isConfigured(): Promise<boolean>
  getPlayer(): Promise<OnethingMusicPlayerBackend>
  setPlayer(player: OnethingMusicPlayerBackend): Promise<void>

  /** Starts an interactive login, streaming the QR payload out. */
  startLogin(onOutput: (chunk: string) => void): Promise<void>
  cancelLogin(): void
  checkLogin(): Promise<boolean>
  logout(): Promise<void>
}

/**
 * Thrown when ncm-cli reports the daily open-platform quota is exhausted.
 *
 * Not counted anywhere any more: the model spends the quota by running ncm-cli
 * through bash, so the app cannot see those calls. Tracking a number we no
 * longer observe would just be a stale one on screen. The skill tells the model
 * to relay "请求总量超限" to the user verbatim when it hits it.
 */
export class OnethingMusicQuotaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OnethingMusicQuotaError'
  }
}

