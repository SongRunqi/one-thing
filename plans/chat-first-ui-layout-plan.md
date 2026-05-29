# Chat-first UI Layout Plan

## Status

- Direction selected: **B — Chat-first layout**
- Current stage: **Phase 1 implemented with layout-bound continuous docking motion / awaiting visual review**
- Code changes made for this UI refactor: **Yes — Phase 1**
- This document will be used as the progress tracker during implementation.

## Progress Tracker

| Step | Status | Notes |
| --- | --- | --- |
| Explore current UI layout | Done | Reviewed `App.vue`, `ChatContainer.vue`, `ChatWindow.vue`, `TabBar.vue`, `Sidebar.vue`, `SidebarHeader.vue`, `ChatPanel.vue`, `MessageList.vue`, `InputBox.vue`, `MediaPanel.vue`, `ChatInspectorPanel.vue`. |
| Select target direction | Done | User selected Chat-first layout. |
| Clarify Sidebar action behavior | Done | Toggle/Search/New belong to Sidebar; they migrate to ChatTopBar only when Sidebar is hidden. |
| Clarify Project/File tab position | Done | Project Workbench and File tabs remain in the top row, to the right of the Chat title. They do not move below the title. |
| Define migration animation | Done | Motion contract clarified: push-based layout reflow, constant size, constant vertical alignment, horizontal-only movement, no fade/scale/overlay feeling. |
| Implement Phase 1 | Done | Added shared `SidebarActionGroup`; removed old app toolbar; action group now uses one layout-bound docked control whose `left` tracks Sidebar width while ChatTopBar reserves tab space. |
| Phase 1.5 visual clarification | Rolled back | Screenshot review showed the `Chats` title, pill group, and separator felt awkward. Reverted those visual additions while keeping the structural Phase 1 migration. |
| Continuous docking motion | Done | Replaced ghost clone with one fixed action group whose `left` tracks Sidebar width; ChatTopBar reserved slot now animates width so tabs reflow smoothly rather than jumping or being covered. |
| Test layout states | In progress | Typecheck passed. Visual review still needed for sidebar expanded/collapsed/floating/media/inspector/split states. |
| Media panel push-layout contract | Superseded / implemented as main workspace | Media/Memory/Tasks are launched from a Sidebar actions area and render in the main content region instead of expanding as a left-side panel. |
| Active tab surface cleanup | Done | Removed concave/notch active-tab corner treatment; active tab now uses a lightweight filled active state integrated with the toolbar. |
| Tab grouping | Done | Chat tabs and resource tabs are visually grouped with a thin vertical divider; Agent selector remains a separate right-aligned pill/dropdown. |
| Sidebar workspace actions | Done | Added Memory/Media/Tasks action area above the session list; active action uses theme fill and opens the corresponding main workspace panel. |
| Polish composer/inspector/media | In progress | Media panel is now reusable in main workspace mode; composer visual weight was reduced; visual review still needed. |

## Selected Direction

We will use **方案 B：Chat-first 布局**.

The app should feel primarily like a focused AI chat product. Advanced capabilities such as tools, project workbench, file tabs, split panels, media, and inspector should remain available, but they should be organized around the main chat experience rather than competing with it.

## Corrected Target Layout

The high-level layout remains:

```txt
Sidebar | Main Chat | Inspector Drawer
```

The main chat area is:

```txt
ChatTopBar
Message List
Composer
```

However, the top bar must preserve the current project/file tab behavior:

```txt
ChatTopBar row:
[optional Sidebar Action Group] [Chat Title Tab] [Project Workbench Tab] [File Tab] ... [Agent] [Split] [Inspector]
```

Important correction:

- Project Workbench / File tabs stay in the **same top row** as the chat title.
- They stay to the **right of the chat title**.
- They are not moved below the title.

## Sidebar Action Group Rule

The following actions are considered **Sidebar actions**:

```txt
[Sidebar Toggle] [Search] [New Chat]
```

They should live in the Sidebar when the Sidebar is visible.

### Sidebar expanded

