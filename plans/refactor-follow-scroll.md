# Refactor: extract `useFollowScroll`, collapse parameters

## Context

`MessageList.vue` is 1620 lines, ~250 of which are scroll/follow logic interleaved with nav-rail markers, permission/tool/branch handlers, and rendering. Every modification to scroll behavior currently requires re-threading three orthogonal concerns mentally. The follow logic itself is also more complex than it needs to be: a `force: boolean` parameter, a `pinBottom` alias around `followVisualAnchor`, two near-duplicate constants (`FOLLOW_ANCHOR_GAP` and `VISUAL_FOLLOW_TAIL_SPACE`), and a re-attach predicate expressed in anchor-delta space when "physical distance to bottom" reads more obviously.

The goal is to make this code easy to modify the *next* time we need to touch it, **without** changing observable behavior. This is Option (2) from the discussion — extract a composable and clean up flags. We keep the anchor-priority system (caret → footer → sentinel) because it's still load-bearing for streaming-with-tool-calls.

## Step 1 — Extract `useFollowScroll` composable

Create `src/renderer/composables/useFollowScroll.ts`. It owns:

- **State**: `isFollowing` (ref), `suppressed` (closure-scoped), `allowNextScroll` (closure-scoped).
- **Constant**: `FOLLOW_BOTTOM_GAP = 64`.
- **Virtualizer creation** (the composable instantiates `useVirtualizer` so it controls `scrollToFn`).
- **Anchor math**: `getAnchorRect`, `getAnchorDelta`.
- **Two named scroll methods** (replacing `followVisualAnchor(force)`):
  - `snapToAnchor()` — always applies the delta. Used by `snapToBottom` and re-attach.
  - `nudgeToAnchor()` — applies only if `|delta| > 1`. Used by `ResizeObserver` and external drift triggers.
- **Public actions**: `snapToBottom()` (was `jumpToVisualAnchor`), `prepareForSwitch()`, `restoreSnapshot(snap)`, `captureSnapshot()`.
- **Event handlers**: `onWheel`, `checkReattach` (the re-attach probe in the scroll handler).
- **Lifecycle**: ResizeObserver on `content`, wheel listener on `scroller`. The `scroll` listener stays in `MessageList.vue` because it has additional non-scroll concerns (nav markers, visible-user-msg tracking) — it just calls `follow.checkReattach()` first.

### Composable signature

```ts
// src/renderer/composables/useFollowScroll.ts
export interface FollowSnapshot {
  firstVisibleIndex: number
  offsetWithinMessage: number
  isFollowing: boolean
}

export interface UseFollowScrollOptions {
  scroller: Ref<HTMLElement | null>
  content: Ref<HTMLElement | null>
  count: ComputedRef<number>
  estimateSize?: number              // default 150
  overscan?: number                  // default 5
  getFollowAnchor: () => HTMLElement | null
}

export function useFollowScroll(opts: UseFollowScrollOptions) {
  // ... see Step 2 for internals ...

  return {
    virtualizer,                     // ComputedRef<Virtualizer>
    isFollowing,                     // Ref<boolean> (readable from outside)
    snapToBottom,                    // () => void
    nudgeToAnchor,                   // () => void  (for external drift triggers)
    onWheel,                         // (e: WheelEvent) => void
    checkReattach,                   // () => void
    prepareForSwitch,                // () => void
    restoreSnapshot,                 // (snap: FollowSnapshot) => void
    captureSnapshot,                 // () => FollowSnapshot
  }
}
```

### Wiring in `MessageList.vue`

```ts
const follow = useFollowScroll({
  scroller: messageListRef,
  content: messageListContentRef,
  count: computed(() => props.messages.length),
  getFollowAnchor: () => {
    const caret = getLastElement('[data-stream-caret]')
    if (caret) return caret
    const footer = getLastElement('.message [data-message-footer]')
    if (footer) return footer
    return bottomSentinelRef.value
  },
})

const { virtualizer, isFollowing } = follow   // re-export read-only refs

// scroll handler keeps its other responsibilities
function handleScroll() {
  follow.checkReattach()
  scheduleNavMarkerUpdate()
  updateVisibleUserMessageIndex()
}

onMounted(() => {
  messageListRef.value?.addEventListener('scroll', handleScroll)
  messageListRef.value?.addEventListener('wheel', follow.onWheel, { passive: false })
  // ... rest unchanged
})

// External drift triggers stay in MessageList because they read store state
watch([effectiveScrollVersion, () => props.messages.length], () => {
  if (!isFollowing.value || props.messages.length === 0) return
  nextTick(() => follow.nudgeToAnchor())
})

watch(lastUserMessageId, (newId, oldId) => {
  if (!newId || newId === oldId) return
  // The composable handles isFollowing flip + multi-rAF re-pin
  follow.snapToBottom()
})

defineExpose({
  ...follow.captureSnapshot ? { /* snapshot getters */ } : {},
  prepareForSwitch: follow.prepareForSwitch,
  restoreSnapshot: follow.restoreSnapshot,
  scrollToBottom: follow.snapToBottom,
  // existing nav-related exposes stay
  getFirstVisibleIndex: () => follow.captureSnapshot().firstVisibleIndex,
  getOffsetWithinMessage: () => follow.captureSnapshot().offsetWithinMessage,
  getIsFollowing: () => follow.isFollowing.value,
  getNavIndex: () => currentUserMessageNavIndex.value,
  getHasNavigated: () => hasNavigated.value,
})
```

