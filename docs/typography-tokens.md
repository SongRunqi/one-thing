# Typography Tokens / Text Style Tokens

本文档整理当前系统里的字体与文字样式 token。这里的“字体”不只指 typeface 的外形，还包括字号、字重、行高、明暗层级、语义用途等属性。

## Source Of Truth

| Area | File | Notes |
| --- | --- | --- |
| 全局 typography token | `src/renderer/styles/variables.css` | 字体族、字号、字重、行高、text style presets、文字明暗 token 的主要定义位置。 |
| 可选字体注册表 | `src/shared/fonts.ts` | 设置页可选字体列表，以及英文/中文字体组合逻辑。 |
| 聊天阅读设置 | `src/renderer/components/chat/MessageList.vue` | 用户设置驱动的聊天字号、行高、字体覆盖，以及由字号推导出的内容间距。 |
| 主题色映射 | `src/main/themes/css-mapper.ts` | 主题 JSON 到 CSS text token 的映射。主题主要负责颜色，不负责全局字号体系。 |

## Terminology

| Term | 中文理解 | In this codebase |
| --- | --- | --- |
| Typeface / Font Family | 字体长相，例如 Public Sans、思源黑体、Lora。 | `--font-sans`、`--font-serif`、`--font-mono`，以及 `FONT_REGISTRY`。 |
| Typography Tokens / Type Tokens | 字体属性 token，例如字号、字重、行高、字体族角色。 | `--type-size-*`、`--type-*-line-height`、`--font-weight-*`、`--font-display`、`--font-body`。 |
| Text Style Tokens | 一组可复用文字样式，例如标题、正文、标签、元信息。通常把 family、size、weight、line-height，有时还有 color 组合起来。 | `--type-display-*`、`--type-body-*`、`--type-meta-*` 等。 |
| Text Color / Emphasis Tokens | 文字明暗层级，例如 primary、secondary、muted、faint。严格说它们是 foreground/color tokens，但在 UI 里会和文字样式一起决定层级感。 | `--ui-text-primary-fg`、`--ui-text-muted-fg`、`--text-faint` 等。 |

如果要专业地描述“大小、亮、暗这种属性”，可以说：**typographic attributes**、**text style tokens**、**type scale**、**foreground emphasis tokens**。

## Current Count

当前全局 typography/text 相关 CSS 变量可以这样统计：

| Group | Count | Tokens |
| --- | ---: | --- |
| Font family primitives | 3 | `--font-sans`、`--font-serif`、`--font-mono` |
| Semantic font roles | 2 | `--font-display`、`--font-body` |
| Primitive type size scale | 10 | `--type-size-100` 到 `--type-size-1000` |
| Semantic type roles | 10 | `display`、`headline`、`title`、`body`、`label`、`meta`、`caption`、`micro`、`chat`、`code` |
| Chat density scale | 9 | `--type-chat-compact-*`、`--type-chat-comfortable-*`、`--type-chat-spacious-*` |
| Legacy font size aliases | 7 | `--font-size-xs` 到 `--font-size-2xl`，现在指向 `--type-*`，不是新的 source of truth。 |
| Tool typography scale | 6 | `--tool-font-size-*`、`--tool-line-height`、`--tool-code-line-height`，现在也指向 `--type-*`。 |
| Font weights | 4 | `--font-weight-normal` 到 `--font-weight-bold` |
| Leading aliases | 7 | `--type-leading-none/control/title/meta/body/reading/code` |
| Legacy line height aliases | 3 | `--line-height-tight`、`--line-height-normal`、`--line-height-relaxed`，现在指向 `--type-leading-*`。 |
| Text style preset vars | 28 | 9 个 style roles 的 font/size/weight/line-height/color 组合；部分 role 复用语义 size/line-height。 |
| Semantic text color aliases | 9 | `--ui-text-primary-fg` 到 `--ui-text-link-hover-fg` |
| Legacy text emphasis aliases | 4 | `--text-primary`、`--text-secondary`、`--text-muted`、`--text-faint` |

