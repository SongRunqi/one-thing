# Theme Color Token Flow

更新时间: 2026-06-14

这份文档回答一个具体问题：当前主题颜色从 Base46 或主题 JSON 进来以后，怎么变成 `primary/status/neutral`，再怎么变成 `ui.*`，最后前端组件到底用的是哪一层。

核心结论：

- `scale` 是内部色阶材料，不是组件消费 API；status 的浅色背景现在不直接取 Ant scale 浅端。
- `primary/status/neutral` 是主题语义层，负责给出稳定的颜色角色。
- `ui.*` 是 UI 消费层，组件应该优先吃 `--ui-*` 或由它派生的局部 token。
- `--color-*` 会全部输出，但不是每一个都会被 `ui.*` 直接使用。
- `--bg-*`、`--text-*`、`--border-*`、`--accent*` 仍作为 legacy alias 存在，不能把它们当成新的设计入口。

## Source Of Truth

| Area | File | Role |
| --- | --- | --- |
| Theme type contract | `src/shared/ipc/themes.ts` | 定义 `primary`、`color.*`、`neutral.*`、`SemanticUIToken`。 |
| Base46 import | `src/main/themes/base46-parser.ts` | 把 Base46 `base_30/base_16` 转成 app theme roles。 |
| Theme resolve | `src/main/themes/resolver.ts` | 解析引用、生成色阶、派生 `primary/status/neutral`、派生 `ui.*`。 |
| CSS variable output | `src/main/themes/css-mapper.ts` | 输出 `--color-*`、`--color-neutral-*`、`--ui-*` 和 legacy aliases。 |
| Renderer fallback | `src/renderer/styles/variables.css` | 主题尚未写入时的 fallback，运行时主题变量优先。 |
| Current UI usage map | `docs/theme-ui-semantic-token-map.md` | 描述各 UI 区域应该消费的 `ui.*` token。 |

## Mental Model

```text
Base46 palette / built-in theme defs
        |
        v
Theme source roles
  accent, bg.*, text.*, border.*, color.*, diff.*
        |
        v
resolveTheme()
  - resolve refs
  - derive primary
  - derive status base/text from Ant scale
  - derive status bg/bgHover/border from OKLCH surface ramp
  - derive neutral
        |
        v
resolveThemeUI()
  ui.accent.*
  ui.action.*
  ui.state.*
  ui.sidebar.*
  ui.tabBar.*
  ui.status.*
  ui.message.*
  ui.tool.*
  ui.editor.*
        |
        v
generateCSSVariables()
  --color-*
  --color-neutral-*
  --ui-*
  legacy aliases
        |
        v
Renderer components
  direct --ui-* usage
  local tokens such as --app-button-*, --tool-*, --md-*
```

## Base46 Input Layer

Base46 输入主要来自 `base_30` 和 `base_16`：

| Base46 material | Current use |
| --- | --- |
| `b30.black`, `b30.darker_black`, `b16.base00` | 推导 app/chat/sidebar/panel 背景。 |
| `b30.white`, `b16.base05`, `b30.light_grey` | 推导主文本和可读文本 fallback。 |
| `b30.blue`, `b16.base0D` | 主强调色输入，旧链路里叫 `accent`，现在会成为 `primary` 的主要来源。 |
| `b30.nord_blue`, `b30.cyan`, `b16.base0C` | 次强调色、旧 `accentSub`。 |
| `b30.red`, `b16.base08` | `danger` 输入。 |
| `b30.orange`, `b30.yellow`, `b16.base09` | `warning` 输入。 |
| `b30.green`, `b16.base0B` | `success` 输入。 |
| `b30.cyan`, `b16.base0C` | `info` 输入。 |

Base46 阶段会先生成旧 theme roles，例如 `bg.*`、`text.*`、`border.*`、`color.*`。后续 resolver 再把这些旧 roles 统一补成新的 `primary/status/neutral`。

