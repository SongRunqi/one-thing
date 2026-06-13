# 当前主题色深度调查

更新时间: 2026-06-13

## 调查范围

本次调查覆盖当前运行时主题系统和主要 UI 消费面：

- 主题源: `src/main/themes/`, `src/shared/ipc/themes.ts`
- renderer fallback: `src/renderer/styles/variables.css`, `flexoki-colors.css`, `hljs-theme.css`, `markdown.css`, `components.css`
- 应用入口: `index.html`, `src/renderer/stores/themes.ts`, `src/main/ipc/themes.ts`
- UI 消费: `src/renderer/components/`, `src/renderer/editor/`
- 统计时排除了 `node_modules`, `dist`, `out`, `release`, `build`, `TMP`, `.claude`, 以及测试文件；测试文件只作为“现有护栏”参考。

## 总结

当前主题系统已经是“主题 JSON -> resolver -> CSS variables -> 组件消费”的四层结构。内置主题源很集中，15 个内置主题中 14 个定义 128 个 theme leaf，`flexoki` 额外定义 6 个 `diff.*` leaf。运行时实际 `applyTheme()` 会为每个主题输出约 602 到 613 个 CSS 变量，其中 Flexoki dark 输出 613 个。

颜色语义扩展已经完成到 `primary`、status 和完整 `neutral` 层：主题类型允许显式定义 `theme.primary` 和 `theme.neutral.*`，resolver 会为旧主题自动派生缺失值，CSS mapper 会输出 `--color-primary`、`--color-neutral-*`、`--text-color-*`、`--border-color-*`、`--fill-color-*`、`--bg-color-*` 以及对应 RGB 变量。也就是说，内置 JSON 不需要马上手写 24 个 neutral leaf，运行时已经能得到完整 neutral 语义。

组件侧已经大量迁移到 `--ui-*` 语义变量。排除 palette/fallback 文件以后，运行时代码中仍有 9,508 次 `var(...)` 引用，`--ui-*` 是最大消费族；但还有大量 `--accent`/legacy fallback、局部 token 族和硬编码 fallback 色。多数硬编码值出现在 `var(--semantic, #fallback)` 或阴影/overlay 中，风险低于裸色直接上屏，但它们仍然让主题一致性更难审计。

最大的实际缺口是 `diff.*`: 只有 `flexoki.json` 显式定义 `diff.addBg/addText/delBg/delText/hunkBg/hunkText`。其他内置主题不输出 `--diff-*` 运行时变量，会落回 `variables.css` 中的 Flexoki 风格 fallback。

## 怎么理解现在的颜色使用

当前颜色系统可以用一句话理解：**主题 JSON 提供原料，resolver 把原料整理成语义角色，CSS mapper 输出变量，组件只应该消费语义变量或局部 token。**

实际链路是这样的：

| 层级 | 你应该怎么理解 | 典型变量/文件 |
| --- | --- | --- |
| 1. Theme source | 一套主题的原始颜色输入。这里决定整体 palette、背景、文本、边框、状态色。 | `src/main/themes/builtin/*.json` 里的 `accent/bg/text/border/color/diff` |
| 2. Resolver semantics | 把旧主题补成完整语义。这里会派生 `primary`、status、neutral，以及 `ui.*`。 | `src/main/themes/resolver.ts` |
| 3. CSS variables | 把 resolver 结果发布成运行时 CSS 变量，同时保留 legacy alias。 | `src/main/themes/css-mapper.ts` 输出 `--ui-*`、`--color-*`、`--bg-*`、`--text-*` |
| 4. Renderer fallback | 启动前和缺失变量时的默认值，不应该成为新主题的主要编辑入口。 | `src/renderer/styles/variables.css` |
| 5. Component usage | 组件真正消费的变量。现代组件优先用 `--ui-*`，复杂组件会再包一层局部 token。 | `--ui-*`、`--app-button-*`、`--md-*`、`--tool-*`、`--settings-*` |

## 这些变量是不是每个都在用

不是。现在输出的是一套**运行时颜色 API**，不是每个变量都被组件直接消费。这里要区分三种“使用”：

| 使用类型 | 含义 | 例子 |
| --- | --- | --- |
| 直接消费 | 组件或全局样式里直接写了 `var(--xxx)`，会马上影响当前 UI。 | `--ui-text-primary-fg`、`--ui-surface-panel-bg`、`--ui-status-danger-fg` |
| 间接消费 | 某个主题值没有用它的新变量名消费，但通过 legacy alias 或 `--ui-*` 影响 UI。 | `primary` 同时会影响 `--ui-accent-primary-fg`、`--accent`、button action token |
| API/兼容/储备 | 变量被输出到 root，给旧代码、自定义主题、未来组件或外部样式使用，但当前组件不一定直接引用。 | `--text-color-*`、`--fill-color-*`、大量 neutral alias、RGB helper |