结论：如果只看设计上可选的 **Text Style Roles**，当前是 **9 个**；如果只统计 `variables.css` 顶部 Typography 区块里定义的 CSS 变量，当前是 **101 个 typography 变量**。聊天区还额外有一组 runtime sizing vars，用于用户字号、行高和阅读间距。

## Actual Semantic Model

当前项目里的真实语义不是单层 token，而是五层叠加：

| Layer | Current reality | Notes |
| --- | --- | --- |
| 1. 字体族 | `--font-sans`、`--font-serif`、`--font-mono`，外加 `FONT_REGISTRY`。 | `FONT_REGISTRY` 负责设置页可选字体和中英文字体组合；CSS 变量提供默认字体栈。 |
| 2. 原始比例尺 | `--type-size-*`、`--font-weight-*`、各 role 的 `--type-*-line-height`。 | 这是现在最接近 source of truth 的字号/行高层。 |
| 3. 全局语义角色 | `display`、`headline`、`title`、`body`、`label`、`meta`、`caption`、`micro`、`chat`、`code`。 | `main.css` 的 `html/body/#app` 已经使用 `--type-body-*`。 |
| 4. 密度覆盖 | `html[data-typography-density="comfortable"]` 覆盖全局 type role。 | 目前全局 density 只有 `compact` 和 `comfortable`；默认是 `compact`。 |
| 5. 局部阅读/工具域 | chat 的 `--message-*` / `--content-*`，tool 的 `--tool-*`，markdown/code/editor 的局部变量。 | 这些不是重复造轮子，而是在保护聊天阅读、工具输出和编辑器这类特殊文本场景。 |

所以，这份文档的规范化方向是成立的，但需要把 `--type-*` 当作当前主语义，把 `--font-size-*` / `--line-height-*` 当作兼容别名，而不是继续把 legacy alias 当作核心 scale。

## Token Layers

### 1. Font Families

| Token | Value | Role |
| --- | --- | --- |
| `--font-sans` | Public Sans + Noto Sans SC + system sans fallback | 默认 UI 正文字体。 |
| `--font-serif` | Lora + Noto Serif SC + system serif fallback | 展示标题字体。 |
| `--font-mono` | SF Mono + Fira Code + JetBrains Mono + system mono fallback | 代码、终端输出、等宽内容。 |

### 2. Semantic Font Roles

| Token | Value | Usage |
| --- | --- | --- |
| `--font-display` | `var(--font-serif)` | 页面级标题、空状态标题、较有品牌感的标题。 |
| `--font-body` | `var(--font-sans)` | 正文、标签、表单、导航、元信息。 |

`--font-body` 可能在聊天消息列表里被用户设置覆盖，所以聊天正文应继续尊重 `MessageList.vue` 的 runtime styles。

### 3. Type Scale

| Token | Value | Typical usage |
| --- | ---: | --- |
| `--type-size-100` | `10px` | micro text、非常紧凑的计数/辅助标记。 |
| `--type-size-200` | `11px` | caption、timestamp、badge、hint。 |
| `--type-size-300` | `12px` | meta、描述、辅助说明。 |
| `--type-size-400` | `13px` | label、按钮、列表行基础文字。 |
| `--type-size-500` | `14px` | UI 正文、紧凑标题、主要说明。 |
| `--type-size-600` | `15px` | comfortable body/chat，阅读型正文。 |
| `--type-size-700` | `16px` | headline、dialog heading、spacious chat。 |
| `--type-size-800` | `18px` | comfortable headline、较大的 panel title。 |
| `--type-size-900` | `20px` | compact display title、空状态主标题。 |
| `--type-size-1000` | `22px` | comfortable display title。 |

当前 scale 偏紧凑，适合桌面工具型应用。视觉“扁平”通常不是换字体能解决，而是需要更明确地使用 `title-sm`、`body-strong`、`meta`、`caption-muted` 等层级。

Legacy `--font-size-xs/sm/base/md/lg/xl/2xl` 仍然存在，但它们现在只是 `--type-*` 的别名。新代码应该优先选择语义 role（例如 `--type-label-size`），其次才选择 primitive size。

### 4. Font Weights