## Theme Semantic Layer

### Primary

`primary` 的来源优先级：

```text
theme.primary -> accentMain -> accent -> #4385BE
```

`selectPrimaryColorSemantics()` 会从主色生成 10 阶色阶，然后选择这些下标：

| Semantic field | Light mode | Dark mode | Meaning |
| --- | --- | --- | --- |
| `base` | `scale[5]` | `scale[5]` | 主色本体。 |
| `hover` | `scale[4]` | `scale[6]` | 主操作 hover。 |
| `bg` | `scale[0]` | `scale[0]` | 轻量选中背景。 |
| `bgHover` | `scale[1]` | `scale[1]` | 轻量选中 hover 背景。 |
| `border` | `scale[2]` | `scale[2]` | focus/selected border。 |
| `text` | `scale[6]` | `scale[7]` | 主色文字语义。当前 UI token 很少直接消费它。 |
| `light` | `scale[0]` | `scale[0]` | `primaryBg` 兼容别名。 |

### Status

`success/warning/danger/info` 的来源优先级分别来自 `theme.color.*`，再落到旧 `text.*`、`border.*`、`diff.*` 等 fallback。每个状态色仍会生成 Ant 10 阶色阶，但现在只有 `base/text` 默认从 Ant 深端选择；浅端 `bg/bgHover/border` 改由 OKLCH surface ramp 生成。

`selectStatusColorSemantics()` 现在的规则：

| Semantic field | Light mode | Dark mode | Meaning |
| --- | --- | --- | --- |
| `base` | `scale[5]` | `scale[5]` | 状态主色。 |
| `bg` | surface L - `0.025`, base C * `0.18` | surface L + `0.035`, base C * `0.20` | 状态浅背景。 |
| `bgHover` | surface L - `0.055`, base C * `0.24` | surface L + `0.065`, base C * `0.28` | 状态浅背景 hover。当前多数 UI token 没有直接使用。 |
| `border` | surface L - `0.105`, base C * `0.34` | surface L + `0.115`, base C * `0.40` | 状态浅边框。 |
| `text` | `scale[6]` | `scale[7]` | 状态文字。 |
| `light` | same as `bg` | same as `bg` | `*Bg` 兼容别名。 |

如果 OKLCH 生成失败，才回退到 Ant scale 的 `scale[0/1/2]` 或透明混色 fallback。显式写入的 canonical 值仍优先，例如 `color.dangerBg`、`color.dangerBgHover`、`color.dangerBorder`、`color.dangerText`。

### Neutral

`neutral` 分三类：

| Group | Tokens | Current role |
| --- | --- | --- |
| Text ramp | `primaryText`, `regularText`, `secondaryText`, `placeholderText`, `disabledText` | 普通文本层级，很多 `ui.text.*`、message、tool、sidebar token 都吃这里。 |
| Border ramp | `darkerBorder`, `darkBorder`, `baseBorder`, `lightBorder`, `lighterBorder`, `extraLightBorder` | UI 边框、divider、input、card、tool、message border。 |
| Fill/background ramp | `darkerFill`, `darkFill`, `baseFill`, `lightFill`, `lighterFill`, `extraLightFill`, `pageBackground`, `baseBackground`, `overlayBackground` | app surface、panel surface、input surface、tool surface、modal/menu surface。 |

当前 text ramp 不是简单从旧 `text.secondary` 照搬，而是由 `deriveNeutralTextRamp()` 根据主文本色、背景和 mode 生成一组更稳定的对比层级。也就是说，`neutral.secondaryText` 才是 thinking/muted 语义现在更应该看的入口。

## UI Semantic Layer

`resolveThemeUI()` 不直接把所有 `--color-*` 原样暴露给组件，而是按 UI 角色重新分配。重要映射如下。

### Primary To UI Tokens