```txt
Sidebar Header: [Toggle] [Search] [New]
ChatTopBar:     [Chat Title] [Project Tab] [File Tab] ... [Agent] [Split] [Inspector]
```

### Sidebar collapsed / hidden

```txt
ChatTopBar: [Toggle] [Search] [New] [Chat Title] [Project Tab] [File Tab] ... [Agent] [Split] [Inspector]
```

### Floating Sidebar visible

Rule:

```txt
If Sidebar is visually visible, Sidebar Action Group belongs in Sidebar.
```

So when floating sidebar is visible, the action group should be in the floating sidebar header, not duplicated in ChatTopBar.

## Sidebar Toggle Motion Contract

The Sidebar uses a **push-based layout transition**, not an overlay behavior.

The Sidebar Action Group should feel physically connected to the Sidebar width and the main content tab bar. The UI should feel structurally connected, as if all elements share the same physical layout space.

### When Sidebar collapses

- Sidebar width smoothly shrinks.
- The action group starts at the top-right corner of the Sidebar.
- The action group smoothly translates left as the Sidebar shrinks.
- The movement should feel connected to the shrinking Sidebar width.
- It should appear as if the main content tab bar is reclaiming layout space and gently pushing the action group toward the macOS traffic lights.
- Chat/project/file tabs should be pushed aside by reserved layout space, not covered by the action group.

### When Sidebar expands

- Sidebar width smoothly grows.
- The action group is pushed back toward the far right edge of the Sidebar.
- The main content tab bar is pushed rightward at the same time instead of being overlapped.
- The action group returns to its original top-right Sidebar position.

### Invariants

The action group must:

- maintain constant size;
- maintain constant vertical alignment;
- preserve its top padding relative to the macOS traffic lights;
- animate horizontally only;
- avoid scale changes;
- avoid opacity fade;
- avoid vertical drift;
- avoid an overlay/floating feeling.

### Main Panel / Tab Bar Reflow Contract

The tab bar in the main panel should animate as part of the same layout reflow, not as a simple overlay or pure translate animation.

When the Sidebar expands:

- the main panel's leading edge should be pushed to the right by the growing Sidebar;
- the tab bar should horizontally resize/reflow within the remaining content area;
- the visual effect should feel like the Sidebar is pushing the tab bar outward from the left;
- Chat/Project/File tabs should move because layout space is changing, not because they are independently translated.

When the Sidebar collapses:

- the main panel's leading edge moves left as Sidebar width shrinks;
- the tab bar reflows back into the reclaimed space;
- the tabs should not jump, fade, or be covered by the action group.

Implementation note:

- The Sidebar width transition and the top-bar reserved-slot width transition must use matching duration/easing.
- The first tab's horizontal position should effectively be the sum of `sidebarWidth + reservedSlotWidth`.
- This creates coordinated motion: as Sidebar width grows, reserved top-bar width shrinks; as Sidebar width shrinks, reserved top-bar width grows.

### Motion qualities

The motion should communicate:

- shared layout space;
- coordinated motion;
- physical UI structure;
- layout reflow;
- spatial compression;
- adaptive UI redistribution.

It should **not** feel like a detached floating element animating independently.

Animation references:

- macOS native sidebar transitions;
- Linear / Arc browser style layout motion;
- spatially-aware UI transitions;
- spring-like horizontal reflow.

Preferred animation characteristics:

```txt
smooth easing
slight inertia
no scaling
no opacity fade
no vertical drift
no overlay feeling
```

### Implementation approach

- Render one docked action group at the app/titlebar layer.
- In expanded state, compute `left` from Sidebar width: `sidebarWidth - actionGroupWidth`.
- In collapsed state, compute `left` from the collapsed traffic-light dock position.
- Animate only `left` using the same duration/easing as Sidebar width.
- Keep `top` fixed.
- Animate the ChatTopBar reserved slot width in sync with Sidebar width so tabs reflow smoothly instead of jumping or being covered.

Recommended timing:

```txt
duration: ~300ms
easing: same as Sidebar width transition
```