| Token | Value | Usage |
| --- | ---: | --- |
| `--font-weight-normal` | `400` | 正文。 |
| `--font-weight-medium` | `500` | label、caption、metadata。 |
| `--font-weight-semibold` | `600` | 标题、强调正文、列表 title。 |
| `--font-weight-bold` | `700` | 少量强强调或 badge，不建议大面积使用。 |

### 5. Line Heights

| Token | Value | Usage |
| --- | ---: | --- |
| `--type-leading-none` | `1` | 图标按钮、单行控件等不需要自然行距的场景。 |
| `--type-leading-control` | `var(--type-label-line-height)` | label、按钮、表单控件。 |
| `--type-leading-title` | `var(--type-title-line-height)` | 标题、紧凑标题行。 |
| `--type-leading-meta` | `var(--type-meta-line-height)` | metadata、弱说明。 |
| `--type-leading-body` | `var(--type-body-line-height)` | UI 正文。 |
| `--type-leading-reading` | `var(--type-chat-line-height)` | 阅读型内容。 |
| `--type-leading-code` | `var(--type-code-line-height)` | code、terminal、tool output。 |

Legacy `--line-height-tight/normal/relaxed` 仍然存在，但它们现在只是 `--type-leading-title/body/reading` 的别名。

聊天正文的默认行高不是直接由全局 body token 控制，而是由 `MessageList.vue` 的密度设置控制：compact `20px / 14px = 1.4286`、comfortable `24px / 15px = 1.6`、spacious `29px / 16px = 1.8125`，用户自定义时会写入 `--message-line-height`。

## Text Style Presets

| Role | Family | Size | Weight | Line height | Color | Intended use |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `display` | `--font-display` | `20px` | `600` | `1.3` | caller decides | 页面级主标题、空状态主标题。 |
| `headline` | `--font-display` | `16px` | `600` | `1.3125` | caller decides | section title、dialog title、设置页标题。 |
| `body` | `--font-body` | `14px` | `400` | `1.5` | caller decides | UI 正文、说明、主要可读内容。 |
| `label` | `--font-body` | `13px` | `500` | `1.3077` | caller decides | 按钮、表单 label、导航项、设置项。 |
| `caption` | `--font-body` | `11px` | `500` | `1.3636` | caller decides | timestamp、badge、hint、helper text。 |
| `title-sm` | `--font-body` | `14px` | `600` | `1.2857` | primary | 紧凑 panel/list title，不使用 serif，避免小标题过度装饰。 |
| `body-strong` | `--font-body` | `14px` | `600` | `1.5` | primary | 行内强调、设置项名称、卡片里重要值。 |
| `meta` | `--font-body` | `12px` | `500` | `1.4167` | muted | 描述、次要元信息、inline values。 |
| `caption-muted` | `--font-body` | `11px` | `500` | `1.3636` | faint | 最低强调的 timestamp、计数、辅助标签。 |

上表是默认 compact density 下的 resolved value。`html[data-typography-density="comfortable"]` 会把这些 role 往上放大一档，例如 body 从 `14px / 1.5` 变为 `15px / 1.6`，headline 从 `16px / 1.3125` 变为 `18px / 1.3333`。

每个 role 实际由 CSS 变量拆开使用，例如：

```css
.setting-title {
  font-family: var(--type-title-sm-font);
  font-size: var(--type-title-sm-size);
  font-weight: var(--type-title-sm-weight);
  line-height: var(--type-title-sm-line-height);
  color: var(--type-title-sm-color);
}
```

## Global Typography Density

全局 UI typography density 由 `settings.general.typographyDensity` 控制，`src/renderer/stores/settings.ts` 会把它写到 `document.documentElement`：

```html
<html data-typography-density="compact">
<html data-typography-density="comfortable">
```

当前真实行为：

| Density | Scope | Key values |
| --- | --- | --- |
| `compact` | 默认值；没有单独 selector，因为值定义在 `:root`。 | body `14px / 1.5`，label `13px / 1.3077`，meta `12px / 1.4167`，caption `11px / 1.3636`。 |
| `comfortable` | `html[data-typography-density="comfortable"]` 覆盖。 | body `15px / 1.6`，label `14px / 1.2857`，meta `13px / 1.3846`，caption `12px / 1.3333`。 |