| Primary semantic | Canonical CSS vars | UI tokens that consume it |
| --- | --- | --- |
| `primary.base` | `--color-primary`, `--primary` | `ui.accent.primary.fg`, `ui.action.primary.bg`, `ui.action.primary.border`, `ui.action.primaryHover.border`, `ui.tool.accent.fg` |
| `primary.hover` | `--color-primary-hover` | `ui.accent.subtle.fg`, `ui.action.primaryHover.bg` |
| `primary.bg` | `--color-primary-bg`, `--color-primary-light` | `ui.state.selected.bg`, `ui.sidebar.itemActive.bg`, `ui.tabBar.itemActive.bg`, `ui.editor.selection.bg` |
| `primary.bgHover` | `--color-primary-bg-hover` | `ui.state.selectedHover.bg` |
| `primary.border` | `--color-primary-border` | `ui.border.focus.border`, `ui.border.focus.ring`, `ui.border.selected.border`, `ui.state.selected.border`, `ui.state.selectedHover.border`, `ui.state.focus.border`, `ui.state.focus.ring`, `ui.sidebar.itemActive.border`, `ui.surface.inputFocus.border`, `ui.surface.inputFocus.ring` |
| `primary.text` | `--color-primary-text` | 目前默认 `ui.*` 基本不直接消费。它更多是 canonical 输出和 fallback 材料。 |

注意：普通 hover 不是 primary。比如 left sidebar 未选中的 hover 是 `ui.sidebar.itemHover.bg -> bg.hover/effects.overlayHover`，不是 `primary.bgHover`。

### Status To UI Tokens

| Status semantic | Canonical CSS vars | UI tokens that consume it |
| --- | --- | --- |
| `success.base` | `--color-success` | `ui.tool.successText.fg`。如果 `successText` 缺失，也会作为 `ui.status.success.fg`、`ui.tool.success.fg` fallback。 |
| `success.bg` | `--color-success-bg`, `--color-success-light` | `ui.status.success.bg`, `ui.tool.success.bg` |
| `success.bgHover` | `--color-success-bg-hover` | 当前默认 `ui.*` 基本没有直接消费。 |
| `success.border` | `--color-success-border` | `ui.status.success.border`, `ui.tool.success.border` |
| `success.text` | `--color-success-text` | `ui.status.success.fg`, `ui.tool.success.fg` |
| `warning.base` | `--color-warning` | 主要作为 fallback。 |
| `warning.bg` | `--color-warning-bg`, `--color-warning-light` | `ui.status.warning.bg`, `ui.state.highlight.bg`, `ui.surface.note.bg` |
| `warning.bgHover` | `--color-warning-bg-hover` | 当前默认 `ui.*` 基本没有直接消费。 |
| `warning.border` | `--color-warning-border` | `ui.status.warning.border`, `ui.surface.note.border` |
| `warning.text` | `--color-warning-text` | `ui.status.warning.fg` |
| `danger.base` | `--color-danger`, `--danger` | `ui.action.danger.bg`, `ui.tool.dangerText.fg`。如果 `dangerText` 缺失，也作为 danger fg fallback。 |
| `danger.bg` | `--color-danger-bg`, `--color-danger-light` | `ui.status.danger.bg`, `ui.message.error.bg`, `ui.tool.error.bg`, `ui.tabBar.danger.bg` |
| `danger.bgHover` | `--color-danger-bg-hover` | `ui.action.dangerHover.bg` |
| `danger.border` | `--color-danger-border` | `ui.status.danger.border`, `ui.message.error.border`, `ui.tool.error.border`, `ui.action.danger.border`, `ui.action.dangerHover.border` |
| `danger.text` | `--color-danger-text` | `ui.status.danger.fg`, `ui.message.error.fg`, `ui.tool.error.fg`, `ui.tabBar.danger.fg` |
| `info.base` | `--color-info` | `ui.text.link.fg` |
| `info.bg` | `--color-info-bg`, `--color-info-light` | `ui.status.info.bg` |
| `info.bgHover` | `--color-info-bg-hover` | 当前默认 `ui.*` 基本没有直接消费。 |
| `info.border` | `--color-info-border` | `ui.status.info.border` |
| `info.text` | `--color-info-text` | `ui.status.info.fg`, `ui.text.linkHover.fg` |

