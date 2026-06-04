# UI Semantic Token Map

This map defines which semantic tokens each major UI surface should consume.
Theme palettes can change, but components should stay on these roles instead
of reaching directly for raw palette or accent variables.

## Surface Map

| Component area | Primary surface token | State surface tokens | Text and border tokens | Notes |
| --- | --- | --- | --- | --- |
| App shell | `ui.surface.app` | `ui.surface.overlay` | `ui.text.primary`, `ui.border.default` | Window-level backdrop only. It should not be used for nested cards just because it looks close in one theme. |
| Sidebar shell | `ui.sidebar.surface` | `ui.sidebar.itemHover`, `ui.sidebar.itemActive` | `ui.sidebar.item`, `ui.sidebar.itemMuted`, `ui.sidebar.header`, `ui.sidebar.action`, `ui.sidebar.actionHover`, `ui.sidebar.border` | Session list, sidebar actions, dates, counts, collapsed section headers, and "show more" belong here. Active text/icon should be readable neutral text, not accent text. |
| Tab bar | `ui.tabBar.surface` | `ui.tabBar.itemHover`, `ui.tabBar.itemActive` | `ui.tabBar.item`, `ui.tabBar.action`, `ui.tabBar.actionHover`, `ui.tabBar.divider`, `ui.tabBar.danger` | Tab bar is chat-panel chrome: it should visually belong to `ui.surface.chat`, not read as a separate panel strip. Active tab uses a subtle selected control surface with primary text. Close/split/inspector icons use tab-bar action tokens. |
| Chat window | `ui.surface.chat` | `ui.state.hover`, `ui.state.selected` | `ui.text.primary`, `ui.text.secondary`, `ui.border.divider` | The conversation panel and empty-chat backdrop belong to the chat surface. Nested cards, settings panes, and floating controls should stay on `ui.surface.panel`, `ui.surface.elevated`, or a more specific component token. |
| Composer | `ui.surface.input` | `ui.surface.inputFocus`, `ui.state.focus`, `ui.action.primary`, `ui.action.primaryHover`, `ui.action.disabled` | `ui.editor.text`, `ui.editor.placeholder`, `ui.editor.caret`, `ui.editor.selection`, `ui.border.focus` | Input focus, caret, selection, attachment controls, and send button should route through editor/action tokens. |
| Tooltip | `ui.surface.tooltip` | none | `ui.surface.tooltip.fg`, `ui.surface.tooltip.border`, `ui.surface.tooltip.shadow` | Tooltip background, text, border, shadow, and arrow must all read the same tooltip surface token family. |
| Message bubble | `ui.message.user`, `ui.message.assistant`, `ui.message.system`, `ui.message.error` | `ui.message.hover`, `ui.message.thinking` | `ui.message.*.fg`, `ui.text.primary`, `ui.text.secondary`, `ui.text.faint`, `ui.border.subtle` | User/assistant/system/error bubbles are message surfaces, not general panel/card surfaces. Inline code uses `ui.surface.codeInline`; code blocks use `ui.surface.codeBlock`. |
| Tool card | `ui.tool.surface` | `ui.tool.surfaceHover`, `ui.tool.surfaceSubtle`, `ui.tool.result`, `ui.tool.error`, `ui.tool.success` | `ui.tool.text`, `ui.tool.textMuted`, `ui.tool.textFaint`, `ui.tool.accent`, `ui.tool.accentOn`, `ui.tool.successText`, `ui.tool.dangerText`, `ui.tool.border` | Tool chrome stays on tool tokens. Diff add/delete backgrounds still belong to `diff.*`, success, or danger roles, not generic accent. |
| Settings window | `ui.surface.panel` | `ui.surface.elevated`, `ui.state.hover`, `ui.state.selected` | `ui.sidebar.surface`, `ui.text.*`, `ui.border.*` | Settings main panel should match the main app panel token; settings navigation/sidebar should match the main app sidebar token. |

## Role Boundaries

