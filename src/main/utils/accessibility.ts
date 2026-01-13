/**
 * Accessibility Permission Helpers
 *
 * macOS requires Accessibility permission for mouse/keyboard automation.
 * This module provides helpers to check and guide users through permission setup.
 */

import { systemPreferences, shell } from 'electron'

/**
 * Check if the app has accessibility permission (macOS only)
 * On Windows/Linux, always returns true as no special permission is needed.
 *
 * @param promptUser - If true, shows the system permission dialog on macOS
 * @returns true if permission is granted or not on macOS
 */
export function checkAccessibilityPermission(promptUser = false): boolean {
  if (process.platform !== 'darwin') {
    return true
  }

  return systemPreferences.isTrustedAccessibilityClient(promptUser)
}

/**
 * Get a user-friendly error message for accessibility permission
 */
export function getAccessibilityPermissionError(): string {
  if (process.platform === 'darwin') {
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

/**
 * Open the accessibility settings panel (macOS only)
 */
export async function openAccessibilitySettings(): Promise<void> {
  if (process.platform === 'darwin') {
    // Opens System Preferences/Settings to the Accessibility pane
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    )
  }
}

/**
 * Check if screen recording permission is granted (macOS only)
 * Required for screenshot functionality on macOS Catalina+
 */
export function checkScreenRecordingPermission(): boolean {
  if (process.platform !== 'darwin') {
    return true
  }

  // On macOS, screen recording permission is checked implicitly
  // when using desktopCapturer. There's no direct API to check it.
  // The permission dialog appears automatically when needed.
  return true
}

/**
 * Combined permission check for automation tools
 */
export interface PermissionStatus {
  accessibility: boolean
  screenRecording: boolean
  platform: NodeJS.Platform
}

export function getAutomationPermissionStatus(promptUser = false): PermissionStatus {
  return {
    accessibility: checkAccessibilityPermission(promptUser),
    screenRecording: checkScreenRecordingPermission(),
    platform: process.platform,
  }
}
