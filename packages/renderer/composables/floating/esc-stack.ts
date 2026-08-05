/**
 * Who owns the Escape key right now.
 *
 * Escape must be answered by the TOP layer only. Two Dialogs can be open at
 * once (a delete-confirm raised from inside an editor sheet), and a naive
 * per-instance listener closes both with one key. Dialog has arbitrated this
 * among *dialogs* since P2 with a module-private stack.
 *
 * P3 made it cross-component: a `Select` panel opened inside a Dialog is a
 * layer above that Dialog, and it has to win Escape — otherwise the sheet
 * closes out from under an open dropdown (observed on the real page in
 * `RoomSettingsDialog`). The native `<select>` it replaced never had the bug
 * because the OS popup swallowed the key before the page saw it.
 *
 * Why a stack and not "whoever is focused": the listeners are all on `window`
 * in the capture phase, so DOM position decides nothing — for two capture
 * listeners on the same target, REGISTRATION ORDER wins, and the Dialog always
 * registers first. `stopPropagation` from the inner layer therefore comes too
 * late. Every layer asks this stack instead.
 *
 * Contract: push on open, pop on close (and on unmount — a layer that forgets
 * to pop deadlocks Escape for everything under it). Only the token on top acts.
 */
const escStack: symbol[] = []

export function pushEscLayer(token: symbol): void {
  if (escStack.includes(token)) return
  escStack.push(token)
}

export function popEscLayer(token: symbol): void {
  const index = escStack.indexOf(token)
  if (index >= 0) escStack.splice(index, 1)
}

/** True when `token` is the top layer, i.e. the one Escape belongs to. */
export function ownsEsc(token: symbol): boolean {
  return escStack[escStack.length - 1] === token
}