## Everforest Light Example

下面按 Everforest Light 的代表输入反查。primary 仍使用 Ant scale；status 浅端改为 OKLCH 后，在 page surface `#f7f1df` 上会得到下面这些浅档。

### Primary

| Value | Semantic | Direct UI token usage |
| --- | --- | --- |
| `#3a94c5` | `primary.base` | `--ui-accent-primary-fg`, `--ui-action-primary-bg`, `--ui-action-primary-border`, `--ui-action-primary-hover-border`, `--ui-tool-accent-fg` |
| `#5eadd1` | `primary.hover` | `--ui-accent-subtle-fg`, `--ui-action-primary-hover-bg` |
| `#f0fcff` | `primary.bg` / `primary.light` | `--ui-state-selected-bg`, `--ui-sidebar-item-active-bg`, `--ui-tab-bar-item-active-bg`, `--ui-editor-selection-bg` |
| `#e6f4f7` | `primary.bgHover` | `--ui-state-selected-hover-bg` |
| `#b5ddeb` | `primary.border` | `--ui-border-focus-border`, `--ui-border-focus-ring`, `--ui-border-selected-border`, `--ui-state-selected-border`, `--ui-state-selected-hover-border`, `--ui-state-focus-border`, `--ui-state-focus-ring`, `--ui-sidebar-item-active-border`, `--ui-surface-input-focus-border`, `--ui-surface-input-focus-ring` |
| `#26709e` | `primary.text` | `--color-primary-text`。当前默认 UI token 基本不直接吃它。 |

`scale` 中没被 primary semantics 选中的 `#87c5de`、`#174f78`、`#0b3252`、`#06192b` 当前只是诊断/内部色阶，不是组件消费 token。

### Success

| Value | Semantic | Direct UI token usage |
| --- | --- | --- |
| `#5da111` | `success.base` | `--ui-tool-success-text-fg` |
| `#E1EED9` | `success.bg` / `success.light` | `--ui-status-success-bg`, `--ui-tool-success-bg` |
| `#D4E6C9` | `success.bgHover` | 目前默认 UI token 基本不直接吃。 |
| `#BFD8B0` | `success.border` | `--ui-status-success-border`, `--ui-tool-success-border` |
| `#417a07` | `success.text` | `--ui-status-success-fg`, `--ui-tool-success-fg` |

### Warning

| Value | Semantic | Direct UI token usage |
| --- | --- | --- |
| `#f7954f` | `warning.base` | 主要作为 fallback，不是当前主要 UI 消费色。 |
| `#F8E5D9` | `warning.bg` / `warning.light` | `--ui-status-warning-bg`, `--ui-state-highlight-bg`, `--ui-surface-note-bg` |
| `#F2D9CA` | `warning.bgHover` | 目前默认 UI token 基本不直接吃。 |
| `#E9C7B1` | `warning.border` | `--ui-status-warning-border`, `--ui-surface-note-border` |
| `#d17338` | `warning.text` | `--ui-status-warning-fg` |

### Danger

| Value | Semantic | Direct UI token usage |
| --- | --- | --- |
| `#c85552` | `danger.base` | `--ui-action-danger-bg`, `--ui-tool-danger-text-fg` |
| `#FAE2E0` | `danger.bg` / `danger.light` | `--ui-status-danger-bg`, `--ui-message-error-bg`, `--ui-tool-error-bg`, `--ui-tab-bar-danger-bg` |
| `#F6D6D4` | `danger.bgHover` | `--ui-action-danger-hover-bg` |
| `#EEC3BF` | `danger.border` | `--ui-status-danger-border`, `--ui-message-error-border`, `--ui-tool-error-border`, `--ui-action-danger-border`, `--ui-action-danger-hover-border` |
| `#a13a3a` | `danger.text` | `--ui-status-danger-fg`, `--ui-message-error-fg`, `--ui-tool-error-fg`, `--ui-tab-bar-danger-fg` |

