# Tool UI Redesign Plan

This plan translates the audit findings into implementation work. It keeps the current architecture (`StepsPanel` + `ToolActivityView` + `ToolStepDetails`) and avoids a broad rewrite.

## Goals

1. Make tool rows immediately informative while staying compact.
2. Make streaming visible at the right level: row summary, expanded details, and group summary.
3. Make hover/click affordances consistent across all tool categories.
4. Make diff/edit/write/read panels feel like part of the active theme.
5. Preserve keyboard accessibility and inspector/file-open actions.

## Proposed Information Model

Each activity should expose three display layers:

| Layer | Purpose | Examples |
|---|---|---|
| Row summary | Always visible compact state | verb, target, status icon, short live metric, duration |
| Row live tail | Optional one-line result hint | `3 lines streamed`, last bash line, `12 matches`, `+24 -3` |
| Details panel | Full result/diff/log | read content, bash output, web results, diff |

This requires adding a derived `activity.inlineLiveSummary` / `activity.resultMetric` field in `tool-activity-view.ts`, based on `partialResult`, `result`, `changes`, and tool-specific details.

## Rendering Changes

### 1. Collapsed Row Content

Add a small secondary metric in collapsed rows:

- `bash`: last non-empty partial output line while running, or `N lines`.
- `read`: `14 lines read` or `8 of 14 shown`.
- `grep/find/glob/ls`: count when available.
- `web_search`: result count and fetch phase.
- `edit/write`: `+N -M`, already present.
- generic/MCP: first safe result line if short.

Keep this secondary line muted and non-wrapping. Do not dump large content into the title.

### 2. Streaming Result Visibility

For `tool:execution-update`:

- Keep full partial output in details.
- Add a row-level tail summary for running tools.
- For bash, show duration and latest line even when details are collapsed.
- For long output, avoid repeated full text diffs; derive counts and last line.

### 3. Batch / Group

Change group duration semantics:

- Display wall-clock span if child start/end times overlap.
- Optionally show sum as tooltip/inspector only.

Add group live status:

- `3 edits · +5 -3 · running 1`.
- `2 commands · latest: Compiling App.swift`.
- Do not stream full child output at group level.

### 4. Hover / Click Interaction

For group headers:

- Remove background hover.
- Change only text/icon color from muted to primary/accent.
- Keep dimensions stable: no font-weight, font-size, padding, gap, or layout changes on hover.
- Keep `focus-visible` outline for keyboard users.

For operation rows:

- Use the same no-background hover for rows that are simple expand controls.
- Keep tiny icon-button hover backgrounds for inspector/file actions only.
- Move chevron into the primary text cluster for file tools and grouped rows:
  `chevron + "Edited StepsPanel.vue" + stats + duration`
- Keep inspector icon after the primary cluster, not at the far right for narrow rows.

### 5. Details Animation

Keep the current height/opacity/translate animation, but tune:

- 160-200ms for rows with small text result.
- 220ms for diff panels.
- Respect `prefers-reduced-motion`.

### 6. Panel Visual System

Create shared panel tokens/components:

- `ToolInlinePanel`: border, background, radius, padding, max-height.
- `ToolCodePanel`: monospace output and line wrapping.
- `ToolDiffPanel`: uses same surface tokens, with diff-specific left rails.

Theme requirements:

- Use `--ui-tool-surface-*`, `--ui-tool-text-*`, and `--ui-tool-border-*` only.
- Avoid hard-coded warning/success/danger opacity mixes scattered across components.
- Make diff row fill more subtle; rely more on left rail and prefix color.
- Use 6-8px radius consistently.

### 7. Permission UI Alignment

Unify the composer permission panel with tool row state:

- Row shows `Needs approval`.
- Permission panel shows same icon, verb, target, and preview.
- For file mutations, allow opening diff preview directly from the permission panel.
- For long commands, expose full command in a collapsible code block or tooltip, not in title.

### 8. Custom Tool Shells

For `fart` or future custom renderers:

- Define `renderShell: 'self'` as an explicit opt-out.
- Still wrap custom shell in a shared status frame or provide a small shared header.
- If permission is impossible for that tool, do not render fake permission states in normal UI.

## Implementation Steps

1. Add `inlineLiveSummary`, `resultMetric`, and `groupWallDuration` to `ToolActivityView`.
2. Update `StepsPanel.vue` row layout so chevron belongs to primary text cluster.
3. Remove row/group background hover and replace with text/icon color changes.
4. Add compact row summaries for running/completed result-bearing tools.
5. Refactor `ToolResultRenderer` / `ToolDiffPreview` surfaces behind shared CSS utility classes or a small shared component.
6. Align `ChatPanel` permission panel with the same tool display model.
7. Add screenshot regression fixtures from `docs/tool-ui-audit` to a documented QA workflow.
8. Add unit tests for long command truncation, group wall-clock duration, and row live summaries.

## Acceptance Criteria

- Every built-in tool has screenshots for permission, completed, failed, expanded.
- Running bash shows elapsed duration and a live tail without expansion.
- Running edit/write still shows streamed content/diff promptly.
- Completed read/search/list tools expose a useful metric while collapsed.
- Group hover changes only text/icon color; no large hover background.
- Group arrow and text are visually adjacent.
- Operation row chevron is not stranded at the far right.
- Permission panel and tool row use the same title/target model.
- Long commands never expand row width and remain fully inspectable through expansion/tooltip/inspector.