`ChatPanel.vue` doesn't need changes — it calls the same exposed methods.

## Step 2 — Internal cleanups inside the composable

These are localized to the new file; behavior unchanged.

1. **Inline `pinBottom`.** It was a one-line wrapper around `followVisualAnchor`. Direct `nudgeToAnchor()` calls read better.

2. **Replace `followVisualAnchor(source, force)` with two functions.**

   ```ts
   function snapToAnchor() {                  // was: followVisualAnchor(_, true)
     const delta = getAnchorDelta()
     if (delta == null) { fallbackPinScrollHeight(); return }
     scroller.value!.scrollTop += delta       // always apply
   }

   function nudgeToAnchor() {                 // was: followVisualAnchor(_, false)
     if (!isFollowing.value || suppressed) return
     const delta = getAnchorDelta()
     if (delta == null) { fallbackPinScrollHeight(); return }
     if (Math.abs(delta) > 1) scroller.value!.scrollTop += delta
   }
   ```

   The existing `traceEvent` calls move into a small `trace(name)` helper, kept for debugging.

3. **Re-attach predicate by physical distance.** Same effective trigger as the current `delta <= 2`, but reads obviously:

   ```ts
   function checkReattach() {
     if (isFollowing.value) return
     const el = scroller.value
     if (!el) return
     const distToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
     if (distToBottom < 8) {                  // was: delta <= 2 (gives same trigger point)
       isFollowing.value = true
       requestAnimationFrame(() => snapToAnchor())
     }
   }
   ```

   With `padding-bottom: 0` on `.message-list` and tail = 64, `distToBottom < 8` triggers when within ~8 px of physical bottom — very close to the current `delta <= 2` (which triggered ~6 px before max in anchor-space). Tunable.

4. **One constant.** Drop `VISUAL_FOLLOW_TAIL_SPACE`. The tail is `FOLLOW_BOTTOM_GAP`. The template uses `style="height: ${virtualizer.getTotalSize() + FOLLOW_BOTTOM_GAP}px"` (constant exported from composable).

5. **`scrollToFn` in one place** (already done — current code blocks all non-explicit calls). Stays inside the composable as part of the virtualizer config.

6. **`snapToBottom` no longer needs the rAF if we land via `scrollToFn`'s scrollHeight pin** — but we keep the rAF anyway: it picks up the footer once it's in DOM and tightens any 18-px sentinel-fallback discrepancy on session switch. One-line.

## Files to modify

- `src/renderer/composables/useFollowScroll.ts` — **new** (~220 lines).
- `src/renderer/components/chat/MessageList.vue` — **shrink by ~240 lines**. All scroll-state refs, `getLastElement`, `getFollowAnchor`, `getFollowAnchorDelta`, `followVisualAnchor`, `jumpToVisualAnchor`, `pinBottom`, the `useVirtualizer` block, `scrollToFn`, the two scroll-related watches, ResizeObserver setup, `onWheel`, the re-attach branch in `handleScroll`, and the snapshot section of `defineExpose` move into the composable. `MessageList.vue` keeps everything else.
- `src/renderer/components/chat/ChatPanel.vue` — **no changes**.
- Tests — **none currently exist for this code**; not adding any in this refactor.

## What we explicitly do NOT change

- Anchor priority order (caret → footer → sentinel).
- `FOLLOW_BOTTOM_GAP` value (stays 64).
- Tail = `FOLLOW_BOTTOM_GAP` invariant.
- `scrollToFn` blocks non-explicit calls (this is what fixed "上下跳").
- `onWheel` "hold" branch is `preventDefault` only (no force-pin per tick).
- Streaming follow behavior, including caret tracking when there's tool-call UI below the caret.

## Verification

1. **Compile & type**: `bun run typecheck` and `bun run lint` pass.
2. **Behavior parity** — manual checklist (run `bun run dev`):
   - [ ] Open app: lands at bottom, gap ≈ 64.
   - [ ] Switch sessions where last msg is **assistant**: gap ≈ 64 with no visible 82→64 transient.
   - [ ] Switch sessions where last msg is **user**: gap ≈ 64, user bubble visible.
   - [ ] Send a message: stream renders, follow stays glued; if streaming bubble has a tool-call panel below the caret, the caret area is what stays visible (not bubble bottom).
   - [ ] Wheel up while following → detach, can scroll up freely; no flicker.
   - [ ] Wheel back to bottom → re-attach lands cleanly at gap ≈ 64; no "上下跳".
   - [ ] Click "scroll to bottom" button → snaps cleanly.
   - [ ] Nav-rail click → smooth scroll to that user message; no auto-detach.
   - [ ] Sidebar open/close (changes scroller width → triggers ResizeObserver) while following → stays at gap ≈ 64.
3. **No DevTools console errors** during any of the above.
4. **Diff sanity**: the only renamed identifiers exposed *outside* the composable are deliberate (snapshot API names match what `ChatPanel.vue` calls). All other renames are internal.

## Out of scope (next refactor candidates, not now)

- Splitting nav-rail logic into its own composable (`useNavRail`).
- Splitting permission/tool handlers into a per-MessageItem layer or a separate composable.
- Replacing the manual `bottomSentinelRef` with a CSS-only `padding-bottom` on the scroller (would simplify the `getFollowAnchor` fallback but changes scrollHeight semantics and risks regressions).
