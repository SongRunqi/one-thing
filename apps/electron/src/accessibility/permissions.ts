import { shell, systemPreferences } from 'electron'

export interface ElectronAccessibilityAdapters {
  platform?: NodeJS.Platform
  shell?: Pick<typeof shell, 'openExternal'>
  systemPreferences?: Pick<typeof systemPreferences, 'isTrustedAccessibilityClient'>
}

export interface ElectronAutomationPermissionStatus {
  accessibility: boolean
  screenRecording: boolean
  platform: NodeJS.Platform
}

const ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

function getPlatform(options: ElectronAccessibilityAdapters = {}): NodeJS.Platform {
  return options.platform ?? process.platform
}

export function checkElectronAccessibilityPermission(
  promptUser = false,
  options: ElectronAccessibilityAdapters = {},
): boolean {
  if (getPlatform(options) !== 'darwin') {
    return true
  }

  const preferences = options.systemPreferences ?? systemPreferences
  return preferences.isTrustedAccessibilityClient(promptUser)
}

export function getElectronAccessibilityPermissionError(
  options: Pick<ElectronAccessibilityAdapters, 'platform'> = {},
): string {
  if (getPlatform(options) === 'darwin') {
    return (
      'Accessibility permission required.\n\n' +
      'To enable mouse/keyboard control:\n' +
      '1. Open System Settings > Privacy & Security > Accessibility\n' +
      '2. Click the lock to make changes\n' +
      '3. Add this application to the allowed list\n' +
      '4. Restart the application after granting permission'
    )
  }

  return 'Accessibility permission is not available on this platform.'
}

export async function openElectronAccessibilitySettings(
  options: ElectronAccessibilityAdapters = {},
): Promise<void> {
  if (getPlatform(options) !== 'darwin') {
    return
  }

  const electronShell = options.shell ?? shell
  await electronShell.openExternal(ACCESSIBILITY_SETTINGS_URL)
}

export function checkElectronScreenRecordingPermission(
  options: Pick<ElectronAccessibilityAdapters, 'platform'> = {},
): boolean {
  if (getPlatform(options) !== 'darwin') {
    return true
  }

  return true
}

export function getElectronAutomationPermissionStatus(
  promptUser = false,
  options: ElectronAccessibilityAdapters = {},
): ElectronAutomationPermissionStatus {
  return {
    accessibility: checkElectronAccessibilityPermission(promptUser, options),
    screenRecording: checkElectronScreenRecordingPermission(options),
    platform: getPlatform(options),
  }
}
