/**
 * A shiki theme for the diff library that reads its colours from the app's own
 * theme tokens.
 *
 * The library highlights with shiki's bundled github-dark/github-light. Those
 * are a second source of colour truth: they do not move when the base46 theme
 * does, so a diff always looked like it was cut from a different application.
 *
 * shiki's CSS-variables theme removes the second source rather than syncing it:
 * every colour is emitted as a `var(...)` reference instead of a baked hex. One
 * registration therefore serves light and dark alike, and switching themes
 * needs no re-highlight — the browser just re-resolves the variables.
 */
import { createCssVariablesTheme, normalizeTheme } from 'shiki'
import { registerCustomTheme } from '@pierre/diffs'

/** Must equal the theme object's own `name` — resolveTheme() throws otherwise. */
export const DIFF_THEME_NAME = 'onething'

const VARIABLE_PREFIX = '--onething-diff-'

/**
 * shiki slot -> app token. Each value becomes the fallback of
 * `var(--onething-diff-<slot>, <value>)`, which is what lets a single diff
 * override one slot without touching the theme.
 *
 * Every syntax colour goes through `--hg-syntax-*-fg`, the highlight group the
 * base46 theme emits, with the static `--text-code-*` default behind it. That
 * is the same chain the `--syntax-*` aliases in variables.css expand to, spelt
 * out here because those aliases only cover six of the eleven groups.
 */
const SLOT_DEFAULTS: Record<string, string> = {
  foreground: 'var(--hg-syntax-plain-fg, var(--text-code-block))',
  background: 'var(--ui-surface-code-block-bg)',

  'token-keyword': 'var(--hg-syntax-keyword-fg, var(--text-code-keyword))',
  'token-string': 'var(--hg-syntax-string-fg, var(--text-code-string))',
  'token-string-expression': 'var(--hg-syntax-string-fg, var(--text-code-string))',
  'token-comment': 'var(--hg-syntax-comment-fg, var(--text-code-comment))',
  'token-constant': 'var(--hg-syntax-number-fg, var(--text-code-number))',
  'token-function': 'var(--hg-syntax-function-fg, var(--text-code-function))',
  'token-punctuation': 'var(--hg-syntax-punctuation-fg, var(--text-code-operator))',
  'token-parameter': 'var(--hg-syntax-variable-fg, var(--text-code-variable))',
  'token-link': 'var(--hg-syntax-string-fg, var(--text-code-string))',

  // Only reachable when the file being diffed is itself a patch.
  'token-inserted': 'var(--diff-add-text)',
  'token-deleted': 'var(--diff-del-text)',
  'token-changed': 'var(--diff-hunk-text)',
}

/*
 * Deliberately absent: the ansi-* slots.
 *
 * The library derives its addition/deletion/modified base colours from
 * theme.colors['terminal.ansiGreen'/'ansiRed'/'ansiBlue'], so mapping those
 * looks like the way to colour the diff palette. It isn't. TextMate only
 * accepts literal hex, so normalizeTheme() swaps every var() for an opaque
 * placeholder colour and keeps the real value in colorReplacements, which shiki
 * maps back while tokenizing. Token colours therefore survive; anything reading
 * theme.colors directly — as the library does here — gets the placeholder, and
 * a near-transparent black is what lands on screen.
 *
 * The diff palette is set from CSS in DiffView instead, via the library's
 * `--diffs-*-override` hooks.
 */

let registered = false

/** Idempotent: registerCustomTheme() throws on a duplicate name. */
export function registerDiffTheme(): void {
  if (registered) return
  registered = true

  const theme = createCssVariablesTheme({
    name: DIFF_THEME_NAME,
    variablePrefix: VARIABLE_PREFIX,
    variableDefaults: SLOT_DEFAULTS,
    fontStyle: true,
  })

  registerCustomTheme(DIFF_THEME_NAME, async () => normalizeTheme(theme))
}
