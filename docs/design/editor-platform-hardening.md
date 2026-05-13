# Editor Platform Hardening Summary

Date: 2026-05-13

## Summary

This work turns the chat composer and file editing surfaces from textarea-style editing into a more production-ready editor platform. The main goal was to improve reliability without changing the chat wire format, message storage, EventBus flow, or streaming IPC contract.

The implementation keeps the backend protocol stable and concentrates changes in the renderer editor layer, file workbench, picker orchestration, and related IPC used by the file tree.

## User-Facing Improvements

- Chat input now uses a unified CodeMirror-based editor with stable focus, selection, replacement, height updates, and keyboard handling.
- `/`, `/cd`, `@file`, and `@files query` triggers are parsed by pure functions instead of textarea-specific regex replacement.
- File picker selection now has priority over the editor. Pressing Enter while the file picker is open selects the highlighted file instead of inserting a newline.
- IME composition is respected before send shortcuts, reducing accidental sends during Chinese input.
- Message editing, todo markdown editing, and file editing now share the same editor direction and profile model.
- File tree interactions no longer call browser-native `prompt()`, which is unsupported in the current Electron runtime.
- File tree context menus now support creating, renaming, deleting, and revealing files/directories in Finder.

## Editor Core

New editor core files live under `src/renderer/editor/`:

- `TextEditor.vue`: Vue wrapper around CodeMirror 6.
- `types.ts`: shared editor contracts such as `EditorHandle`, `EditorSettings`, and editor profiles.
- `extensions.ts`: CodeMirror extension assembly, settings normalization, compartments, theme, keymap, line wrapping, placeholder, history, and autocomplete wiring.
- `languages.ts`: language selection by explicit language or file path.
- `triggers.ts`: pure trigger parser and replacement helpers for command/file/path insertion.

`TextEditor` now uses CodeMirror `Compartment`s for dynamic reconfiguration. Changing read-only state, language, theme, wrapping, placeholder, completion, or tab size no longer destroys and recreates the `EditorView`. This preserves content, selection, and undo history more reliably.

The public editor handle supports:

- `focus()` / `blur()`
- `getValue()` / `setValue(value, options)`
- `getSelection()` / `setSelection(from, to?)`
- `replaceRange(from, to, text)`
- `scrollToTop()`
- `getCursorLineInfo()`

The wrapper also emits `selectionChange` and `transaction` so UI such as pickers can react to cursor movement, not only text changes.

## Composer And Picker Behavior

`InputBox.vue` now routes editor events through the unified editor handle. The picker orchestration was changed so trigger state is recalculated from editor transactions and selection changes.

The intended keyboard priority is:

1. IME composition
2. Visible picker keyboard handling
3. History navigation
4. Custom send shortcut
5. Legacy send shortcut
6. CodeMirror default behavior

This fixed the bug where selecting a file from `FilePicker` with Enter inserted a newline instead of inserting the selected `@file`.

Picker components now listen in the capture phase and stop propagation when they actually handle keyboard commands:

- `CommandPicker.vue`
- `FilePicker.vue`
- `PathPicker.vue`
- `SkillPicker.vue`

## File Workbench

`FilePanel.vue` now wraps `EditorWorkbench.vue`. The workbench uses Monaco for file editing and tracks open buffers, dirty state, cursor position, view state, markers, and conflict state.

File saving is currently whole-file save, not patch save:

- Renderer reads the full current model value.
- Renderer calls `saveFileContent(filePath, value, expectedMtimeMs)`.
- Main process writes the full file with `fs.writeFile`.
- `expectedMtimeMs` protects against overwriting a file changed on disk after it was loaded.

This means Monaco knows local edits incrementally, but the IPC save operation sends the complete file content.

## File Tree

The file tree no longer uses unsupported native prompts.

Changes:

- `TreeDirectory.vue` emits context-menu payloads instead of calling `window.prompt()`.
- `FileExplorer.vue` owns an application context menu and modal-style dialogs for create, rename, and delete.
- A new `Reveal in Finder` menu item calls `window.electronAPI.revealPath(path)`.
- Main process handles `file:reveal` with Electron `shell.showItemInFolder(path)`.

Relevant IPC additions:

- `FILE_REVEAL` in `src/shared/ipc/channels.ts`
- `revealPath()` in `src/preload/index.ts`
- `revealPath` type in `src/renderer/types/index.ts`
- `revealPath()` helper in `src/renderer/composables/useEditorWorkspace.ts`

## Settings And Dependencies

Editor settings live under `general.editor`:

- `tabSize`
- `lineWrapping`
- `syntaxHighlighting`
- `completionEnabled`
- `composerMaxHeight`

Defaults and clamp logic are centralized in `src/shared/defaults/settings.ts` so shared defaults and renderer runtime normalization do not drift apart.

Direct CodeMirror dependencies were declared explicitly. DOM-level tests added:

- `happy-dom`
- `@vue/test-utils`

`package.json`, `package-lock.json`, and `bun.lock` were kept in sync. `bun.lock` was regenerated from `package-lock.json` using `bun pm migrate --force` after `bun install --lockfile-only` stalled during dependency resolution.

## Tests Added Or Updated

Focused editor coverage includes:

- Trigger parser tests for `/`, `/cd`, `@file`, `@files`, cursor movement, mid-line triggers, and non-terminal commands.
- Input history helper tests for first/last line detection and multiline boundaries.
- DOM-level `TextEditor` tests for v-model, transactions, selection changes, `replaceRange`, read-only, language, and settings reconfiguration without recreating the editor DOM.
- Picker orchestration tests with mocked `EditorHandle`.
- File picker keyboard test proving Enter selects the highlighted file before the editor can insert a newline.
- File tree tests proving context menus no longer call native `prompt()`.
- File explorer test proving `Reveal in Finder` calls the new reveal path API.

## Verification

Successful focused checks:

- `bun run typecheck`
- `bun run typecheck:web`
- `bun run typecheck:node`
- `bun run build`
- Focused editor, picker, file tree, and file explorer tests
- `bun run dev` started successfully and launched the Electron app

Known full-test failures that are not editor-related:

- `better-sqlite3` native ABI mismatch: installed binary was built against a different Node module version.
- Existing sandbox test expectation mismatch: test expects an array pattern, current implementation sends `/other/*`.

## Boundaries

This work intentionally does not introduce:

- Rich text editing
- Collaborative editing
- LSP integration
- Diff editor save semantics
- Backend chat protocol changes
- EventBus or stream engine changes

The current editor platform is designed to make those future additions easier, but this pass stays focused on stable plain text, markdown, and code editing behavior.
