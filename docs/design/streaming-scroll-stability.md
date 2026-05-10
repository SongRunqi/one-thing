# Streaming Scroll Stability

This note records the root causes and fixes for the chat view jitter seen while assistant messages stream markdown code blocks.

## Symptoms

- While following the bottom of the chat, streaming code blocks appeared to jump or flicker.
- After the large jump was reduced, the message action icons and timestamp still appeared to shake inside a stable footer element.
- The issue was most visible when code blocks grew line by line and when the user was close to the bottom.

## Root Causes

The problem was not a single rendering bug. Several small instability sources stacked together:

1. The previous virtualized list and visual-anchor follow logic fought with dynamically growing markdown/code content.
2. `ResizeObserver` based bottom pinning happened after layout, which left one visible frame where content had grown but `scrollTop` still pointed at the old bottom.
3. Streaming fenced-code parsing trimmed ordinary trailing newlines, so code blocks sometimes grew late by a full line.
4. Streaming code rendering rewrote more DOM than necessary, including lines whose text had not changed.
5. Code line height was `13px * 1.5 = 19.5px`, which made scrolling land on half pixels. Text and SVG icons then appeared to move inside otherwise stable elements.
6. Message actions and timestamps were hover-dependent, making footer state harder to observe and adding another visible state change near the follow anchor.

## Fixes

- Replaced `@tanstack/vue-virtual` in `MessageList.vue` with native rendering for stable chat layout.
- Added `useFollowScroll` as the single follow model:
  - follows the browser's natural scroll bottom;
  - uses real tail padding instead of a visual anchor gap;
  - combines `MutationObserver` and `ResizeObserver` so bottom pinning happens before a visible drift frame;
  - accepts small browser subpixel rounding instead of repeatedly writing `scrollTop`.
- Split streaming markdown into stable segments via `parseStreamingMarkdown`.
- Preserved ordinary trailing newlines in streaming fenced code blocks.
- Rendered code blocks with stable line DOM and CodeMirror/Lezer token spans.
- Avoided repainting completed code lines when their text did not change.
- Changed streaming code line height to an integer `20px`.
- Gave message footer, timestamp, and action buttons stable integer dimensions.
- Made message actions and timestamps always visible during investigation, removing hover visibility as a confounding variable.

## Verification

Unit coverage:

```bash
bun run test src/renderer/composables/__tests__/codeTokenizer.test.ts \
  src/renderer/composables/__tests__/parseStreamingMarkdown.test.ts \
  src/renderer/composables/__tests__/smoothStreamingText.test.ts \
  src/renderer/composables/__tests__/useFollowScroll.test.ts
```

Browser-level harness:

```bash
bun run test:streaming-scroll
```

The harness launches a real Electron `BrowserWindow`, mounts the real streaming markdown/code block path, simulates chunked code streaming, and records:

- code block remount count;
- unchanged line node replacements;
- distance to bottom;
- code block height and top movement;
- resize count and final samples.

The key regression signal before the follow fix was:

```text
maxDistanceToBottom: 91.5px
```

After the fixes the expected result is:

```text
ok: true
remounts: 0
unchangedLineNodeReplacements: 0
maxCodeTopJump: 0
```

Small `0.5px` bottom distance can remain because Chromium/Electron scroll positions are device-pixel rounded. The important property is that it stays stable rather than alternating across frames.
