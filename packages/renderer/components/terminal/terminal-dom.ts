/**
 * Tiny DOM helper kept dependency-free on purpose: useShortcuts imports it,
 * and must not pull the terminal registry (and xterm's CSS) into its graph.
 */

/** True when the event originates inside a live terminal view. */
export function isEventInsideTerminal(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('.onething-terminal'))
}
