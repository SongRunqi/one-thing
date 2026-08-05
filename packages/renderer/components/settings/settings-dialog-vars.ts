import type { CSSProperties } from 'vue'

/**
 * The `--settings-*` alias block, re-declared for a layer that has left the
 * settings subtree.
 *
 * Custom properties resolve by DOM ancestry, not by CSS scope. `SettingsPage`
 * declares this block on `.settings-page`, so the moment a panel is teleported
 * to `<body>` (which every `Dialog` is) every `var(--settings-…)` inside it
 * falls back to nothing and the sheet renders unstyled — the concrete form of
 * the §6.1 trap in docs/design/ui-system-consolidation.md.
 *
 * Spread this into a migrated settings dialog's `:style`. It is a copy of
 * `components/SettingsPage.vue`'s declaration on purpose: both sides are pure
 * aliases over global `--ui-*` tokens, so the values cannot drift apart in
 * meaning — only in spelling, and the shared unit test over
 * `styles/__tests__/ui-token-vars.test.ts` covers that they stay `--ui-*`-based.
 */
export const SETTINGS_DIALOG_VARS: CSSProperties = {
  '--settings-paper': 'var(--ui-surface-chat-bg)',
  '--settings-paper-2': 'var(--ui-sidebar-surface-bg, var(--ui-surface-sidebar-bg))',
  '--settings-paper-3': 'var(--ui-surface-panel-bg)',
  '--settings-rule': 'var(--ui-border-default-border)',
  '--settings-rule-soft': 'var(--ui-border-subtle-border)',
  '--settings-ink': 'var(--ui-text-primary-fg)',
  '--settings-ink-2': 'var(--ui-text-secondary-fg)',
  '--settings-ink-3': 'var(--ui-text-muted-fg)',
  '--settings-ink-4': 'var(--ui-text-faint-fg)',
  '--settings-ink-5': 'color-mix(in srgb, var(--ui-text-faint-fg) 66%, transparent)',
  '--settings-accent': 'var(--ui-accent-primary-fg)',
  '--settings-accent-soft': 'color-mix(in srgb, var(--ui-accent-primary-fg) 16%, transparent)',
  '--settings-accent-tint': 'color-mix(in srgb, var(--settings-accent) 12%, var(--settings-paper))',
} as CSSProperties