以默认 `flexoki` dark 实际 `applyTheme()` 输出为例：

| 类别 | 数量 |
| --- | ---: |
| 运行时输出 CSS 变量 | 613 |
| renderer 中有 `var(...)` 直接引用 | 417 |
| 在组件/全局样式/editor 中真实消费 | 337 |
| 只在 bootstrap 或 fallback CSS 中引用 | 80 |
| 当前没有直接引用 | 196 |

按命名空间看，使用情况大致是：

| 命名空间 | 输出 | 当前真实消费 | 怎么理解 |
| --- | ---: | ---: | --- |
| `--ui-*` | 190 | 120 | 主消费层。组件应该优先使用这里。 |
| `--hg-*` | 105 | 97 | 代码高亮层。很多变量只在 markdown/editor/code theme 中用。 |
| `--text-*` | 59 | 32 | legacy 文本层，仍被大量旧组件和 fallback 使用。 |
| `--bg-*` | 43 | 17 | legacy 背景层，很多作为 `--ui-surface-*` fallback。 |
| `--color-neutral-*` | 46 | 2 | 新 neutral canonical 层，目前主要是 API 和 fallback，组件迁移还没大规模使用。 |
| `--neutral-*` | 24 | 0 | neutral 短别名，当前主要是兼容/桥接。 |
| `--text-color-*` / `--border-color-*` / `--fill-color-*` / `--bg-color-*` | 21 | 0 | 更通用设计系统命名的桥接层，目前基本是储备接口。 |
| `--tool-*` | 11 | 10 | tool card 局部层，基本都在用。 |
| `--diff-*` | 6 | 6 | diff 视图局部层，全部有消费；问题是非 Flexoki 主题没有运行时输出。 |
| `--accent*` | 5 | 2 | legacy accent 层，变量数少但引用次数很高。需要控制继续扩散。 |
| `--primary*` | 2 | 1 | primary 兼容变量本身用得少，但 primary 语义会通过 `--ui-*`/`--accent` 间接影响 UI。 |

所以，当你看到系统输出了很多颜色时，不要把它理解成“613 个颜色都在界面上各自出现”。更准确地说：

- `--ui-*` 是当前组件真正应该面向的语义层。
- `--bg-*`、`--text-*`、`--border-*` 是历史兼容层，仍然有很多真实消费。
- `--color-primary`、`--color-neutral-*` 是新标准层，但目前主要负责标准化和桥接，组件迁移还没有全部切过去。
- `--text-color-*`、`--fill-color-*`、`--bg-color-*` 这类变量现在更多是“给未来和兼容用的接口”。
- 一个颜色语义可能通过多个变量名影响界面，不能只看某个变量名有没有直接被引用。

因此，调颜色时不要直接从“这个组件颜色很怪”跳到“改组件里的 hex”。更稳的判断顺序是：

1. 如果所有主题里同一类东西都怪，优先看 `resolver.ts` 的语义派生或 role mapping。
2. 如果只有某个主题怪，优先改该主题 JSON 的 `bg/text/border/color/accent`。
3. 如果只有某个组件怪，先看它是不是用错了语义变量，例如把普通文本写成了 `--accent`，再决定是否调整局部 token。
4. 如果只是 fallback 看起来怪，改 `variables.css`；但这应该是最后一层，不是主题设计入口。

## 实际调色入口

调色时可以按下面这个顺序抓主线：

| 想调整的问题 | 优先改哪里 | 不建议先改哪里 |
| --- | --- | --- |
| 整个 app 氛围不对 | 主题 JSON 的 `bg.app/chat/panel/elevated/floating`、`text.primary/secondary/muted/faint`、`border.default/subtle/strong` | 单个 Vue 组件里的颜色 literal |
| 主按钮、focus、强调色太跳 | `theme.primary`，或旧主题里的 `accent/accentMain/accentSub` | 到处替换 `--accent` |
| 成功/警告/危险/信息色不协调 | `theme.color.success/warning/danger/info` 和 `*Light` | 组件里的 `#ef4444`、`#f59e0b` fallback |
| 中性色层级乱 | 优先让 `text.*`、`border.*`、`bg.*` 合理；必要时显式写 `neutral.*` | 在组件里新建一堆灰色 |
| Markdown/link 颜色不对 | `text.link/linkHover`，组件侧用 `--ui-text-link-fg` | 继续直接用 `--accent` |
| Tool card 或代码块不舒服 | `--ui-tool-*`、`text.code.*`、`syntax.*` 派生 | 普通 `--ui-text-*` 一把梭 |
| 只有某个按钮组件怪 | `Button.vue` 的 `--app-button-*` 是否正确派生自 `--ui-action-*` | 改全局主题色去迁就一个按钮 |

