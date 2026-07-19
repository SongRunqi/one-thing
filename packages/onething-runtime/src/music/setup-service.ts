/**
 * Music setup: environment probing, credentials, login, player choice.
 *
 * Setup only — deliberately no playback. Playback is the model's job now: it
 * drives `ncm-cli` through bash, guided by the `netease-music-cli` skill. This
 * used to be a "radio conductor" that owned a programme queue, polled `state`
 * to detect the end of a song, and skipped dead tracks. All of it is gone,
 * because wrapping ncm-cli turned out to cost far more than it bought — every
 * bug we shipped lived in the gap between the wrapper and the real CLI, while
 * the wrapper exposed 4 of the CLI's 71 commands.
 *
 * What cannot move to the model is exactly what is left here: setup needs the
 * privateKey, and a privateKey must never pass through a chat message (it would
 * be written into the session history forever) nor through argv (where `ps`
 * shows it to every process on the machine). So credentials stay behind the
 * settings UI, and this service is what that UI talks to.
 */

import type { MusicProviderToolSpec } from './providers/types.js'
import type {
  OnethingMusicBackend,
  OnethingMusicEnvStatus,
  OnethingMusicEvent,
  OnethingMusicPlayerBackend,
  OnethingMusicRadioSource,
  OnethingMusicRuntimeState,
  OnethingMusicSetupStage,
} from './types.js'

export interface MusicSetupServiceOptions {
  backend: OnethingMusicBackend
  emit(event: OnethingMusicEvent): void
  getSource(): OnethingMusicRadioSource
  /**
   * The active provider's tool prerequisites (descriptor.tools). Absent =
   * the founding ncm pair, so existing hosts/tests keep today's gates.
   */
  tools?: MusicProviderToolSpec[]
  now?(): number
  logger?: { warn(message: string, ...args: unknown[]): void }
}

const DEFAULT_TOOLS: MusicProviderToolSpec[] = [
  { id: 'ncm-cli', label: 'ncm-cli', install: { npm: ['install', '-g', '@music163/ncm-cli'] } },
  { id: 'mpv', label: 'mpv', install: { brew: ['install', 'mpv'] }, requiredWhenPlayerBackend: 'mpv' },
]

function createInitialState(source: OnethingMusicRadioSource): OnethingMusicRuntimeState {
  return {
    setupStage: 'env',
    configured: false,
    loggedIn: false,
    playerBackend: 'mpv',
    source,
  }
}

export class MusicSetupService {
  private state: OnethingMusicRuntimeState

  constructor(private readonly options: MusicSetupServiceOptions) {
    this.state = createInitialState(options.getSource())
  }

  getState(): OnethingMusicRuntimeState {
    return this.state
  }

  private patch(patch: Partial<OnethingMusicRuntimeState>): void {
    this.state = { ...this.state, ...patch }
    this.options.emit({ type: 'state', state: this.state })
  }

  private requiredTools(player: OnethingMusicPlayerBackend): MusicProviderToolSpec[] {
    // A tool can be conditional on the chosen player backend (ncm: mpv is
    // irrelevant under orpheus — demanding it would strand a working setup
    // on the "install" step).
    return (this.options.tools ?? DEFAULT_TOOLS).filter(
      tool => !tool.requiredWhenPlayerBackend || tool.requiredWhenPlayerBackend === player,
    )
  }

  private resolveSetupStage(
    env: OnethingMusicRuntimeState['env'],
    configured: boolean,
    loggedIn: boolean,
    player: OnethingMusicPlayerBackend,
  ): OnethingMusicSetupStage {
    if (this.requiredTools(player).some(tool => !env?.tools[tool.id]?.installed)) return 'env'
    if (!configured) return 'credentials'
    if (!loggedIn) return 'login'
    return 'ready'
  }

  private refreshSetupStage(): void {
    this.patch({
      setupStage: this.resolveSetupStage(
        this.state.env,
        this.state.configured,
        this.state.loggedIn,
        this.state.playerBackend,
      ),
    })
  }

