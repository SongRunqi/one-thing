type MaybePromise<T> = T | Promise<T>

export interface OnethingSettingsWithRuntimeEffects<
> {
  network?: {
    proxy?: unknown
  }
  mcp?: unknown
  acp?: unknown
}

type OnethingSettingsProxy<TSettings> =
  TSettings extends { network?: { proxy?: infer TProxy } } ? TProxy : unknown

type OnethingSettingsMCP<TSettings> =
  TSettings extends { mcp?: infer TMCPSettings } ? NonNullable<TMCPSettings> : unknown

type OnethingSettingsACP<TSettings> =
  TSettings extends { acp?: infer TACPSettings } ? NonNullable<TACPSettings> : unknown

export interface SaveOnethingSettingsWithRuntimeEffectsOptions<
  TSettings extends OnethingSettingsWithRuntimeEffects,
  TInputSettings = TSettings,
> {
  settings: TInputSettings
  saveSettings(settings: TInputSettings): MaybePromise<unknown>
  getSettings(): TSettings
  invalidateProviderCache(): MaybePromise<unknown>
  applyNetworkProxySettings(proxy: OnethingSettingsProxy<TSettings> | undefined): MaybePromise<unknown>
  registerGlobalWindowShortcuts(): MaybePromise<unknown>
  applyVoiceSettings?(settings: TSettings): MaybePromise<unknown>
  updateMCPSettings(settings: OnethingSettingsMCP<TSettings>): MaybePromise<unknown>
  registerMCPTools(): MaybePromise<unknown>
  updateACPSettings(settings: OnethingSettingsACP<TSettings>): MaybePromise<unknown>
  defaultMCPSettings: OnethingSettingsMCP<TSettings>
  defaultACPSettings: OnethingSettingsACP<TSettings>
}

export interface SaveOnethingSettingsWithRuntimeEffectsResult<TSettings> {
  success: true
  settings: TSettings
}

export async function saveOnethingSettingsWithRuntimeEffects<
  TSettings extends OnethingSettingsWithRuntimeEffects,
  TInputSettings,
>(
  options: SaveOnethingSettingsWithRuntimeEffectsOptions<
    TSettings,
    TInputSettings
  >,
): Promise<SaveOnethingSettingsWithRuntimeEffectsResult<TSettings>> {
  await options.saveSettings(options.settings)
  const normalizedSettings = options.getSettings()

  await options.invalidateProviderCache()
  await options.applyNetworkProxySettings(
    normalizedSettings.network?.proxy as OnethingSettingsProxy<TSettings> | undefined,
  )
  await options.registerGlobalWindowShortcuts()
  await options.applyVoiceSettings?.(normalizedSettings)
  await options.updateMCPSettings(
    (normalizedSettings.mcp ?? options.defaultMCPSettings) as OnethingSettingsMCP<TSettings>,
  )
  await options.registerMCPTools()
  await options.updateACPSettings(
    (normalizedSettings.acp ?? options.defaultACPSettings) as OnethingSettingsACP<TSettings>,
  )

  return {
    success: true,
    settings: normalizedSettings,
  }
}