一套主题最小要先调清楚这些颜色：

| 基础角色 | 作用 |
| --- | --- |
| `bg.app` | 最外层应用背景。 |
| `bg.chat` / `bg.panel` | 主阅读区和面板背景，是视觉面积最大的颜色。 |
| `bg.elevated` / `bg.floating` | 弹层、菜单、浮动面板层级。 |
| `text.primary` / `secondary` / `muted` / `faint` | 文本明暗层级。大部分“看起来脏/灰/糊”来自这里。 |
| `border.default` / `subtle` / `strong` | 结构线层级。过强会碎，过弱会糊。 |
| `primary` / `accentMain` / `accentSub` | 主操作、focus、少量强调。不要拿它当普通文本色。 |
| `color.success/warning/danger/info` | 状态色。它们应该和主题和谐，但需要保持可识别。 |

如果你觉得“好多地方都很奇怪”，最可能不是某一个颜色错，而是下面几类问题叠加：

- 背景层级没有拉开：`bg.app/chat/panel/elevated/floating` 太接近，界面会糊成一片。
- 文本层级太散：`text.secondary/muted/faint` 对比关系不稳定，小字会忽明忽暗。
- `--accent` 被当成万能强调色：链接、focus、按钮、badge 全都抢同一种颜色，会显得吵。
- 局部 token 太多但缺少约束：`--app-button-*`、`--settings-*`、`--md-*`、`--tool-*` 如果没有从 `--ui-*` 派生，就会各玩各的。
- 非 Flexoki 主题缺 `diff.*` 输出：diff 视图会落回 Flexoki fallback，和当前主题不一定搭。

一个比较稳的调色流程：

1. 先只调主题 JSON 的基础面：`bg.*`、`text.*`、`border.*`。
2. 再调 `primary/accent`，确认主按钮、focus、选中态不刺眼。
3. 再调 `color.*` 状态色，确保 danger/warning/success/info 不像外来色。
4. 跑一次主题 gallery 或手动看 chat、settings、tool、markdown、modal 这几个高频面。
5. 如果所有主题都有同类问题，改 resolver/role mapping；如果只有一个组件问题，改组件局部 token。

## 主题管线

```text
src/main/themes/builtin/*.json
        |
        v
resolveTheme(theme, mode)
  - 展开 theme.* leaf
  - 解析 defs 引用和 dark/light variant
  - 派生 primary/status/neutral 语义
        |
        +--> resolveThemeHighlights()
        |      21 个 syntax.* token，默认从 text.code.* 派生
        |
        +--> resolveThemeUI()
               98 个 ui.* token，统一由 role mapping 派生，不读取 theme.ui override
        |
        v
generateCSSVariables()
  - CSS_VAR_MAP 输出 legacy vars
  - highlight 输出 --hg-* 和 --hljs-* 兼容变量
  - UI token 输出 --ui-* 和 legacy alias
  - RGB triplet 输出 --*-rgb
        |
        v
renderer: document.documentElement.style.setProperty()
```

启动时 `index.html` 会先读取 `localStorage.cached-theme-css` 并以内联样式写入 CSS 变量，避免 FOUC。Vue 启动后 `src/renderer/stores/themes.ts` 会根据 settings 中的 `darkThemeId`/`lightThemeId` 请求 main process 的 `applyTheme()`，再覆写根节点变量。

`src/renderer/styles/themes/dark.css` 和 `light.css` 基本是占位文件，真正的 CSS fallback 在 `variables.css` 和 `flexoki-colors.css`。

## 已完成的颜色语义扩展

这次扩展给主题系统补了一层更接近设计系统的颜色合同：