| Role family | Use for | Do not use for |
| --- | --- | --- |
| `ui.accent.*` | Focus rings, primary commands, tiny attention marks, links, and explicit accent affordances. | Sidebar active text, tab active text, normal icon color, inactive badges, ordinary timestamps, or whole neutral surfaces. |
| `ui.state.*` | Generic hover, active, selected, focus, disabled state overlays shared across components. | Component-specific surfaces when a more specific token exists, such as sidebar active or tab active. |
| `ui.status.*` | Danger, warning, success, info states and status copy. | App chrome, normal buttons, or neutral active selection. |
| `ui.tool.*` | Tool cards, tool result panes, command output, and tool diff chrome. | Chat bubbles, composer, sidebar, or tab bar. |
| `ui.message.*` | Chat message bubbles and message-local states. | Tool result cards or app-level panels. |
| `syntax.*` / `--hg-*` | Code highlighting only. | UI chrome, badges, buttons, regular body text, or tool cards outside code/diff content. |

## Built-In Theme Constraints

| Constraint | Expected behavior |
| --- | --- |
| Official palettes | A built-in theme may define palette colors and role mappings. It should not invent theme-specific pseudo-palette colors such as `nordSurface` when the official palette already covers the role. |
| Neutral active states | Sidebar and tab active states may be tinted by selected/accent-subtle backgrounds, but their foreground should remain a readable neutral text role. |
| Readable metadata | Sidebar section labels, dates, counts, "show more", muted icons, input placeholders, and tool metadata must remain readable against their owning surface. |
| Accent containment | Accent should not become the default color for all active labels, icons, neutral cards, or ordinary text. Components should use their local semantic role first. |

## Role Mapping Pipeline

Theme role mapping is a four-step process:

| Step | Responsibility |
| --- | --- |
| Palette / defs | Theme files provide official color material only, such as `nord0`, `base03`, `bgSubtle`, or Base46 `base_30/base_16`. |
| Surface role derivation | The resolver maps palette slots into `app`, `chat`, `sidebar`, `panel`, `elevated`, and `floating` surfaces, then repairs flattened roles when legacy or imported themes reuse one color for everything. |
| Component semantic roles | Component families consume specific tokens such as `ui.sidebar.surface`, `ui.tabBar.surface`, `ui.surface.chat`, `ui.surface.input`, `ui.message.user`, and `ui.tool.surface`. |
| CSS output | Runtime CSS vars expose both new semantic variables and legacy fallbacks. Components should prefer `--ui-*` variables; old `--bg-*` variables remain for gradual migration. |

Surface derivation follows this ladder:

| Role | Dark theme default | Light theme default |
| --- | --- | --- |
| `ui.surface.chat` | Raised content surface above the app/sidebar canvas. | Raised content surface above the app/sidebar canvas. |
| `ui.sidebar.surface` | App canvas surface for sidebar navigation content; may match `ui.surface.app`. | App canvas surface for sidebar navigation content; may match `ui.surface.app`. |
| `ui.surface.panel` | Container chrome for settings and panels; may match chat when the chat window is the primary content panel. | Container chrome for settings and panels; may match chat when the chat window is the primary content panel. |
| `ui.tabBar.surface` | Chat-panel chrome surface; should visually belong to chat, not form a third panel layer. | Chat-panel chrome surface; should visually belong to chat, not form a third panel layer. |
| `ui.surface.elevated` | Cards, local controls, input focus, and hover containers. | Cards, local controls, input focus, and hover containers. |
| `ui.surface.floating` | Popovers, menus, and modal surfaces. | Popovers, menus, and modal surfaces. |

When a theme has `app/sidebar == chat`, the resolver first looks for an existing official palette candidate such as `panel`, `sidebar`, `elevated`, or `floating` to create the raised chat content surface. If no distinct candidate exists, it derives a small neutral step from the theme text color and background. The tab bar then inherits the chat-panel surface so it reads as panel chrome rather than a separate strip. This repair is a system rule, not a per-theme special case.