注意：全局 density 和聊天消息列表 density 是两个设置。`typographyDensity` 影响 UI chrome 的 `--type-*`；`messageListDensity` 影响聊天阅读区的 `--message-*` 和 `--content-*`。

## Text Color / Emphasis

当前文字明暗层级分两层：

| New semantic token | Legacy fallback | Meaning |
| --- | --- | --- |
| `--ui-text-primary-fg` | `--text-primary` | 主文字、标题、关键值。 |
| `--ui-text-secondary-fg` | `--text-secondary` | 次级正文、一般说明。 |
| `--ui-text-muted-fg` | `--text-muted` | metadata、弱说明、非关键图标。 |
| `--ui-text-faint-fg` | `--text-faint` | timestamp、最低强调文本。 |
| `--ui-text-inverse-fg` | button/app fallback | 反色按钮或强调底上的文字。 |
| `--ui-text-placeholder-fg` | input placeholder | 输入框 placeholder。 |
| `--ui-text-disabled-fg` | disabled input/button | disabled 文本。 |
| `--ui-text-link-fg` | link | 链接。 |
| `--ui-text-link-hover-fg` | link hover | 链接 hover。 |

默认主题的文字对比层级：

| Theme | Surface | Primary | Secondary | Muted | Faint |
| --- | --- | --- | --- | --- | --- |
| Dark | `#343331` | `#F2F0E5` / 11.04 | `#E6E4D9` / 9.89 | `#B7B5AC` / 6.14 | `#9F9D96` / 4.65 |
| Light | `#FFFCF0` | `#575653` / 7.14 | `#6F6E69` / 4.97 | `#878580` / 3.59 | `#9F9D96` / 2.64 |

对比值用于理解视觉层级，不代表每个 token 都适合所有字号。小字优先使用 primary/secondary/muted；`faint` 更适合非关键 metadata。

## Tool Card Typography

Tool card 有独立的文字 scale，避免命令、参数、输出和 diff 被普通 UI 字号影响：

| Token | Value | Usage |
| --- | ---: | --- |
| `--tool-font-size-title` | `var(--type-label-size)` | tool name、tool card title。compact 下是 `13px`。 |
| `--tool-font-size-body` | `var(--type-meta-size)` | 参数、摘要、说明。compact 下是 `12px`。 |
| `--tool-font-size-line` | `var(--type-caption-size)` | 日志行、终端输出行。compact 下是 `11px`。 |
| `--tool-font-size-meta` | `var(--type-caption-size)` | 状态、耗时、次要标签。compact 下是 `11px`。 |
| `--tool-line-height` | `var(--type-leading-body)` | tool 普通文本行高。compact 下是 `1.5`。 |
| `--tool-code-line-height` | `var(--type-leading-code)` | tool code/terminal 输出行高。compact 下是 `1.5385`。 |

Tool card 文字颜色走 `--ui-tool-text-fg`、`--ui-tool-text-muted-fg`、`--ui-tool-text-faint-fg`，不要直接套普通 `--ui-text-*`，除非组件已经脱离 tool card 语义。

## Chat Runtime Typography

聊天消息正文是用户可调的阅读区域，和普通 UI token 有边界：

| Runtime var / setting | Default behavior |
| --- | --- |
| `messageListDensity` | 默认是 `comfortable`。compact 是 `14px / 20px`，comfortable 是 `15px / 24px`，spacious 是 `16px / 29px`。 |
| `chatFontSize` | 用户设置后写入 `--message-font-size`。 |
| `messageLineHeight` | 用户设置后写入 `--message-line-height`。 |
| `chatFontEn` / `chatFontZh` | 用户设置后重建 `--font-body`，影响聊天正文 fallback stack。 |
| content spacing vars | `--content-spacing-px`、`--content-paragraph-gap`、`--content-list-gap` 等由字号推导，保证阅读节奏随字号变化。 |

因此，聊天消息的可读正文不应该被机械替换成固定 `--type-body-size`。普通 UI chrome 可以使用全局 text style tokens，消息正文仍应尊重用户阅读设置。

## Usage Guidance