  private handleError(error: unknown, fallback: string): Error {
    const message = error instanceof Error && error.message ? error.message : fallback
    this.patch({ lastError: message })
    return new Error(message)
  }

  async refreshEnv(): Promise<OnethingMusicEnvStatus | undefined> {
    const env = await this.options.backend.checkEnv()

    // With the CLI itself missing there is nothing to probe further.
    const cliTool = (this.options.tools ?? DEFAULT_TOOLS)[0]
    if (cliTool && !env.tools[cliTool.id]?.installed) {
      this.patch({ env, setupStage: 'env' })
      return env
    }

    let loggedIn: boolean
    let configured: boolean
    let playerBackend: OnethingMusicPlayerBackend
    try {
      // Order matters for latency, not correctness. `login --check` costs ~0.25s
      // and a positive answer already proves credentials exist, whereas
      // `config list` costs ~10s (ncm-cli syncs its server manifest first). So
      // ask the cheap question, and only pay for `config list` when the answer
      // is no and we have to tell "no credentials" apart from "not logged in"
      // to point the wizard at the right step.
      loggedIn = await this.options.backend.checkLogin()
      configured = loggedIn || (await this.options.backend.isConfigured())
      playerBackend = await this.options.backend.getPlayer()
    } catch (error) {
      // A probe blew up (daily quota spent, ncm-cli hiccup). That tells us
      // nothing about the setup, so say what went wrong and keep the last
      // known answer. Reporting the failure as `configured: false` would walk
      // the user back to the credentials step and have them re-enter a
      // privateKey that was never the problem — and spend more quota trying.
      this.patch({ env, lastError: error instanceof Error ? error.message : '音乐环境探测失败' })
      this.options.logger?.warn('[music] environment probe failed; keeping last known setup state', error)
      return env
    }

    this.patch({
      env,
      configured,
      loggedIn,
      playerBackend,
      lastError: undefined,
      setupStage: this.resolveSetupStage(env, configured, loggedIn, playerBackend),
    })
    return env
  }

  async ensureSetupStage(): Promise<OnethingMusicSetupStage> {
    if (!this.state.env) await this.refreshEnv()
    return this.state.setupStage
  }

  /** Switching player is a setup action: it can change the stage (mpv gate). */
  async setPlayerBackend(player: OnethingMusicPlayerBackend): Promise<void> {
    try {
      await this.options.backend.setPlayer(player)
    } catch (error) {
      throw this.handleError(error, '切换播放器失败')
    }
    this.patch({ playerBackend: player })
    this.refreshSetupStage()
  }

  async installTool(tool: string): Promise<void> {
    try {
      await this.options.backend.installTool(tool, chunk => {
        this.options.emit({ type: 'install-output', tool, chunk })
      })
    } catch (error) {
      throw this.handleError(error, `${tool} 安装失败`)
    }
    await this.refreshEnv()
  }

  async setCredentials(appId: string, privateKey: string): Promise<void> {
    try {
      await this.options.backend.setCredentials(appId, privateKey)
    } catch (error) {
      throw this.handleError(error, '凭证写入失败')
    }
    this.patch({ configured: true })
    this.refreshSetupStage()
  }

  async startLogin(): Promise<void> {
    try {
      await this.options.backend.startLogin(chunk => {
        this.options.emit({ type: 'login-output', chunk })
      })
    } catch (error) {
      throw this.handleError(error, '登录启动失败')
    }
  }

  cancelLogin(): void {
    this.options.backend.cancelLogin()
  }

  async checkLogin(): Promise<boolean> {
    const loggedIn = await this.options.backend.checkLogin()
    this.patch({ loggedIn })
    this.refreshSetupStage()
    return loggedIn
  }

  async logout(): Promise<void> {
    try {
      await this.options.backend.logout()
    } catch (error) {
      throw this.handleError(error, '退出登录失败')
    }
    this.patch({ loggedIn: false })
    this.refreshSetupStage()
  }

  setSource(source: OnethingMusicRadioSource): void {
    this.patch({ source })
  }

  dispose(): void {
    this.cancelLogin()
  }
}