| 语义层 | 类型入口 | resolver 行为 | CSS 输出 |
| --- | --- | --- | --- |
| Primary | `theme.primary` | 优先级为 `primary -> accentMain -> accent -> #4385BE`。如果显式 `primary` 不是简单指向 `accent`/`accentMain`，会同步覆盖旧 `accent` 和 `accentMain`，保证新语义优先。 | `--color-primary`、`--primary`、`--color-primary-rgb`、`--primary-rgb` |
| Status | `theme.color.success/warning/danger/info` | 从显式 `color.*`、旧 `text.*`/`border.*`/`diff.*` 以及默认值派生；`*Light` 缺失时派生 15% 透明背景。 | `--color-danger`、`--color-warning`、`--color-success`、`--color-info` 及 light/RGB 变量 |
| Neutral | `theme.neutral.*` 24 个 token | 从显式 `neutral.*`、旧 `text.*`、`border.*`、`bg.*` 以及默认值派生。 | `--color-neutral-*`、`--neutral-*`、`--text-color-*`、`--border-color-*`、`--fill-color-*`、`--bg-color-*` 及 neutral RGB |

关键实现位置：

- `src/shared/ipc/themes.ts`: `ThemeColors.primary`、`ThemeNeutralColors`、`ThemeColors.neutral`。
- `src/main/themes/resolver.ts`: `resolveThemeColorSemantics()` 和 `applyThemeColorSemantics()`。
- `src/main/themes/css-mapper.ts`: primary/status/neutral 到 CSS 变量和 RGB 变量的映射。
- `src/renderer/styles/variables.css`: 启动和 fallback 阶段的默认语义变量。
- `src/renderer/components/common/Badge.vue`、`src/renderer/components/common/Button.vue`: 已开始把状态/黑白硬编码迁到语义变量。

当前内置主题 JSON 的 leaf 数没有因为这次扩展增加：它们仍主要提供旧的 `accent/bg/text/border/color` 输入，`primary/status/neutral` 在 resolver 层派生。这是有意的兼容策略，不是缺失。

## 内置主题定义

内置主题入口在 `src/main/themes/index.ts`，默认主题是 `flexoki`。自定义主题目录为 `~/.onething/themes`，项目主题目录为 `<project>/.start-electron/themes`。

| 主题 id | 名称 | 文件 | scheme | defs | theme leaf | diff leaf |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `catppuccin-latte` | Catppuccin Latte | `catppuccin-latte.json` | light | 26 | 128 | 0 |
| `catppuccin` | Catppuccin Mocha | `catppuccin.json` | auto | 26 | 128 | 0 |
| `dracula` | Dracula | `dracula.json` | auto | 14 | 128 | 0 |
| `flexoki` | Flexoki | `flexoki.json` | auto | 26 | 134 | 6 |
| `github-dark` | GitHub Dark | `github-dark.json` | dark | 17 | 128 | 0 |
| `github-light` | GitHub Light | `github-light.json` | light | 17 | 128 | 0 |
| `gruvbox-dark` | Gruvbox Dark | `gruvbox-dark.json` | dark | 27 | 128 | 0 |
| `gruvbox-light` | Gruvbox Light | `gruvbox-light.json` | light | 27 | 128 | 0 |
| `nord` | Nord | `nord.json` | auto | 16 | 128 | 0 |
| `one-dark` | One Dark | `one-dark.json` | dark | 13 | 128 | 0 |
| `one-light` | One Light | `one-light.json` | light | 13 | 128 | 0 |
| `rose-pine` | Rosé Pine | `rose-pine.json` | dark | 15 | 128 | 0 |
| `solarized-dark` | Solarized Dark | `solarized-dark.json` | dark | 16 | 128 | 0 |
| `solarized-light` | Solarized Light | `solarized-light.json` | light | 16 | 128 | 0 |
| `tokyo-night` | Tokyo Night | `tokyo-night.json` | auto | 17 | 128 | 0 |

### Theme leaf 覆盖

共有 134 个不同 theme leaf，其中 128 个在全部 15 个内置主题中存在。只有下面 6 个是部分覆盖，且只在 Flexoki 中显式定义：

| theme path | 覆盖主题数 |
| --- | ---: |
| `diff.addBg` | 1 |
| `diff.addText` | 1 |
| `diff.delBg` | 1 |
| `diff.delText` | 1 |
| `diff.hunkBg` | 1 |
| `diff.hunkText` | 1 |

通用 128 个 leaf 的大致分组：

