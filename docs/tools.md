# Tool API

This document records the AI-facing built-in tool interfaces. Keep it in sync with `src/main/tools/builtin/*` whenever a tool schema changes.

## `edit`

Edit a single existing file using exact text replacements.

```ts
edit({
  path: string,
  edits: Array<{
    oldText: string,
    newText: string,
  }>,
})
```

Rules:

- `path` may be relative or absolute.
- `edits` must contain at least one replacement.
- Every `edits[].oldText` must match exactly one region in the original file.
- All `oldText` values are matched against the original file, not incrementally after earlier edits are applied.
- Edits must not overlap. Merge nearby edits into one replacement, and represent distant edits as separate entries in `edits`.
- `oldText` must not be empty.
- `newText` must produce a real content change.
- `edit` does not create files or replace whole files; use `write` for new files and complete rewrites.
- If exact matching fails, read the latest file content and retry with updated `oldText`.

Example:

```json
{
  "path": "src/example.ts",
  "edits": [
    {
      "oldText": "const enabled = false\n",
      "newText": "const enabled = true\n"
    },
    {
      "oldText": "export const name = 'old'\n",
      "newText": "export const name = 'new'\n"
    }
  ]
}
```

Implementation notes:

- Preview and apply share the same exact edit engine.
- The engine preserves BOM and original line endings.
- PermissionPolicy approval is followed by file hash revalidation before writing.
- The analyze/preview/permission/write plan runs through centralized PermissionPolicy and then inside a file-level mutation queue for the target path.
- Large deletions are not hard-blocked by the edit engine; they are classified as destructive edits for permission-mode handling.

## `write`

Create or completely overwrite a file.

API:

```ts
write({
  path: string,
  content: string,
})
```

Rules:

- Use `write` for new files or intentional complete rewrites.
- Do not use `write` for small targeted modifications; use `edit` instead.
- The current implementation creates parent directories if needed and revalidates the target against the PermissionPolicy-approved preview before writing.
- The analyze/preview/permission/write plan runs through centralized PermissionPolicy and then inside a file-level mutation queue for the target path.

Implementation notes:

- Uses the Pi-style shape `write({ path, content })`.
- Shares file mutation serialization and preview/revalidation behavior with `edit`.
- Successful `edit`/`write` calls record file mutation audit snapshots with before/after content, hashes, diff, and metadata.
- Backend undo can restore a snapshot only when the current file still matches the recorded after-hash.
- `rollbackFile({ auditPath })` IPC is available for hash-revalidated rollback.
- Completed edit/write diff cards expose a rollback action when audit metadata is available.

## `read`

Read the contents of a file. Supports text files and images; images are sent as attachments.

```ts
read({
  path: string,
  offset?: number,
  limit?: number,
})
```

Rules:

- `path` may be relative or absolute.
- Relative paths are resolved against the session work directory.
- Read-only operations should auto-run in Normal mode.
- Sensitive files such as `.env`, `.env.local`, private keys, and certificate bundles require permission before reading. Common templates like `.env.example` and `.env.sample` are allowed.
- Text output is returned without synthetic line numbers so it can be copied into `edit.oldText` exactly.
- Text output is truncated to 2,000 lines or 50KB, whichever is hit first.
- Use `offset`/`limit` for large files. When the full file is needed, continue with the `offset` reported by the read result.

## `find`

Search for files by glob pattern.

```ts
find({
  pattern: string,
  path?: string,
  limit?: number,
})
```

Rules:

- `pattern` is a glob such as `*.ts`, `**/*.json`, or `src/**/*.spec.ts`.
- `path` is a directory to search; omit it to use the current work directory.
- Output paths are relative to the search directory.
- Respects `.gitignore`, includes dotfiles, and truncates at 1,000 results or 50KB by default.

## `ls`

List directory contents.

```ts
ls({
  path?: string,
  limit?: number,
})
```

Rules:

- `path` is a directory to list; omit it to use the current work directory.
- Output is sorted alphabetically and includes dotfiles.
- Directories are suffixed with `/`.
- Output truncates at 500 entries or 50KB by default.

## `grep`

Search file contents for a pattern.

```ts
grep({
  pattern: string,
  path?: string,
  glob?: string,
  ignoreCase?: boolean,
  literal?: boolean,
  context?: number,
  limit?: number,
})
```

Rules:

- `pattern` is a regex by default; set `literal: true` to search literal text.
- `path` is a directory or file to search; omit it to use the current work directory.
- `glob` filters candidate files, for example `*.ts` or `**/*.spec.ts`.
- Output uses `path:line: text` entries with paths relative to the search directory.
- Output truncates at 100 matches or 50KB by default, and long lines truncate to 2,000 characters.

## `bash`

Run a shell command.

```ts
bash({
  command: string,
  timeout?: number,
})
```

Rules:

- Commands run in the backend-provided session work directory.
- Bash has no AI-facing cwd parameter. To change the default project for future bash and file tools, set the session work directory first.
- Prefer read/ls/find/grep tools for file inspection when available.
- Read-only commands such as `ls`, `cat`, `grep`, `git status`, and `git diff` may auto-run in Normal mode.
- Mutating or unknown commands go through permission-mode policy.
- Permission prompts support once/session/workspace scoped grants; the default Allow action remains once.
- Forbidden commands such as `sudo`, shutdown/system service commands, and dangerous shell patterns like `curl ... | sh` are denied by the classifier.
- Chained commands are classified segment-by-segment; any denied segment denies the whole command, and any mutating/unknown segment makes the whole command ask.

Implementation notes:

- Current classifier is a lightweight multi-command parser in `src/main/tools/core/bash-classifier.ts`.
- The classifier interface is designed so it can later be swapped to a tree-sitter-bash parser, following the OpenCode direction.
- Pi's bash implementation is the reference for execution reliability. Current implementation now includes process-tree killing, bounded output accumulation, full-output temp files for truncated output, ANSI/control-character sanitization, and throttled Pi-style partial result updates for live output. Structured partial results are stored on `Step.partialResult` and rendered as live output while the tool is running.
