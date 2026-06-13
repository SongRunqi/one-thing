# Tool Call UI Audit

Date: 2026-06-10

This audit covers the current tool-call UI rendered by `StepsPanel.vue`, including `read`, `edit`, `write`, `bash`, search/file tools, web tools, `variable`, `todo_plan`, `time`, `project_dirs`, `skill`, `fart`, and a generic MCP call. Screenshots and a per-state index are in [SCREENSHOT_INDEX.md](./SCREENSHOT_INDEX.md).

## Method

- Built a reusable audit harness under `docs/tool-ui-audit/` that mounts the real Vue components, not a rewritten mock surface.
- Generated 82 individual scenario screenshots plus 4 contact sheets under `docs/tool-ui-audit/screenshots/`.
- Covered each tool in four states: waiting permission, completed, failed, expanded.
- Added flow screenshots for tool-input streaming, permission waiting, bash running output, completed output, and write content streaming.
- Verified the harness with `npm exec vite -- --config docs/tool-ui-audit/vite.config.mts build --outDir /tmp/tool-ui-audit-dist --emptyOutDir`.

Important limitation: the screenshots use deterministic fixture events so every state is reachable. I also inspected the real stream/event code paths to verify timing behavior, but I did not drive a live model session for every tool.

## Key Findings

1. Collapsed completed rows mostly render title/status only. Result content is not visible until expansion for almost every tool.
2. `edit` / `write` are the only tools with meaningful parameter-stream rendering. During `input-streaming`, they parse `streamingArgs` and render a synthetic added-lines diff.
3. Bash and generic result streaming are not surfaced in the row. Partial output appears only when the row is expanded.
4. Batch/group UI has duration and aggregate diff stats, but no group-level result stream. The group duration is a sum of child durations, not necessarily wall-clock time.
5. Long command titles are truncated before display. This prevents full-command title blowups, but also makes inspection dependent on expansion/inspector.
6. The edit group hover affordance is too weak for discoverability and still uses a faint background fill.
7. Operation-row arrows are far right because of the action column; the user request wants arrow/text grouped together on the left.
8. `fart` bypasses the shared tool timeline surface entirely, so permission/failed/expanded states do not align with the rest of the tool UI.
9. The permission action panel is separate from tool rows and uses its own warning panel styling. It is theme-tokenized, but visually not the same system as the tool timeline.

## Rendering Logic

### Row Title / Target

Rows are built from `buildToolActivityViews()` and rendered in `StepsPanel.vue`. The visible title is assembled from a verb plus `activity.target`:

- `StepsPanel.vue:110-119` renders `node-action` + `node-target-name`.
- `tool-display.ts:137-148` chooses `Run/Running/Ran`, `Read/Reading/Read`, etc.
- `tool-preview.ts:84-224` formats per-tool one-line previews.

This means the row is mostly a compact summary. It does not automatically render `content`, `result`, or `partialResult` in the collapsed row.

### Streaming Args

The stream processor creates a placeholder `ToolCall` with `status: 'input-streaming'` and an empty `streamingArgs` string at `stream-processor.ts:228-272`. Deltas are sent separately at `stream-processor.ts:280-292`, and renderer-side code batches/flushes them into the canonical tool call at `chat.ts:348-388`.

For `edit` / `write`, `tool-step-view.ts:498-557` parses `streamingArgs` and extracts `content` or `newText`; `tool-step-view.ts:319-338` converts that content to added diff rows. `shouldDefaultExpand()` at `tool-step-view.ts:220-226` auto-expands only `write` and `edit` while `streaming-input`.

Result: during argument streaming, `edit`/`write` show content promptly once parseable content appears. Other tools generally show only a title/preview and spinner.

### Execution Result Streaming

Tool execution partials are emitted at `tool-execution.ts:424-431` and patched into renderer state at `chat.ts:1079-1084`. `ToolStepDetails.vue:46-80` renders `partialResult`, live output, or final result only inside expanded details.

Bash running output works, but only inside an expanded row. `tool-step-view.ts:359-371` also truncates live output to the last 8 lines, so long-running linear output does not show the full growing log in the inline detail pane.

### Completion

Final results are patched at `tool-execution.ts:487-500`; rows move to `completed`, but the collapsed surface remains a title/target/stats/duration summary. The content remains hidden behind expansion.

## Per-State Behavior

### Waiting Permission

Timeline row:

- Shows warning icon and base verb (`Run`, `Read`, `Edit`, etc.).
- Hides duration via `getActivityMetaText()` when status is awaiting confirmation (`StepsPanel.vue:430-437`).
- Does not auto-expand the pending diff for `edit` / `write`.