| 分组 | leaf 数 | 说明 |
| --- | ---: | --- |
| accent 输入 | 4 | `accent`, `accentMain`, `accentSub`, `accentRgb`；`primary` 当前由 resolver 从这些值或显式新字段派生。 |
| `bg.*` | 37 | app/sidebar/chat/panel/message/tool/input/button/code/menu/modal/selection/state |
| `text.*` | 48 | primary/muted/status/link/user/ai/tool/sidebar/input/button/code/menu/form |
| `border.*` | 14 | default/subtle/strong/accent/status/input/message/code/divider |
| `shadow.*` | 10 | xs 到 xl、inner、glow、elevated、floating |
| `effects.*` | 7 | gradients、hover/active/disabled overlay、backdrop blur |
| `color.*` | 8 | danger/warning/success/info 及 light 版本；缺失时 resolver 会派生。 |

所有内置主题当前都没有 `theme.ui` override，也没有 `highlights.semanticTokens` 或 highlight groups。语法高亮默认从 `theme.text.code.*` 派生。

## CSS 变量输出

`src/main/themes/css-mapper.ts` 的主映射表当前包含：

| 项 | 数量 |
| --- | ---: |
| `CSS_VAR_MAP` theme path | 182 |
| `CSS_VAR_MAP` legacy CSS var | 258 |
| `UI_LEGACY_VAR_MAP` legacy var | 153 |
| semantic highlight token | 21 |
| semantic UI token | 98 |
| neutral token | 24 |

实际运行时 `applyTheme()` 输出量如下：

| 主题 | mode | 输出变量数 |
| --- | --- | ---: |
| `flexoki` | dark | 613 |
| `nord` | dark | 602 |
| 其他 13 个内置主题 | 对应 dark/light | 607 |

Flexoki dark 输出变量按命名空间分布：

| 命名空间 | 变量数 |
| --- | ---: |
| `--ui-*` | 190 |
| `--hg-*` | 105 |
| `--text-*` | 64 |
| `--color-*` | 63 |
| other legacy aliases | 54 |
| `--bg-*` | 46 |
| `--neutral-*` | 24 |
| `--border-*` | 22 |
| `--shadow-*` | 11 |
| `--tool-*` | 11 |
| `--hljs-*` | 10 |
| `--diff-*` | 6 |
| `--accent*` | 5 |
| `--primary*` | 2 |

`CSS_VAR_MAP` 中有 49 个 path 没有被内置主题显式定义，主要是 `neutral.*`、disabled、tooltip/modal 文本、tool error/success、modal overlay、input disabled 等。这些并不一定是缺失，因为 resolver 会从已有主题值派生，或由 `variables.css` 提供 fallback。

一个容易误读的点是 `text.info`: 它不在主 `CSS_VAR_MAP` 中，但运行时通过 `ui.status.info` legacy alias 输出 `--text-info`，因此当前不是实际缺失。

新增 primary/neutral 语义的输出可以这样理解：

| 输出族 | 变量 | 说明 |
| --- | --- | --- |
| Primary | `--color-primary`、`--primary`、`--color-primary-rgb`、`--primary-rgb` | 统一默认品牌/主操作色；当前旧 `--accent*` 仍保留兼容。 |
| Neutral canonical | `--color-neutral-*` | 24 个中性色标准语义，覆盖 text、border、fill、background 层级。 |
| Neutral compatibility | `--neutral-*` | 同一批 neutral 的短别名。 |
| Element-style aliases | `--text-color-*`、`--border-color-*`、`--fill-color-*`、`--bg-color-*` | 面向更通用设计系统命名的桥接层，方便组件逐步从 legacy 迁移。 |
| Neutral RGB | `--color-neutral-*-rgb` | 只在值可解析为 hex 时输出，用于透明度组合。 |

## Renderer fallback

`src/renderer/styles/variables.css` 同时承担三类职责：

1. 基础 design token: typography、radius、space、z-index、animation。
2. Flexoki fallback theme: dark/light 两套 `--bg-*`, `--text-*`, `--border-*`, `--shadow-*`, `--diff-*` 等。
3. runtime semantic alias fallback: `--ui-*`, `--tool-*`, `--md-*`, `--todo-*`, `--app-button-*` 等。

`src/renderer/styles/flexoki-colors.css` 定义 Flexoki palette：

- base neutral: `--fx-paper`, `--fx-base-50` 到 `--fx-base-950`, `--fx-black`
- named accents: red/orange/yellow/green/cyan/blue/purple/magenta
- extended shades: 每个 accent 50 到 900
- alpha token: `--fx-alpha-5` 到 `--fx-alpha-90`

