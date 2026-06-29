import {
  createCoreCachedJsonState,
  getCoreCachedJsonFile,
  initializeCoreCachedJsonFile,
  invalidateCoreCachedJsonFile,
  isCoreCachedJsonInitialized,
  saveCoreCachedJsonFile,
  saveCoreCachedJsonFileAsync,
  updateCoreCachedJsonInMemory,
  type CoreCachedJsonFileOptions,
  type CoreCachedJsonState,
} from '@onething/core/storage'

export interface OnethingSettingsRepositoryLogger {
  log?(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error?(...args: unknown[]): void
}

export interface OnethingSettingsRepositoryOptions<TSettings> {
  filePath: string | (() => string)
  defaultValue: TSettings | (() => TSettings)
  normalize?: (value: unknown) => TSettings
  logger?: OnethingSettingsRepositoryLogger
}

export class OnethingSettingsRepository<TSettings> {
  private readonly state: CoreCachedJsonState<TSettings>

  constructor(
    private readonly options: OnethingSettingsRepositoryOptions<TSettings>,
    state: CoreCachedJsonState<TSettings> = createCoreCachedJsonState<TSettings>(),
  ) {
    this.state = state
  }

  async initialize(): Promise<TSettings> {
    if (this.state.value !== null) {
      this.options.logger?.log?.('[Settings] Already initialized, returning cached instance')
      return this.state.value
    }

    if (this.state.initPromise !== null) {
      this.options.logger?.log?.('[Settings] Initialization in progress, waiting...')
      return this.state.initPromise
    }

    this.options.logger?.log?.('[Settings] Starting async initialization...')
    try {
      const settings = await initializeCoreCachedJsonFile(this.state, this.fileOptions())
      this.options.logger?.log?.('[Settings] Loaded from disk successfully')
      return settings
    } catch (error) {
      this.options.logger?.error?.(
        '[Settings] Error loading settings, using defaults:',
        error instanceof Error ? error.message : error,
      )
      throw error
    }
  }

  isInitialized(): boolean {
    return isCoreCachedJsonInitialized(this.state)
  }

  get(): TSettings {
    if (this.state.value !== null) {
      return this.state.value
    }

    this.options.logger?.warn?.('[Settings] getSettings() called before initialization, using sync fallback')
    return getCoreCachedJsonFile(this.state, this.fileOptions())
  }

  async saveAsync(settings: TSettings): Promise<TSettings> {
    const saved = await saveCoreCachedJsonFileAsync(this.state, this.fileOptions(), settings)
    this.options.logger?.log?.('[Settings] Saved to disk asynchronously')
    return saved
  }

  save(settings: TSettings): TSettings {
    return saveCoreCachedJsonFile(this.state, this.fileOptions(), settings)
  }

  invalidate(): void {
    invalidateCoreCachedJsonFile(this.state)
    this.options.logger?.log?.('[Settings] Cache invalidated')
  }

  updateInMemory(settings: TSettings): void {
    updateCoreCachedJsonInMemory(this.state, settings)
  }

  private fileOptions(): CoreCachedJsonFileOptions<TSettings> {
    return {
      filePath: this.resolveFilePath(),
      defaultValue: this.options.defaultValue,
      normalize: this.options.normalize,
    }
  }

  private resolveFilePath(): string {
    return typeof this.options.filePath === 'function'
      ? this.options.filePath()
      : this.options.filePath
  }
}

export function createOnethingSettingsRepository<TSettings>(
  options: OnethingSettingsRepositoryOptions<TSettings>,
): OnethingSettingsRepository<TSettings> {
  return new OnethingSettingsRepository(options)
}

