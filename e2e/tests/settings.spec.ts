/**
 * Settings E2E Tests — SKIPPED
 *
 * Settings opens in a separate BrowserWindow via `openSettingsWindow()`.
 * Playwright's Electron support has limitations with multi-window handling:
 * - `app.waitForEvent('window')` doesn't reliably capture the settings window
 * - The settings window loads a completely different Vue route with tabs
 *   (General, AI Providers, Chat, Tools, Shortcuts, MCP, Skills, Memory)
 *
 * To properly test settings, we would need:
 * 1. A reliable way to capture the second BrowserWindow
 * 2. Correct selectors for the settings UI (tab-based nav, not .settings-overlay)
 *
 * Lower priority since settings is a standard CRUD form with minimal logic.
 * The main risk (provider configuration) is already tested indirectly via
 * mock provider pre-seeding in chat-flow and streaming tests.
 *
 * TODO: Implement when Playwright Electron multi-window support improves
 * or when settings is refactored to in-window panel.
 */
import { test } from '../fixtures/app'

test.describe('Settings', () => {
  test.skip('open settings window', async () => {
    // Needs multi-window Playwright support
  })
})