`[data-color-theme]` 仍然存在，用于早期/legacy accent 切换：blue、purple、green、orange、cyan、red、pink。运行时完整 JSON theme 会通过 inline CSS 变量覆盖大部分这些 fallback。

## UI 消费统计

主运行时代码扫描结果，排除测试和内置主题 JSON：

| 指标 | 数量 |
| --- | ---: |
| 扫描文件 | 554 |
| 有颜色信号文件 | 161 |
| CSS var declaration unique/total | 1,232 / 2,020 |
| CSS var reference unique/total | 1,377 / 10,155 |
| 硬编码颜色 unique/total | 367 / 1,094 |
| `color-mix(...)` unique/total | 594 / 888 |
| gradient unique/total | 32 / 37 |

排除 `variables.css` 和 `flexoki-colors.css` 后，组件/业务代码侧仍有：

| 指标 | 数量 |
| --- | ---: |
| 扫描文件 | 552 |
| 有颜色信号文件 | 159 |
| CSS var declaration unique/total | 523 / 1,026 |
| CSS var reference unique/total | 1,239 / 9,508 |
| 硬编码颜色 unique/total | 231 / 745 |
| `color-mix(...)` unique/total | 583 / 871 |
| gradient unique/total | 28 / 29 |

组件侧引用最多的变量族：

| 命名空间 | unique | refs | files |
| --- | ---: | ---: | ---: |
| `--ui-*` | 156 | 3,443 | 138 |
| other/local vars | 656 | 3,248 | 130 |
| `--text-*` | 29 | 537 | 84 |
| `--accent*` | 3 | 526 | 100 |
| typography | 61 | 325 | 50 |
| `--bg-*` | 21 | 259 | 73 |
| layout/non-color | 22 | 220 | 50 |
| `--hg-*` | 98 | 206 | 6 |
| `--tool-*` | 21 | 158 | 6 |
| `--border-*` | 23 | 146 | 39 |
| `--todo-*` | 28 | 129 | 4 |
| `--color-*` | 8 | 90 | 23 |
| `--md-*` | 54 | 75 | 2 |

颜色信号最多的组件/文件：

| 文件 | var refs | var decls | hard colors | color-mix | gradients |
| --- | ---: | ---: | ---: | ---: | ---: |
| `src/renderer/components/chat/InputBox.vue` | 346 | 85 | 18 | 58 | 0 |
| `src/renderer/components/common/Container.vue` | 331 | 110 | 0 | 0 | 0 |
| `src/renderer/components/memory/MemoryPanelContent.vue` | 256 | 65 | 16 | 37 | 1 |
| `src/renderer/components/SettingsPage.vue` | 278 | 36 | 4 | 49 | 0 |
| `src/renderer/components/SchedulerPanelContent.vue` | 300 | 6 | 21 | 37 | 0 |
| `src/renderer/editor/markdown-live-preview.ts` | 296 | 0 | 20 | 39 | 0 |
| `src/renderer/components/chat/ChatInspectorPanel.vue` | 285 | 0 | 14 | 36 | 0 |
| `src/renderer/components/common/Button.vue` | 154 | 120 | 17 | 14 | 0 |
| `src/renderer/components/settings/provider/ProviderModels.vue` | 254 | 0 | 11 | 31 | 0 |
| `src/renderer/components/common/LayoutGrid.vue` | 185 | 60 | 0 | 0 | 0 |

## 硬编码颜色使用情况

硬编码颜色需要分三类看。

### 1. 语义变量 fallback

这类是目前最多的硬编码颜色，例如：

- `var(--ui-status-danger-fg, #ef4444)`
- `var(--ui-status-warning-fg, #f59e0b)`
- `var(--ui-status-success-fg, #10b981)`
- `var(--ui-border-default-border, var(--border, rgba(128, 128, 128, 0.28)))`

这些值只有在对应 semantic var 缺失时才生效。风险相对低，但会增加审计噪音，也容易让新增代码复制 literal fallback。

### 2. 裸 overlay/shadow

常见值包括 `rgba(0, 0, 0, 0.03)`, `rgba(0, 0, 0, 0.15)`, `rgba(0, 0, 0, 0.6)`, `rgba(255, 255, 255, 0.15)`。它们主要用于 shadow、modal overlay、hairline surface、hover overlay。

这类颜色跟主题模式相关，但不一定跟主题 palette 相关。短期可接受，长期建议逐步收敛到 `--ui-surface-*-shadow`、`--ui-surface-overlay-bg`、`--ui-state-hover-bg` 或 `color-mix()`。

### 3. Parser/default palette

