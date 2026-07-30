/**
 * Agent 头像的两条共享规则 — pure logic (docs/design/todo2-fix-plan.md P2).
 *
 * An agent's identity mark has two layers: an emoji (`avatar`) that every text
 * surface can render, and an optional picture (`avatarImage`). Two things about
 * them were previously duplicated and are now single-sourced here:
 *
 *  - THE FALLBACK. 「🤖」 was written out in six places and re-declared as four
 *    separately-named constants. It is one decision, so it is one constant; the
 *    older names stay as aliases because tests and callers name them.
 *  - THE REFERENCE FORM. `avatarImage` persists the media library's stored FILE
 *    NAME, never a host URL and never a dataURL (agents.json is a hot file read
 *    on every roster lookup — inlined bytes would blow it up). Turning that name
 *    into something an `<img src>` accepts is host-specific, and that mapping is
 *    the second function below.
 *
 * DOM-free on purpose: `AgentAvatar.vue` is then a template over these rules
 * rather than the place they live.
 */
import type { PlatformEnvironment } from '@/platform'

/** The one stamp an agent with no mark of its own wears. */
export const AGENT_AVATAR_FALLBACK = '🤖'

/**
 * Already a usable image reference? Anything with a scheme, a protocol-relative
 * host or a server route is passed through untouched — a stored value that
 * predates the bare-name form (or one a future importer writes) must still
 * render rather than be mangled into `media://https://…`.
 */
function isResolvedImageReference(reference: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(reference)
    || reference.startsWith('//')
    || reference.startsWith('/')
}

/**
 * `avatarImage` → an `<img src>` for this host.
 *
 * Desktop serves the media store over the `media://` protocol; the headless
 * server serves it at `/api/media/file/<name>` (the same shape it rewrites
 * every asset's `filePath` into). Returns '' for an absent reference so a
 * caller can treat "no picture" and "picture, no URL" as one branch.
 */
export function resolveAgentAvatarSrc(
  reference: string | undefined | null,
  environment: PlatformEnvironment,
): string {
  const trimmed = (reference || '').trim()
  if (!trimmed) return ''
  if (isResolvedImageReference(trimmed)) return trimmed
  return environment === 'web'
    ? `/api/media/file/${encodeURIComponent(trimmed)}`
    : `media://${encodeURIComponent(trimmed)}`
}
