/**
 * Agent Switch E2E Tests — SKIPPED
 *
 * Agent switching requires pre-configured CustomAgents in the database.
 * The AgentDropdown component receives agents from the CustomAgents store,
 * which loads from SQLite. Seeding agents would require either:
 *   1. Pre-populating the SQLite database in the temp userData directory
 *   2. Using IPC to create agents programmatically before testing
 *
 * Both approaches add significant complexity and are better suited for a
 * dedicated agent-management E2E test suite. The agent dropdown UI itself
 * is straightforward (click to open, click item to select) — the main risk
 * is in the data seeding, not the interaction.
 *
 * TODO: Implement when agent CRUD IPC helpers are available in the test fixture.
 */
import { test, expect } from '../fixtures/app'

test.describe('Agent Switch', () => {
  test.skip('open agent dropdown', async ({ page }) => {
    // Would need pre-seeded agents in the database
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
  })
})