## Current Layout Before Refactor

Current layout is closer to:

```txt
App floating toolbar: [Sidebar] [Search] [New Chat]

Sidebar | ChatWindow | Inspector
          └─ TabBar:
             [Chat Title Tab] [Project Workbench Tab] [File Tab] ... [Agent] [Split] [Inspector]
          └─ MessageList
          └─ Composer
```

Current issues:

1. `Sidebar/Search/New Chat` are rendered as an app-level floating toolbar in `App.vue`.
2. Sidebar top header is mostly traffic-light spacing and does not own the primary Sidebar actions.
3. `TabBar.vue` mixes workspace tabs with chat/session controls and panel controls.
4. MediaPanel, Sidebar, Chat, and Inspector can all compete as major horizontal panels.
5. Composer has strong glass/blur/shadow styling and can visually dominate the message area.

## Intended Layout After Refactor

### Sidebar expanded

```txt
┌────────────────────────────┬──────────────────────────────────────────────────────┐
│ Sidebar                    │ ChatTopBar                                           │
│ [Toggle] [Search] [New]    │ [Chat Title] [Project Tab] [File Tab] ... [Actions] │
├────────────────────────────┼──────────────────────────────────────────────────────┤
│ Sessions                   │ Message List                                         │
│                            │ Composer                                             │
└────────────────────────────┴──────────────────────────────────────────────────────┘
```

### Sidebar collapsed

```txt
┌───────────────────────────────────────────────────────────────────────────────────┐
│ ChatTopBar                                                                        │
│ [Toggle] [Search] [New] [Chat Title] [Project Tab] [File Tab] ... [Actions]      │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Message List                                                                      │
│ Composer                                                                          │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## Active Tab Surface Contract

The selected Chat/Project/File tab should retain roundedness and a soft active surface, but it must not visually merge with the header background.

Requirements:

- selected tab's rounded corners belong only to the tab itself;
- right-side tab bar/header background remains clean and flat;
- no concave corner;
- no curved notch;
- no visual merge between selected tab and header;
- active state should rely primarily on subtle fill, not strong outline;
- active tab should remain lightweight and integrated with the toolbar, not read as an alert/focus ring/heavy button.

Implemented:

- Removed active-tab pseudo-element corner cutouts from `TabItem.vue`.
- Active tab now follows the provided reference style more closely: theme-tinted fill, 500 font weight, no active outline, no shadow.
- Removed accent/orange outline/focus-like ring treatment so it does not read as an alert/button/focus state.
- Inactive tab dividers and drag-over indicators use neutral border colors instead of accent/orange colors.
- `TabBar.vue` tab list spacing was adjusted so tabs sit as independent surfaces.

## Tab Grouping Contract

Conversation location and attached resources are different concepts and should be visually grouped.

- Chat/current conversation tabs live on the left side of the tab list.
- Resource tabs — project workbench, files, scripts, codebase context — live to the right of the conversation group.
- A thin vertical divider (`~0.5px`) separates the conversation group from the resource group.
- The divider should be low contrast and only communicate grouping, not create a heavy boundary.
- Active state uses fill + medium text weight, not a strong outline.
- Tabs use tighter gaps (`4px`) and padding for click area rather than large external spacing.
- Tab width is content-driven with min/max constraints instead of fixed-width tabs.
- Icons use a consistent size/stroke and follow text color in active state; inactive icons stay secondary.
- Agent selector is not a navigation tab; it is a dropdown selector, right-aligned in its own light pill style.

## Sidebar Workspace Actions / Main Workspace Panel Contract

Memory, Media, and Tasks are no longer launched from a bottom-left media button or a left-side expanding panel. They are workspace-level actions that live above the session list and open in the main content region.

### Sidebar actions area

- Place a new actions area above the temporal session groups, inside the same `SessionList` scroll panel.
- Actions are vertically stacked rows.
- Each row uses one icon + one title in a single horizontal line.
- Actions: `Memory`, `Media`, `Tasks`.
- Active action uses theme-tinted fill, not outline.
- This area is conceptually separate from the chronological session list below it, but visually belongs to the same Sidebar panel and uses the same scrollbar.

### Opening behavior

- Clicking an action opens the corresponding workspace panel in the main window/content area.
- The panel replaces the chat workspace while active; it does not expand from the far-left edge.
- Clicking the active action again closes the workspace panel and returns to chat.
- The Sidebar remains visible; no forced Sidebar collapse is required.

Preferred mental model:

```txt
Sidebar
  Workspace actions: Memory / Media / Tasks
  Session list

