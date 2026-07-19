import {
  broadcastElectronSettingsChanged,
  getElectronShouldUseDarkColors,
  registerElectronSettingsIpcHandlers,
  registerElectronSystemThemeChangedBroadcast,
  showElectronOpenDialog,
  type ElectronSettingsIpcEvent,
} from '@onething/electron-host/settings/ipc-host'
import {
  getOnethingSettingsForIpc,
  getOnethingSystemThemeForIpc,
  saveOnethingSettingsWithRuntimeEffectsForIpc,
} from '@onething/runtime/settings'
import { IPC_CHANNELS, type SaveSettingsRequest, type TestProxyRequest } from '../../shared/ipc.js'
import * as store from '../store.js'
import { openSettingsWindow } from '../window.js'
import { invalidateProviderCache } from '../providers/registry.js'
import { applyNetworkProxySettings, testProxy } from '../network/proxy.js'
import { registerGlobalWindowShortcuts } from '@onething/electron-host/shortcuts/global-shortcuts'
import { getVoiceServiceSafe } from '../voice/service.js'
import { MCPManager, registerMCPTools } from '../mcp/index.js'
import { ACPManager } from '../acp/index.js'
import { applyGatewaySettings } from '@onething/electron-host/gateway/lifecycle'
import { startTodoPlanWatcher } from '../todo-plan/store.js'

async function saveSettingsFromIpc(settings: SaveSettingsRequest, event: ElectronSettingsIpcEvent) {
  const result = await saveOnethingSettingsWithRuntimeEffectsForIpc({
    settings,
    saveSettings: nextSettings => store.saveSettings(nextSettings),
    getSettings: () => store.getSettings(),
    invalidateProviderCache,
    applyNetworkProxySettings,
    registerGlobalWindowShortcuts,
    applyVoiceSettings: normalizedSettings =>
      getVoiceServiceSafe()?.applySettings(normalizedSettings),
    updateMCPSettings: nextSettings => MCPManager.updateSettings(nextSettings),
    registerMCPTools,
    updateACPSettings: nextSettings => ACPManager.updateSettings(nextSettings),
    defaultMCPSettings: { enabled: true, servers: [] },
    defaultACPSettings: { enabled: true, agents: [] },
    logger: console,
  })
  if (!result.success) return result
  const normalizedSettings = result.settings
  await applyGatewaySettings(normalizedSettings).catch(error => {
    console.error('[Gateway] Failed to apply channel settings:', error)
  })

  // The todo directory is a setting; re-point the watcher if it moved. start()
  // is a no-op when the directory is unchanged.
  await startTodoPlanWatcher().catch(error => {
    console.error('[todo-plan] Failed to restart watcher after settings change:', error)
  })

  broadcastElectronSettingsChanged({
    channel: IPC_CHANNELS.SETTINGS_CHANGED,
    settings: normalizedSettings,
    exceptWebContentsId: event.sender?.id,
  })
  return result
}

export function registerSettingsHandlers() {
  registerElectronSystemThemeChangedBroadcast({
    channel: IPC_CHANNELS.SYSTEM_THEME_CHANGED,
  })

  registerElectronSettingsIpcHandlers({
    channels: {
      openWindow: IPC_CHANNELS.OPEN_SETTINGS_WINDOW,
      getSettings: IPC_CHANNELS.GET_SETTINGS,
      getSystemTheme: IPC_CHANNELS.GET_SYSTEM_THEME,
      saveSettings: IPC_CHANNELS.SAVE_SETTINGS,
      testProxy: IPC_CHANNELS.TEST_PROXY,
      showOpenDialog: IPC_CHANNELS.SHOW_OPEN_DIALOG,
    },
    openSettingsWindow: () => {
      openSettingsWindow()
      return { success: true }
    },
    getSettings: () =>
      getOnethingSettingsForIpc({
        getSettings: () => store.getSettings(),
        logger: console,
      }),
    getSystemTheme: () => getOnethingSystemThemeForIpc(getElectronShouldUseDarkColors()),
    saveSettings: (settings, event) => saveSettingsFromIpc(settings as SaveSettingsRequest, event),
    testProxy: request => {
      const typedRequest = request as TestProxyRequest
      return testProxy(typedRequest.proxy)
    },
    showOpenDialog: options => showElectronOpenDialog(options),
  })
}
