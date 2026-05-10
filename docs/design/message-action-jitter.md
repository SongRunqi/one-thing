# Message Action Jitter

This note records why message action icons and timestamps appeared to move up and down even when their outer footer element looked stable.

## Symptom

During assistant streaming, the message footer block did not visibly remount or change size, but the contents inside it did:

- action icons appeared to move vertically;
- timestamp text appeared to shake in the same way;
- the effect was most visible while code blocks were growing line by line.

## Cause

The action/footer block was not the primary thing jumping. The visible jitter came from subpixel text and SVG rendering.

The old streaming code block line height was:

```text
13px * 1.5 = 19.5px
```

Each new code line could therefore grow the message by a half-pixel amount. While the chat was following the bottom, the scroll position had to compensate for that growth. This propagated half-pixel coordinates down to the footer area.

Small text and SVG icons are sensitive to half-pixel placement. When their baseline or viewport position lands on alternating subpixel coordinates, Chromium/Electron anti-aliasing can repaint them slightly differently. The outer element can look unchanged while the glyphs and icons inside appear to move.

In short:

```text
19.5px code line growth
  -> subpixel scroll compensation
  -> footer rendered on half-pixel coordinates
  -> timestamp and SVG icons appear to jitter
```

## Non-Causes

The final diagnosis was not:

- action component remounting;
- action DOM being recreated every token;
- footer height changing on every frame;
- hover-only visibility alone.

Those could make debugging harder, but the persistent "inner icon/text shake" matched subpixel rendering.

## Fix

The fix was to make the moving pieces land on stable integer dimensions:

- code line height changed to `20px`;
- `.code-line` min-height changed to `20px`;
- message footer uses a stable `28px` minimum height;
- timestamp uses `line-height: 28px`;
- action button uses `width/height/line-height: 28px`;
- SVG icons use `display: block`;
- timestamp uses `font-variant-numeric: tabular-nums`;
- follow scroll accepts tiny Chromium rounding error instead of repeatedly writing `scrollTop`.

The important distinction is that Chromium may still report a `.5px` scroll position due to device-pixel rounding, but the content should no longer alternate between different baselines. Stable subpixel position is acceptable; oscillating subpixel position causes visible jitter.

## Verification

The Electron streaming harness should remain green:

```bash
bun run test:streaming-scroll
```

Relevant signals:

```text
remounts: 0
unchangedLineNodeReplacements: 0
maxCodeTopJump: 0
codeHeight: integer growth
```

The key observation for this issue is that `codeHeight` should grow in integer steps after the fix, rather than values such as `274.5` or `313.5`.