### Info

| Value | Semantic | Direct UI token usage |
| --- | --- | --- |
| `#89bfdc` | `info.base` | `--ui-text-link-fg` |
| `#E1EBF0` | `info.bg` / `info.light` | `--ui-status-info-bg` |
| `#D5E1E8` | `info.bgHover` | 目前默认 UI token 基本不直接吃。 |
| `#C0D2DC` | `info.border` | `--ui-status-info-border` |
| `#6797b5` | `info.text` | `--ui-status-info-fg`, `--ui-text-link-hover-fg` |

改动前 Everforest Light 里 `primary.bg` 和 `info.bg` 恰好都是 `#f0fcff`。改成 OKLCH surface ramp 后，primary.bg 仍是 Ant scale 的 `#f0fcff`，但 info.bg 会变成带 info 色相的 `#E1EBF0`，不再和 primary 撞成同一个近白色。

## Neutral Text To UI Tokens

当前 neutral text ramp 的 UI token 消费关系：

| Neutral token | UI tokens that consume it |
| --- | --- |
| `neutral.primaryText` | `ui.text.primary.fg`, `ui.state.selected.fg`, `ui.state.selectedHover.fg`, `ui.sidebar.itemActive.fg` fallback, `ui.tabBar.itemActive.fg` fallback, `ui.message.user.fg`, `ui.message.assistant.fg` candidate, `ui.tool.text.fg`, `ui.editor.text.fg`, `ui.editor.caret.fg`, `ui.editor.selection.fg` |
| `neutral.regularText` | `ui.text.secondary.fg`, `ui.text.inverse` fallback, `ui.action.ghost.fg`, `ui.sidebar.item` candidate, `ui.sidebar.action` candidate, `ui.tabBar.item/action` candidate, `ui.message.system.fg`, `ui.tool.result.fg` |
| `neutral.secondaryText` | `ui.text.muted.fg`, `ui.sidebar.itemMuted.fg` candidate, `ui.sidebar.header.fg` candidate, `ui.tabBar.item/action` candidate, `ui.message.thinking.fg`, `ui.tool.textMuted.fg` candidate, `ui.tool.textFaint.fg` candidate, `ui.editor.placeholder.fg` fallback |
| `neutral.placeholderText` | `ui.text.placeholder.fg`, `ui.editor.placeholder.fg` primary candidate |
| `neutral.disabledText` | `ui.text.faint.fg`, `ui.text.disabled.fg`, `ui.action.disabled.fg`, `ui.state.disabled.fg`, `ui.sidebar.header.fg` candidate, `ui.tool.textFaint.fg` candidate |

因此 thinking 文本现在应该走：

```text
neutral.secondaryText
  -> ui.message.thinking.fg
  -> --ui-message-thinking-fg
  -> MessageThinking / MessageBubble / ThinkToggle
```

如果视觉上没有变化，优先检查这几件事：

1. 当前 theme log 里的 `neutral.secondaryText` 是否真的和 `neutral.regularText` 拉开。
2. `--ui-message-thinking-fg` 是否被运行时主题写入到了 root。
3. 组件内是否又被局部变量、opacity、color-mix 或更高优先级选择器覆盖。
4. 看到的是不是旧缓存的 `cached-theme-css`。

## Frontend Consumption Snapshot

当前 renderer 里最高频的 `--ui-*` 消费大致是这些：

