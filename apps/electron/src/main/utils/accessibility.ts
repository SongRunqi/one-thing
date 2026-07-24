/**
 * Accessibility Permission Helpers
 *
 * macOS requires Accessibility permission for mouse/keyboard automation.
 * This module provides helpers to check and guide users through permission setup.
 */

import {
  checkElectronAccessibilityPermission,
  checkElectronScreenRecordingPermission,
  getElectronAccessibilityPermissionError,
  getElectronAutomationPermissionStatus,
  openElectronAccessibilitySettings,
} from '@onething/electron-host/accessibility/permissions'

/**
 * Check if the app has accessibility permission (macOS only)
 * On Windows/Linux, always returns true as no special permission is needed.
 *
 * @param promptUser - If true, shows the system permission dialog on macOS
 * @returns true if permission is granted or not on macOS
 */
export function checkAccessibilityPermission(promptUser = false): boolean {
  return checkElectronAccessibilityPermission(promptUser)
}

/**
 * Get a user-friendly error message for accessibility permission
 */
export function getAccessibilityPermissionError(): string {
  return getElectronAccessibilityPermissionError()
}

/**
 * Open the accessibility settings panel (macOS only)
 */
export async function openAccessibilitySettings(): Promise<void> {
  await openElectronAccessibilitySettings()
}

/**
 * Check if screen recording permission is granted (macOS only)
 * Required for screenshot functionality on macOS Catalina+
 */
export function checkScreenRecordingPermission(): boolean {
  return checkElectronScreenRecordingPermission()
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
  return getElectronAutomationPermissionStatus(promptUser)
}