Main content
  Chat workspace OR selected workspace panel
```

## Component Responsibility After Refactor

### SidebarActionGroup

Owns Sidebar-related actions:

- Sidebar toggle
- Search
- New chat

Implementation note: the action group is rendered once as a docked titlebar-layer control. It visually belongs to the Sidebar when expanded and docks into the ChatTopBar space when collapsed, but it should feel like one layout-bound element moving horizontally with Sidebar width.

### SidebarHeader

Provides the Sidebar's traffic-light/titlebar vertical context. It no longer renders a separate copy of the action group.

### ChatTopBar / existing TabBar

Owns the single top row of the main chat/workspace area.

Contains:

- reserved SidebarActionGroup slot when Sidebar is collapsed or transitioning;
- Chat title tab;
- Project Workbench tab;
- File tabs;
- Agent selector;
- Model/thinking entry if retained there;
- Split/equalize/close panel controls;
- Inspector toggle.

The reserved slot is layout-only: it pushes tabs aside so the moving action group never covers them.

### WorkspaceTabStrip / existing TabBar logic

Keeps current tab behavior:

- Chat tab
- Project workbench tab
- File tabs
- Drag/reorder/close tab behavior
- Active tab state

The first implementation can keep the existing `TabBar.vue` and gradually reshape it. A later cleanup can split it into `ChatTopBar.vue` + `WorkspaceTabStrip.vue`.

### ChatInspectorPanel

Later phase: visually becomes a drawer rather than a competing full-height main panel.

### InputBox / Composer

Later phase: reduce visual weight by softening blur, shadow, and focus glow.

## Implementation Phases

## Phase 1: Move Sidebar Action Group to layout-bound ownership

Goal: improve structure without breaking chat tabs or file/workbench behavior.

Changes:

1. Create/extract `SidebarActionGroup.vue`.
2. Remove the old floating `app-toolbar` from `App.vue`.
3. Render one docked action group at the app/titlebar layer.
4. Position it from Sidebar width when expanded and from the collapsed dock position when collapsed.
5. Reserve layout space in `TabBar.vue` while collapsed/transitioning so tabs reflow instead of being covered.
6. Keep Project Workbench and File tabs in the current top row.

Likely files:

- `src/renderer/App.vue`
- `src/renderer/components/sidebar/Sidebar.vue`
- `src/renderer/components/sidebar/SidebarHeader.vue`
- `src/renderer/components/ChatContainer.vue`
- `src/renderer/components/chat/ChatWindow.vue`
- `src/renderer/components/chat/TabBar.vue`
- New optional: `src/renderer/components/sidebar/SidebarActionGroup.vue`

## Phase 2: Clarify ChatTopBar / WorkspaceTabStrip responsibilities

Current `TabBar.vue` does too much:

- Window drag area
- Chat title tab
- Project/file tabs
- Agent selector
- Split controls
- Inspector toggle
- Panel close/equalize controls

New separation, if needed after Phase 1:

- `ChatTopBar`: top row shell and chat/session actions
- `WorkspaceTabStrip`: chat/project/file tabs only
- `SidebarActionGroup`: migrates between Sidebar and ChatTopBar depending on Sidebar visibility

Important: this phase should not move Project/File tabs below the title.

## Phase 3: Make Inspector feel like a Drawer

Current `ChatInspectorPanel.vue` is an app-level right sidebar with fixed width.

Desired behavior:

- Keep docked behavior on wide screens.
- Visually present it as a drawer.
- Align its top with the top bar.
- Use weaker background and clearer border.
- On smaller windows, use overlay drawer behavior.

Likely files:

- `src/renderer/components/chat/ChatInspectorPanel.vue`
- `src/renderer/App.vue`

## Phase 4: Reduce Composer Visual Weight

Current composer was visually heavy because of glass, blur, and shadow.

Adjustments:

- Reduce shadow.
- Reduce blur/glass effect.
- Use a background closer to the main panel.
- Use subtle border on focus instead of strong glow.
- Keep width consistent with message content.

Implemented so far:

- Reduced `InputBox.vue` composer blur/shadow/focus glow.
- Flattened send button from glow-heavy gradient to theme fill.
- Softened queued-message card surface.

Likely files for further tuning:

- `src/renderer/components/chat/InputBox.vue`
- `src/renderer/components/chat/ChatPanel.vue`

## Testing Checklist

Need verify these UI states after implementation:

- Sidebar expanded
- Sidebar collapsed
- Sidebar floating visible
- MediaPanel open
- Inspector open
- Split panels open
- Project Workbench tab open
- File tab open
- Multiple tabs with overflow
- Small window width
- Light and dark themes

## Implementation Log

### 2026-05-27 — Layout-bound continuous docking motion

Implemented:

- Replaced the two-location/ghost approach with a single app-level `SidebarActionGroup`.
- The group keeps constant size and `top` position.
- Its `left` position animates between Sidebar top-right and collapsed top-bar dock position.
- The top-bar slot is always mounted and transitions its width between `0` and the docked width, so Chat/Project/File tabs reflow smoothly instead of jumping.
- Removed local Vue enter/leave fades and removed the ghost transition composable.

Validation:

- `bun run typecheck` passed.

### 2026-05-27 — Phase 1.5 visual experiment and rollback

Tried:

- Sidebar `Chats` label in the titlebar row.
- Bordered/pill-style Sidebar Action Group.
- Top-bar separator after the migrated action group.

Screenshot review:

- The `Chats` label looked cramped next to macOS traffic lights.
- The pill group felt like an extra floating toolbar rather than a native titlebar control.
- The added separator made the collapsed top row feel busier.

Rolled back:

- Removed `Chats` title from `SidebarHeader`.
- Removed action-group pill/border backgrounds.
- Removed the top-bar separator.

Kept:

- Structural migration from `App.vue` floating toolbar into Sidebar/TopBar ownership.
- Shared `SidebarActionGroup` component.

Validation:

- `bun run typecheck` passed.

### 2026-05-27 — Phase 1

Implemented:

- Added `src/renderer/components/sidebar/SidebarActionGroup.vue`.
- Updated `SidebarHeader.vue` to show `[Toggle] [Search] [New]` when Sidebar is visible.
- Updated `TabBar.vue` to show the same action group on the top row only when `showSidebarToggle` is true, i.e. Sidebar is collapsed/hidden.
- Routed `open-search` and `create-new-chat` events through `TabBar -> ChatWindow -> ChatContainer -> App`.
- Removed the old app-level floating toolbar from `App.vue`.
- Kept Chat title, Project Workbench tabs, and File tabs in the existing top row.
- Added slide + fade transitions for both Sidebar and top-bar locations.

Validation:

- `bun run typecheck` passed.

Open visual review items:

- Verify exact spacing near macOS traffic lights when Sidebar is collapsed.
- Verify MediaPanel-open state; top-bar action group currently appears with reduced left padding.
- Verify floating Sidebar behavior; action group appears in floating Sidebar while top-bar group is hidden.
- Verify tab overflow with multiple Project/File tabs.

## Notes / Decisions

- User prefers Search/New Chat in Sidebar, not always in ChatTopBar.
- User also wants Sidebar Toggle to belong with Search/New Chat as one Sidebar Action Group.
- When Sidebar is hidden, the whole action group appears in ChatTopBar.
- Use slide + fade animation.
- Project Workbench and File tabs remain on the top row to the right of Chat title.