| Need | Use |
| --- | --- |
| 页面级主标题或空状态大标题 | `--type-display-*` |
| section/dialog/settings heading | `--type-headline-*` |
| 紧凑列表或 panel 标题 | `--type-title-sm-*` |
| 普通说明和正文 | `--type-body-*` |
| 正文内强调但不是标题 | `--type-body-strong-*` |
| 按钮、form label、nav label | `--type-label-*` |
| 描述、metadata、次要说明 | `--type-meta-*` |
| timestamp、badge、hint | `--type-caption-*` |
| 最低强调 timestamp/metadata | `--type-caption-muted-*` |

## Migration Rules

1. 新组件优先使用 `--type-*` text style tokens，不要散落 `font-size: 13px`、`font-weight: 600`、`line-height: 1.4`。
2. 文字颜色优先用 `--type-*-color` 或 `--ui-text-*`，只在主题实现层使用 `--text-*` legacy aliases。
3. 聊天正文保留 `--message-font-size`、`--message-line-height`、density settings 的控制权。
4. Tool card 内部继续使用 `--tool-*` typography scale 和 `--ui-tool-*` color tokens。
5. 主题 JSON 当前应主要定义 palette、surface、foreground、status、syntax 等颜色角色，不应定义每个主题自己的字号体系。
6. 如果某个组件需要新层级，先判断它是不是已有 role 的变体。只有反复出现、语义清晰的层级才新增 token。

## Current Code Scan

2026-06-13 对 `src/renderer` 做了一轮静态扫描，排除测试文件后的结果如下：

| Metric | Result |
| --- | ---: |
| 扫描文件数 | 275 |
| 出现 typography 信号的文件 | 132 |
| typography CSS var 引用总数 | 498 |
| typography CSS var 唯一数 | 98 |
| `--type-*` 引用 | 283 次 / 23 文件 |
| `--font-*` 引用 | 117 次 / 41 文件 |
| `--tool-*` typography 引用 | 58 次 / 5 文件 |
| `--message-*` / `--content-*` 引用 | 38 次 / 7 文件 |

最常见的 typography tokens：

| Token | Uses | Files |
| --- | ---: | ---: |
| `--font-mono` | 40 | 23 |
| `--type-label-size` | 20 | 12 |
| `--type-caption-size` | 20 | 11 |
| `--type-meta-size` | 19 | 12 |
| `--font-weight-semibold` | 17 | 5 |
| `--font-sans` | 16 | 11 |
| `--type-body-size` | 14 | 7 |
| `--type-meta-line-height` | 14 | 9 |

仍然大量存在的字面值：

| Property | Most common raw values |
| --- | --- |
| `font-size` | `12px`、`13px`、`11px`、`14px`、`10px` |
| `font-weight` | `600`、`500`、`650`、`700`、`560` |
| `line-height` | `1.25`、`1`、`1.35`、`1.2`、`1.45` |

硬编码最多的界面集中在 `SettingsPage.vue`、`ChatInspectorPanel.vue`、`SchedulerPanelContent.vue`、`MemoryPanelContent.vue`、`ProviderModels.vue` 等文件。这说明规范化已经开始，但还没有进入“全项目一致”的状态。

## Current Migrated Surfaces

近期已经开始从硬编码文字属性迁移到 text style tokens，覆盖了这些高频界面：

| Surface | Files |
| --- | --- |
| Shared component styles | `src/renderer/styles/components.css` |
| Settings row/field/section/empty state | `SettingRow.vue`、`SettingsField.vue`、`SettingsSection.vue`、`SettingsEmptyState.vue` |
| Sidebar session item | `SessionItem.vue` |
| Message bubble metadata/actions | `MessageBubble.vue` |

## Known Gaps

代码里仍有不少组件直接写 `font-size`、`font-weight`、`line-height`。这不是马上全局替换的问题，更适合按界面族群推进：

1. 先迁移 settings、sidebar、chat chrome 这些高频通用 UI。
2. 再迁移 editor、MCP/provider cards、image preview 等独立区域。
3. 对 code、markdown、tool output、badge 等特殊文本，保留局部 scale，但用文档明确边界。

这样能减少“所有文字看起来一样”的扁平感，同时避免把阅读正文、工具输出、设置项标签全部压成同一种文字样式。
