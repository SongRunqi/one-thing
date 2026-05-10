# Project Directories Module

`src/main/project-dirs/` is an independent subsystem that owns the
list of known project directories — paths the user (or the AI) has
worked in, with editable per-directory metadata.

It's deliberately separate from the variables subsystem so future
extensions (AI reflections, activity logs, tags) drop in without
churning unrelated code.

## Storage layout

```
~/.onething/project-dirs/
├── index.json                # lightweight: id ↔ path ↔ lastUsedAt
└── data/
    └── <id>.json             # per-project full record
```

- `<id>` is `sha256(canonical_path)[0..16]` — stable across renames
  of the *original* path string. The AI never sees the id.
- The index file makes "list all projects" O(1) (no file sweeps).
- Per-project files mean a single project's data can grow (notes,
  history) without inflating the listing path.
- Future scale-up: a single `<id>.json` can be promoted to a
  `<id>/` directory holding multiple files (e.g. `meta.json`,
  `notes.md`, `activity.jsonl`). The index format and the public
  store API don't change.

## Schema

```ts
interface Project {
  id: string                  // internal
  path: string                // user-input string (may contain ~)
  description: string
  addedAt: number
  lastUsedAt: number
  // Future optional fields:
  //   reflections?: Reflection[]
  //   tags?: string[]
  //   activityLog?: Activity[]
}
```

zod's `.optional()` keeps old persisted data forwards-compatible when
new fields are added. **No `version` field.** Destructive changes
(renames, semantic shifts) are handled by one-shot scripts under
`scripts/`, never by runtime version-branching logic.

## Public API

```ts
import { getProjectsStore, ProjectDirsTool, registerProjectDirsHandlers,
         buildProjectDirsPromptVars } from './project-dirs/index.js'

const store = getProjectsStore()

store.list()                                                    // ProjectIndexEntry[]
store.get(path)                                                 // Project | null
store.add({ path, description? })                               // Project
store.touch(path, fallbackDescription?)                         // Project (workdir hook)
store.update(path, { description })                             // Project | null
store.remove(path)                                              // boolean
store.subscribe(callback)                                       // () => void (unsubscribe)
```

## AI tool

Single tool `project_dirs` with action enum:

| Action | Inputs | Notes |
|---|---|---|
| `list` | — | Recently used projects, sorted desc by lastUsedAt |
| `get` | `path` | Full record (use when entering a project) |
| `add` | `path`, `description?` | Create or refresh lastUsedAt |
| `update` | `path`, `description` | Rename description |
| `remove` | `path` | Forget a project |

Future AI capabilities (e.g. notes/reflections) will add new actions
on this same tool. Once the action set passes ~10 consider splitting
into a focused sub-tool.

## Auto-link from `workdir`

Setting workdir on any session — whether by AI (`variable set
workdir=...`) or by the UI (`UPDATE_SESSION_WORKING_DIRECTORY` IPC)
— flows through `workdirGateway.write` in
`src/main/variables/gateways.ts`. That gateway calls
`getProjectsStore().touch(path, sessionName)`. The result:

- New project path → entry created with description = current session
  name (a sensible default the user/AI can later override).
- Existing path → `lastUsedAt` bumps; description preserved.

This is an explicit cross-module dependency (the variables module
imports the project-dirs module). Single funnel = consistent state.

## Prompt integration

Two Handlebars partials, included in `system-prompt.hbs` only when
tools are enabled:

- `partials/context/active-project.hbs` — renders when the current
  workdir matches a known project. Today it shows path + description.
  Future fields (reflections, etc.) extend this partial.
- `partials/context/known-projects.hbs` — renders the recently-used
  list with a one-line nudge: "switch via the variable tool before
  any file operation".

The variables subsystem's `# Context Variables` block does **not**
contain project_dirs — they belong here.

## IPC

| Channel | Purpose |
|---|---|
| `PROJECT_DIRS_LIST` | List all known projects |
| `PROJECT_DIRS_GET` | Full record for one project |
| `PROJECT_DIRS_ADD` | Create or refresh |
| `PROJECT_DIRS_UPDATE` | Rename description |
| `PROJECT_DIRS_REMOVE` | Forget a project |

Live updates piggyback on the existing `session:variables-updated`
event for now (no separate channel required); the store's
`subscribe()` is consumed by code that needs reactivity.

## Migration from legacy storage

Older builds kept project_dirs inside `variables.json` (alongside note
dirs). After upgrading, run once:

```bash
node scripts/migrate-project-dirs.mjs
```

The script:
1. Reads existing `~/.onething/variables.json`.
2. Sweeps `~/.onething/sessions/` to seed entries from session
   workingDirectory values.
3. Writes the new `~/.onething/project-dirs/{index,data/*}.json`.
4. Strips `project_dirs` (and obsolete `version`) from `variables.json`.

The runtime app **never calls this script.** If `~/.onething/project-dirs/`
doesn't exist when the app starts, it's treated as a fresh install
(empty list).

## Adding a new attribute (worked example: reflections)

When you want the AI to write reflection notes per project:

1. **types.ts**: add `reflections?: Reflection[]` to `Project`. Define
   `Reflection`. Update zod schema with `.optional()`.
2. **store/index.ts**: add `addReflection`, `listReflections`,
   `removeReflection` methods.
3. **tool.ts**: add `note_add` / `note_list` / `note_remove` actions.
4. **ipc.ts**: add 3 IPC handlers (if inspector needs UI editing).
5. **prompt.ts**: extend `buildProjectDirsPromptVars` to include
   `reflections` in `ActiveProjectVars`.
6. **active-project.hbs**: render a `## Recent reflections` section
   when present.

Old project files automatically gain the field as `undefined`. No
migration needed for additive changes. Done.