`src/main/themes/base46-parser.ts` 和 resolver 中有默认 palette/状态色，例如 Dracula 风格 fallback、Flexoki fallback、通用 `#F9FAFB`/`#111827` 可读文本 fallback。这些属于导入器和算法默认值，不是普通 UI 直接消费。

硬编码出现频次最高的值：

| 值 | 次数 | 典型用途 |
| --- | ---: | --- |
| `#ef4444` | 83 | danger fallback |
| `#f59e0b` | 23 | warning fallback |
| `#fff` | 21 | preview/default contrast fallback |
| `#10b981` | 18 | success fallback |
| `rgba(0, 0, 0, 0.03)` | 14 | shadow/surface overlay |
| `rgba(0, 0, 0, 0.2)` | 13 | shadow/overlay |
| `rgba(0, 0, 0, 0.3)` | 13 | shadow/overlay |
| `rgba(0, 0, 0, 0.4)` | 12 | shadow/overlay |
| `rgba(0, 0, 0, 0.15)` | 12 | shadow/overlay |
| `rgba(239, 68, 68, 0.1)` | 10 | danger background fallback |
| `rgba(128, 128, 128, 0.1)` | 10 | neutral settings fallback |
| `#dc2626` | 9 | danger hover/legacy fallback |

## 主要颜色命名空间

| 命名空间 | 来源 | 当前用途 | 风险/备注 |
| --- | --- | --- | --- |
| `theme.defs.*` | 内置/自定义主题 JSON | 主题内部 palette alias | 不应被组件直接消费 |
| `theme.primary/bg/text/border/shadow/effects/color/neutral/diff` | 主题 JSON + resolver 派生 | resolver 输入和标准化结果 | 内置主题 JSON 主要写旧输入；`primary`/`neutral` 可显式写，也可自动派生；`diff.*` 只有 Flexoki 显式覆盖 |
| `--ui-*` | resolver + `variables.css` fallback | 现代 UI 语义变量 | 组件主消费方向，当前覆盖面最大 |
| `--hg-*` | resolver highlight | CodeMirror/highlight.js 语法样式 | 只用于代码高亮 |
| `--hljs-*` | highlight legacy alias | highlight.js 兼容 | 逐步由 `--hg-*` 主导 |
| `--bg-*`, `--text-*`, `--border-*` | legacy mapper + fallback | 旧组件和 fallback | 仍大量存在，建议只作为 fallback |
| `--accent*` | legacy theme/color-theme | primary action、focus、少量强调 | 引用仍多；新语义优先看 `--color-primary` / `--ui-accent-primary-fg` |
| `--color-primary`, `--primary` | resolver primary semantics | 默认主色/品牌色/主操作桥接 | 新增语义层；旧 `accent` 会保持兼容 |
| `--color-*` | primary/status/neutral semantics | `--color-primary`、danger/warning/success/info、`--color-neutral-*` | 颜色系统的新标准输出之一 |
| `--neutral-*`, `--text-color-*`, `--border-color-*`, `--fill-color-*`, `--bg-color-*` | neutral compatibility aliases | 文本、边框、填充、背景的中性色层级 | 用于承接更通用的设计系统命名 |
| `--tool-*` | UI mapper + `variables.css` | tool card/diff preview | 已基本从 `--ui-tool-*` 派生 |
| `--md-*` | `markdown.css` | markdown/code block 局部 token | 合理的局部层，需继续依赖 `--ui-*` |
| `--todo-*` | todo panel/popover | todo popover 布局和颜色 | 有测试要求不出现裸色 |
| `--app-button-*` | common Button/local overrides | button 局部 token | 使用广泛，建议保持从 `--ui-action-*` 或 `--ui-text-*` 派生 |
| `--settings-*` | SettingsPage/settings components | settings 局部 surface/text/rule | 当前是局部 token 层，需要持续保证从 `--ui-*` 派生 |

## 现有测试护栏

主题相关测试已经覆盖了几类关键约束：

- `src/main/themes/__tests__/builtin-theme-contrast.test.ts`
  - 内置主题不使用 per-theme `theme.ui` override。
  - Nord/GitHub Light 等关键文本 token 需要保持可读。
  - 核心 `ui.*` surface/text/action/status 可读性。
- `src/main/themes/__tests__/ui-tokens.test.ts`
  - 验证 `resolveThemeUI()` 和 `generateCSSVariables()` 输出 `--ui-*`、neutral、tool、sidebar、tab 等变量。