| CSS var | Approx direct refs | Meaning |
| --- | ---: | --- |
| `--ui-text-primary-fg` | 557 | 主文本。 |
| `--ui-accent-primary-fg` | 528 | 主强调、局部 accent 派生、editor/markdown accent。 |
| `--ui-text-muted-fg` | 517 | 弱文本、metadata、markdown/editor 弱信息。 |
| `--ui-border-default-border` | 345 | 默认边框。 |
| `--ui-state-hover-bg` | 185 | 通用 hover。 |
| `--ui-status-danger-fg` | 119 | danger 文本/图标/错误状态。 |
| `--ui-text-secondary-fg` | 88 | 次级文本。 |
| `--ui-status-success-fg` | 61 | success 文本/图标/状态点。 |
| `--ui-status-warning-fg` | 43 | warning 文本/图标。 |
| `--ui-status-danger-bg` | 33 | danger 浅背景。 |
| `--ui-action-primary-bg` | 28 | 主按钮/主 CTA。 |
| `--ui-status-success-bg` | 21 | success 浅背景。 |
| `--ui-status-danger-border` | 20 | danger 边框。 |

这说明组件侧已经大量在消费 `ui.*`，但还存在两种情况：

- 一些组件仍直接使用 `--color-primary`、`--color-danger` 等 canonical color vars。
- 很多组件用局部 token，例如 `--app-button-*`、`--settings-*`、`--tool-*`、`--md-*`，这些局部 token 应该从 `--ui-*` 派生。

## Practical Adjustment Guide

| If you want to change | Adjust this first | Why |
| --- | --- | --- |
| 主按钮、主强调、焦点感 | `primary` 或 Base46 的 blue/base0D 输入 | 影响 `ui.accent.primary`、`ui.action.primary`、`ui.tool.accent`。 |
| sidebar 选中 session 背景 | `primaryBg` 派生，也就是 primary scale 的 `scale[0]` | `ui.sidebar.itemActive.bg` 直接吃 `primaryBg`。 |
| sidebar 普通 hover | `bg.hover` / `effects.overlayHover` | 它不吃 primary，不会跟着 `primary.bgHover` 走。 |
| danger 错误块 | `color.dangerBg`, `color.dangerText`, `color.dangerBorder` | `ui.status.danger`、`ui.message.error`、`ui.tool.error` 都吃这组。 |
| warning note/highlight | `color.warningBg`, `color.warningBorder`, `color.warningText` | `ui.status.warning`、`ui.surface.note`、`ui.state.highlight` 吃这组。 |
| thinking 文本太像正文 | `neutral.secondaryText` 和组件覆盖链 | `ui.message.thinking.fg` 现在吃 `neutral.secondaryText`。 |
| 所有普通文本层级不明显 | neutral text ramp 或其输入 `text.primary` / page background | `ui.text.primary/secondary/muted/faint` 都从 neutral text ramp 来。 |
| code/diff 色不协调 | `syntax.*` / `--hg-*` / `diff.*` | 不应该从 primary/status 乱借色，除了 inserted/deleted fallback。 |

## Trace Checklist

想追一个颜色时，按这个顺序查：

1. 在 log 里找到主题语义值，例如 `primary.bg = #f0fcff`。
2. 在 `src/main/themes/resolver.ts` 里查它被哪个 `ui.*` token 读取，例如 `ui.sidebar.itemActive.bg -> primaryBg`。
3. 在 `src/main/themes/css-mapper.ts` 确认 CSS var 名，例如 `ui.sidebar.itemActive.bg -> --ui-sidebar-item-active-bg`。
4. 在 renderer 里 `rg -- '--ui-sidebar-item-active-bg' src/renderer` 查实际组件。
5. 如果视觉没变，检查组件是否有 local token、opacity、`color-mix()`、fallback 或缓存覆盖。

最重要的一句话：调主题时先改 `primary/status/neutral` 的语义输入，组件调具体用途时吃 `ui.*`，不要让组件直接追着色阶或 hex 跑。