Composer permission panel:

- Rendered separately in `ChatPanel.vue:32-116`.
- Styled separately at `ChatPanel.vue:607-720`.
- Title generation comes from `buildToolPermissionTitle()` in `tool-display.ts:191-223`.

Problem: users must connect two visual elements: the row that says a tool needs approval and the composer-level permission panel that contains the action buttons.

### Completed

Most tools show just one compact row. For `read`, this means the user cannot see freshly read content unless they expand. For `grep/glob/find/ls/web_*`, completed rows also do not expose result counts or first result unless a specialized target string happens to include it.

### Failed

Failures default-expand via `shouldDefaultExpand()` (`tool-step-view.ts:220-226`). This is good. The current error summary is short and usually visible, but detailed error text is sometimes hidden behind a `Details` element when the first-line normalized reason matches the full error (`ToolStepDetails.vue:183-193`).

`edit` has a special failed UI for missing old text (`ToolStepDetails.vue:3-15` and `140-151`), which is useful but visually separate from the general error language.

### Expanded

Expanded details are useful, but inconsistent:

- `read` caps the initial visible content to 8 lines (`ToolResultRenderer.vue:116`, `181-186`) and adds a `more` button.
- `bash` has a custom line classifier for command/result/done (`ToolResultRenderer.vue:187-213`).
- `web_*` uses a specialized renderer when structured details exist (`ToolResultRenderer.vue:171-179`).
- Other tools fall back to plain `pre`.

## Batch / Group Behavior

Consecutive same-category tools are grouped in `StepsPanel.vue:258-274`. Groups show:

- Count: `3 edits`.
- Aggregate diff stats: `+5 -3`.
- Duration: from `getGroupDuration()` at `StepsPanel.vue:488-495`.

Problems:

- Duration is a sum of child durations. For parallel tools, this can overstate elapsed wall time.
- Group rows do not stream child results. A running group shows only summary/status unless expanded.
- Group expansion reveals child rows; it does not automatically reveal child results. This is a reasonable default, but the click affordance is subtle.

## Long Command / Title Behavior

For bash:

- `tool-preview.ts:9-11` sets `BASH_PREVIEW_MAX = 96`.
- `tool-preview.ts:110-113` truncates command preview.
- The row then ellipsizes again through `.node-target` CSS (`StepsPanel.vue:862-871`).
- Permission panel also truncates bash command at 96 chars (`tool-display.ts:191-195`).

Answer to the long-title question: no, a very long command is not fully stuffed into the title. It is truncated before row layout, then constrained by row width. The tradeoff is that full command inspection requires expansion or inspector.

## UI / Interaction Issues

### Hover

Current group hover:

- `.group-header:hover` changes text color (`StepsPanel.vue:703-708`).
- `.group-header:hover` also applies faint background (`StepsPanel.vue:782-784`; active background at `StepsPanel.vue:787-789`).
- It does not change font size or position, which is good.

Issue: the hover signal is too subtle in dark theme, and the background fill still exists. The user-requested behavior should be text/icon color only, with no large background.

### Arrow Placement

Group arrow is already left and near text (`StepsPanel.vue:45-60`). Operation-row expand arrow is in `.operation-actions` at `StepsPanel.vue:129-153`, which is aligned at the far right of the row grid. This conflicts with the requested design for edit-like groups where the arrow should visually belong with the text.

### Expansion Feedback

Expansion animation exists (`StepsPanel.vue:981-1002`) and is visible. The issue is not absence of animation; it is weak affordance before click and inconsistent arrow placement after click.

### Panel Styling

The diff/result panels use tool tokens (`--ui-tool-*`) and theme variables, but the visual language still feels like a separate embedded panel:

- Diff panel has strong colored row fills and a framed code surface.
- Generic result panels use `pre` blocks with a subtly different surface.
- Permission panel uses warning tokens and a 12px card radius, visually separate from the inline tool timeline.

The system is tokenized, but not yet unified.

## Priority Problems

1. Result visibility: completed and running tools hide content by default, so users cannot see whether useful result content is arriving unless they expand.
2. Streaming result discoverability: bash/result partials work but are hidden in details; the row does not show a small live tail or “N lines streamed”.
3. Batch semantics: group duration sums child durations and group result streaming is absent.
4. Hover/expand affordance: group hover should become text/icon color only and more legible.
5. Arrow placement: operation expand arrows should sit with the primary text for compact file-tool rows/groups.
6. Fart/custom tool shell inconsistency: custom shell should still expose shared status/permission affordances or opt out explicitly.