- `src/main/themes/__tests__/highlight-groups.test.ts`
  - 验证 `text.code.*` 派生 `syntax.*`, `--hg-*`, `--hljs-*`, `--syntax-*`。
- `src/renderer/styles/__tests__/ui-token-vars.test.ts`
  - 验证高价值 UI surface 直接走 `--ui-*`。
  - 验证组件颜色不直接使用 legacy 颜色变量或裸 hex。
  - 验证 todo window/panel/popover 不出现裸色。

这些测试说明当前方向很明确：组件优先消费 `--ui-*`、`--hg-*`、`--diff-*` 或局部 token，legacy 变量主要作为 fallback。

本次 primary/neutral 扩展的验证记录：

| 命令 | 结果 |
| --- | --- |
| `npx vitest run src/main/themes/__tests__` | 通过，24 tests。 |
| `npx vitest run src/renderer/styles/__tests__/ui-token-vars.test.ts` | 通过。 |
| `npx vitest run src/renderer/components/common/__tests__/Button.test.ts` | 通过。 |
| `npx tsc --noEmit -p tsconfig.node.json --composite false` | 通过。 |
| `npx tsc --noEmit -p tsconfig.web.json --composite false` | 失败在既有 `CollapsePanel.test.ts` slot 参数隐式 `any`，不是本次颜色语义扩展引入。 |

## 风险和建议

1. 补齐 `diff.*` 派生逻辑。

   现在只有 Flexoki 会在运行时输出 `--diff-*`，其他主题依赖 `variables.css` fallback。建议在 resolver 中从 `color.successLight`, `color.dangerLight`, `color.success`, `color.danger`, `text.muted` 派生 `diff.*`，即使主题 JSON 没显式定义也能输出。

2. 收敛 status fallback literal。

   `#ef4444`, `#f59e0b`, `#10b981` 大量作为 `var(--ui-status-*, #literal)` fallback 出现。`Badge.vue` 和 `Button.vue` 已经开始切到 status/neutral 语义变量；后续建议继续用 `var(--ui-status-danger-fg, var(--color-danger))` 这类 fallback，把 literal 留在 `variables.css` 和 resolver 默认值里。

3. 控制 `--accent` 使用边界。

   组件侧 `--accent` 仍有 523 次引用，很多是 `--ui-accent-primary-fg` fallback 或 primary action，合理；但 `markdown.css` 中 link 仍直接用 `--accent`。如果要降低 accent 泄漏，普通链接建议统一改走 `--ui-text-link-fg`。

4. 明确局部 token 层的职责。

   `--settings-*`, `--app-button-*`, `--md-*`, `--todo-*` 已经是事实上的局部 token 层。它们不是坏事，但应明确规则：局部 token 可以存在，但必须从 `--ui-*`、`--hg-*`、`--diff-*` 或 status/neutral token 派生，不直接引入 palette literal。

5. 保持 `variables.css` 是 fallback，而不是新主题源。

   `variables.css` 很大，包含 fallback theme、semantic aliases 和局部 token。新增主题色时应优先改 JSON/resolver/mapper；只有启动 fallback 或局部默认才放进 `variables.css`。

6. 将扫描脚本固化为审计命令。

   本次使用临时 Node/Bun 脚本统计 var refs、hard colors 和运行时 `applyTheme()` 输出。建议后续放入 `scripts/` 或测试中，至少检查：
   - 非 theme/fallback 文件中的裸 hex/rgba 新增量。
   - `--accent` 直接引用新增量。
   - 每个内置主题 `applyTheme()` 是否输出核心 `--ui-*`, `--hg-*`, `--diff-*`。

## 后续可执行清单

| 优先级 | 事项 | 目标文件 |
| --- | --- | --- |
| P1 | 为非 Flexoki 主题派生 `diff.*` 并输出 `--diff-*` | `src/main/themes/resolver.ts`, `css-mapper.ts` |
| P1 | 增加内置主题 applyTheme 输出快照/核心变量测试 | `src/main/themes/__tests__/` |
| P2 | 把 Markdown link 从 `--accent` 改为 `--ui-text-link-fg` | `src/renderer/styles/markdown.css` |
| P2 | 将状态色 fallback literal 迁到 central fallback | `src/renderer/components/`, `src/renderer/styles/variables.css` |
| P2 | 为 `--settings-*` 局部 token 写一段约束说明或测试 | `src/renderer/components/SettingsPage.vue`, `ui-token-vars.test.ts` |
| P3 | 将本次扫描脚本产品化 | `scripts/` |
