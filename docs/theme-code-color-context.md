# Code Color Theme Context

This document records the current theme-color context for Markdown code blocks, inline code, syntax highlighting, and related tool/diff code surfaces.

## Scope

This document covers:

- Markdown inline code: `` `foo` ``
- Markdown fenced code blocks: ```lang ... ```
- Highlight.js syntax classes (`.hljs-*`)
- Code-related theme JSON fields (`theme.text.code.*`, `theme.bg.code.*`, `theme.border.code`)
- Renderer fallback CSS variables in `variables.css`
- Tool-card syntax variables (`--syntax-*`) where they relate to code/diff highlighting

It does **not** define the final design yet. It is a snapshot of the current architecture and the issues found during the code-color investigation.

---

## 当前主题色系统设计

产品级原：

> Code color theme should optimize for readability inside an AI chat interface, not for IDE-level expressiveness. Syntax highlighting should be muted, semantic, and role-distinct. Accent color must not leak into ordinary code text.
>
> 代码主题应该优先服务于 AI 聊天界面里的阅读，而不是 IDE 级别的强表达。语法高亮要克制、有语义区分、层次清楚。accent 颜色不能泄漏到普通代码文本里。

当前主题系统是一个 **语义主题（semantic theme）→ CSS 变量 → 组件消费** 的三层设计。

### 1. Palette / defs：主题自己的色板

每个内置主题在 `src/main/themes/builtin/*.json` 中先定义自己的基础色板：

```json
{
  "defs": {
    "base900": "#E6E4D9",
    "blue": "#4385BE",
    "green": "#879A39",
    "magenta": "#CE5D97"
  }
}
```

这些名字只在主题内部有意义。不同主题可以叫 `fg`、`text`、`mauve`、`nord9`、`base900` 等。

### 2. Semantic theme：把色板分配给 UI 语义角色

主题真正暴露给应用的是 `theme` 字段：

```json
{
  "theme": {
    "accent": "blue",
    "bg": {
      "app": "base100",
      "chat": "base150",
      "code": {
        "inline": "base200",
        "block": "base150",
        "header": "base200"
      }
    },
    "text": {
      "primary": "base950",
      "ai": {
        "primary": "base900"
      },
      "code": {
        "inline": "base900",
        "block": "base900",
        "comment": "base500",
        "keyword": "purple",
        "string": "green",
        "number": "orange",
        "function": "blue",
        "variable": "cyan",
        "operator": "base700"
      }
    }
  }
}
```

这一层表达的是“这个颜色用于什么”，而不是“这个颜色是什么”。

### 3. CSS variable mapper：把语义角色落到组件变量

`src/main/themes/css-mapper.ts` 把 theme path 映射到 CSS 变量，例如：

```ts
'bg.code.inline'   → '--bg-code-inline'
'bg.code.block'    → '--bg-code-block'
'text.code.inline' → '--text-code-inline'
'text.code.block'  → '--text-code-block'
'text.code.keyword'→ '--text-code-keyword' + '--hljs-keyword'
```

组件最终只消费 CSS 变量，不直接读主题 JSON。

### 4. Renderer fallback：没有主题变量时的默认值

`src/renderer/styles/variables.css` 提供默认值，但它只是 fallback。运行时主题通过 `document.documentElement.style.setProperty(...)` 写入的变量优先级更高。

所以：

```text
主题 JSON 生成的 CSS variable > variables.css fallback
```

这也是之前只改 `variables.css` 没能完全解决 code 粉色问题的原因。

---

## 架构级颜色选取规则

下面这些规则描述“一个组件应该从哪里拿颜色”。它们比具体主题值更重要：主题可以换，但组件的颜色语义不能乱。

### 总原则

1. **组件只消费语义 CSS 变量，不直接消费主题 palette 名称。**
   - ✅ `color: var(--text-ai-primary)`
   - ✅ `background: var(--bg-code-block)`
   - ❌ `color: var(--fx-magenta)`
   - ❌ `color: #ff79c6`
2. **主题 JSON 决定颜色值，组件决定颜色角色。**
   - 主题负责“`text.code.keyword` 是什么颜色”。
   - 组件负责“这里是 keyword，所以用 `--text-code-keyword`”。
3. **`variables.css` 是 fallback，不是最终主题源。**
   - 如果当前主题通过 IPC 写入了同名 CSS 变量，主题值优先生效。
4. **不要为了视觉效果跨语义借色。**
   - code 不应该借 `accent`。
   - error 不应该借 `syntax-string`。
   - tool UI 不应该借 `--syntax-*`。
5. **允许派生变量，但派生必须保持语义。**
   - ✅ `--syntax-keyword: var(--text-code-keyword)`
   - ✅ `--tool-ok: var(--color-success)`
   - ❌ `--text-code-inline: var(--accent)`

### 颜色命名空间规则

| Namespace | 用途 | 谁来定义 | 谁来消费 | 规则 |
| --- | --- | --- | --- | --- |
| `theme.defs.*` | 主题内部 palette | 主题 JSON | resolver 内部 | 只在主题 JSON 内引用，不给组件直接用 |
| `theme.bg.*` | 背景语义 | 主题 JSON | mapper → CSS vars | app/chat/panel/code/input 等背景 |
| `theme.text.*` | 文本语义 | 主题 JSON | mapper → CSS vars | 普通文本、AI/user 文本、code 文本 |
| `theme.border.*` | 边框语义 | 主题 JSON | mapper → CSS vars | panel/code/input/message 等边框 |
| `theme.color.*` | 状态语义 | 主题 JSON | mapper → CSS vars | success/warning/danger/info |
| `theme.diff.*` | diff 专用语义 | 主题 JSON | mapper → CSS vars | diff 背景/文字/hunk |
| `--accent` | 品牌/主强调 | theme + colorTheme | buttons/link/focus/selection | 不用于普通 code 文本 |
| `--text-code-*` | Markdown/code 语法 | theme.text.code.* | Markdown + hljs | 只用于 code/syntax |
| `--hljs-*` | highlight.js 兼容变量 | mapper 从 text.code.* 生成 | `hljs-theme.css` | 不作为组件 UI 色使用 |
| `--syntax-*` | 工具 diff 的轻量 syntax token | `variables.css` 派生 | `ToolDiffPreview.vue` | 只用于代码 token，不用于 UI badge/chrome |
| `--tool-*` | 工具卡 UI token | `variables.css` 派生 | Tool card 组件 | 不直接用 fixed palette，不借 `--syntax-*` |

### 背景颜色选取规则

| 场景 | 使用变量 | theme path | 说明 |
| --- | --- | --- | --- |
| App 根背景 | `--bg-app` / `--bg` | `bg.app` | BrowserWindow/app root 背景 |
| Chat 背景 | `--bg-chat` / `--chat-canvas` | `bg.chat` | 对话区域背景 |
| Sidebar | `--bg-sidebar` | `bg.sidebar` | 侧栏背景 |
| Panel/Card | `--bg-panel`, `--bg-elevated`, `--bg-floating` | `bg.panel`, `bg.elevated`, `bg.floating` | 按层级选，越浮越 elevated/floating |
| Message user | `--bg-message-user` | `bg.message.user` | 用户消息气泡，可为 gradient |
| Message AI | `--bg-message-ai` | `bg.message.ai` | AI 消息背景，常为 transparent |
| Message error | `--bg-message-error` | `bg.message.error` | 消息级错误背景 |
| Inline code | `--bg-code-inline` | `bg.code.inline` | 行内代码底色 |
| Code block | `--bg-code-block` | `bg.code.block` | fenced code 主体背景 |
| Code block header | `--bg-code-header` | `bg.code.header` | 语言/header/copy bar 背景 |
| Input | `--bg-input`, `--bg-input-focus` | `bg.input`, `bg.inputFocus` | 输入框普通/聚焦背景 |
| Hover/active | `--bg-hover`, `--bg-active` | `bg.hover`, `bg.active` | 通用 hover/active overlay |

规则：

- 背景优先从 `bg.*` 取，不从 `text.*` 或 `accent` 取。
- code 背景必须从 `bg.code.*` 取，不用 message/panel 背景临时代替，除非是明确 fallback。
- hover/active 是 overlay 语义，不应该被当成普通 surface 使用。

### 文本颜色选取规则

| 场景 | 使用变量 | theme path | 说明 |
| --- | --- | --- | --- |
| 主文本 | `--text-primary` | `text.primary` | App 通用主文本 |
| 次文本 | `--text-secondary` | `text.secondary` | 次级信息 |
| 弱文本 | `--text-muted`, `--text-faint` | `text.muted`, `text.faint` | meta、hint、时间等 |
| 用户消息 | `--text-user-primary`, `--text-user-secondary` | `text.user.*` | 用户 bubble 内文本 |
| AI 消息 | `--text-ai-primary`, `--text-ai-secondary` | `text.ai.*` | assistant Markdown 正文 |
| Thinking | `--text-ai-thinking` | `text.ai.thinking` | reasoning/thinking 文本 |
| Link | `--text-link` 或 `--accent` | `text.link` / `accent` | 需要统一：普通 link 建议用 `text.link`，强强调才用 `accent` |
| Label/helper | `--text-label`, `--text-helper` | `text.label`, `text.helper` | 表单与设置说明 |
| Error text | `--text-error` / `--color-danger` | `text.error` / `color.danger` | 文本错误优先 `text.error`，状态块/图标可用 `color.danger` |
| Code ordinary text | `--text-code-block` | `text.code.block` | code block 普通代码正文 |
| Inline code text | `--text-code-inline` | `text.code.inline` | 当前规则：应等于/接近 `text.code.block` |

规则：

- 正文层级用 `text.primary/secondary/muted/faint`。
- 聊天内容优先用 `text.ai.*` / `text.user.*`，不要直接用全局 `text.primary` 覆盖消息语义。
- 状态文本（error/success/warning/info）用状态语义，不用 syntax 或 accent。
- inline code 不跟随 `accent`，避免用户选择粉色 accent 后所有 code 变粉。

### Accent 颜色选取规则

`accent` 是品牌/交互强调色，不是“任何需要显眼的地方都用”。

允许使用 `--accent` 的场景：

- primary button 背景
- 当前选中项 / active item
- focus ring（如设计允许）
- 链接或引用线（需要统一决定 link 是否改用 `text.link`）
- 主题预览中的主色
- 少量品牌强调

禁止或不建议使用 `--accent` 的场景：

- 普通 Markdown code 文本
- syntax highlighting 默认 token
- error/warning/success 状态
- tool card 普通文字或边框
- diff add/delete
- 普通 meta/duration badge

### 状态颜色选取规则

状态色必须走 semantic color：

| 状态 | 使用变量 | theme path |
| --- | --- | --- |
| Danger/Error/Delete | `--color-danger`, `--text-error`, `--border-error` | `color.danger`, `text.error`, `border.error` |
| Warning | `--color-warning`, `--text-warning`, `--border-warning` | `color.warning`, `text.warning`, `border.warning` |
| Success/Add/OK | `--color-success`, `--text-success`, `--border-success` | `color.success`, `text.success`, `border.success` |
| Info | `--color-info`, `--text-info` | `color.info`, `text.info` |

规则：

- 删除/失败/拒绝不能用 syntax red，必须用 danger 语义。
- 新增/成功不能用 arbitrary green，必须用 success 语义。
- 状态背景建议用 `color-mix(in srgb, var(--color-*) X%, transparent)`，不要硬编码 rgba。

### Border 颜色选取规则

| 场景 | 使用变量 | theme path |
| --- | --- | --- |
| 普通边框 | `--border` / `--border-default` | `border.default` |
| 弱边框 | `--border-subtle` | `border.subtle` |
| 强边框 | `--border-strong` | `border.strong` |
| Code 边框 | `--border-code` | `border.code` |
| Input 边框 | `--border-input`, `--border-input-focus` | `border.input`, `border.inputFocus` |
| Message 边框 | `--border-message`, `--border-message-user` | `border.message`, `border.messageUser` |
| 状态边框 | `--border-error`, `--border-success`, `--border-warning` | `border.error`, `border.success`, `border.warning` |

规则：

- code block 边框用 `border.code`，不要从 `accent` 或 `danger` 借色。
- 工具卡内部细线用 `--tool-border`，它可以由基础 border 派生。
- 状态边框只在明确 error/success/warning 语义时使用。

### Markdown/code 颜色选取规则

| Code 角色 | 使用变量 | theme path | 推荐色相 |
| --- | --- | --- | --- |
| Inline code text | `--text-code-inline` | `text.code.inline` | 中性，接近 code block text |
| Inline code bg | `--bg-code-inline` | `bg.code.inline` | 比正文背景略深/浅 |
| Code block text | `--text-code-block` | `text.code.block` | 中性高对比 |
| Code block bg | `--bg-code-block` | `bg.code.block` | 低干扰 surface |
| Code header bg | `--bg-code-header` | `bg.code.header` | 与 block bg 区分但不抢眼 |
| Comment | `--text-code-comment` / `--hljs-comment` | `text.code.comment` | muted/faint，italic |
| Keyword | `--text-code-keyword` / `--hljs-keyword` | `text.code.keyword` | purple/blue-purple，可突出但不能铺满 |
| String | `--text-code-string` / `--hljs-string` | `text.code.string` | green/cyan-green |
| Number | `--text-code-number` / `--hljs-number` | `text.code.number` | orange/yellow，避免和 keyword 同色 |
| Function | `--text-code-function` / `--hljs-function` | `text.code.function` | blue/cyan |
| Variable | `--text-code-variable` / `--hljs-variable` | `text.code.variable` | neutral/cyan，不能比 function 更抢眼 |
| Operator | `--text-code-operator` / `--hljs-operator` | `text.code.operator` | muted neutral |
| Type | `--text-code-type` / `--hljs-type` | `text.code.type` | cyan/teal 或 theme type color |
| Property | `--text-code-property` / `--hljs-property` | `text.code.property` | blue/cyan 或 neutral |
| Punctuation | `--text-code-punctuation` / `--hljs-punctuation` | `text.code.punctuation` | muted neutral |

规则：

- inline code 不使用 keyword/string/number/function 色。
- code 普通文本不使用 accent。
- syntax palette 至少要形成层次：comment 最弱，block text 稳定，keyword/function/string/number 分工明确。
- 如果一个主题本身偏粉，不能让 keyword、number、inline 同时都偏粉，否则整块代码会显得“全粉”。

### Diff 颜色选取规则

| 场景 | 使用变量 | theme path |
| --- | --- | --- |
| Diff add bg | `--diff-add-bg` 或 success mix | `diff.addBg` / `color.success` |
| Diff add text/bar | `--diff-add-text`, `--color-success` | `diff.addText` / `color.success` |
| Diff delete bg | `--diff-del-bg` 或 danger mix | `diff.delBg` / `color.danger` |
| Diff delete text/bar | `--diff-del-text`, `--color-danger` | `diff.delText` / `color.danger` |
| Diff hunk | `--diff-hunk-bg`, `--diff-hunk-text` | `diff.hunkBg`, `diff.hunkText` |
| Diff code syntax | `--syntax-*` | derived from `text.code.*` | 只负责语法，不负责 add/delete 语义 |

规则：

- add/delete 的语义颜色优先级高于 syntax token。
- syntax token 可以出现在 diff 行内，但行的新增/删除背景和 gutter 必须用 success/danger。
- 不用 fixed red/green rgba；用 semantic color + `color-mix` 或 `diff.*`。

### Tool card 颜色选取规则

Tool card 有自己的 UI token：

```css
--tool-surface
--tool-surface-sub
--tool-border
--tool-ink
--tool-soft
--tool-faint
--tool-accent
--tool-accent-on
--tool-ok
--tool-del-bar
--tool-add-bar
```

规则：

- 工具卡 UI chrome 使用 `--tool-*`。
- 工具卡里的代码/输出文字可以用 `--tool-ink` / `--tool-soft` / mono font。
- 工具卡里的 syntax highlight 才使用 `--syntax-*`。
- `--syntax-*` 不用于 badge、duration、label、border。
- 成功/失败/新增/删除用 semantic `--color-success` / `--color-danger` 派生。
- 不直接使用 `--fx-*` palette 或 hardcoded hex。

### Shadow / overlay / opacity 规则

| 场景 | 使用变量 | theme path |
| --- | --- | --- |
| 常规 shadow | `--shadow-*` | `shadow.*` |
| hover overlay | `--overlay-hover` / `--bg-hover` | `effects.overlayHover` / `bg.hover` |
| active overlay | `--overlay-active` / `--bg-active` | `effects.overlayActive` / `bg.active` |
| disabled overlay | `--overlay-disabled` | `effects.overlayDisabled` |
| backdrop blur | `--blur-backdrop` | `effects.blurBackdrop` |

规则：

- 阴影和 overlay 不应该硬编码黑/白透明度，除非作为 fallback。
- `rgba(var(--*-rgb), alpha)` 或 `color-mix(...)` 优先于固定 rgba。
- 主题需要提供足够 RGB triplet 时由 mapper 生成，例如 `--accent-rgb`、`--color-danger-rgb`。

### Color theme (`data-color-theme`) 规则

Renderer 还有用户可选的 color theme：

```css
[data-color-theme="blue"]   { --accent: ... }
[data-color-theme="pink"]   { --accent: ... }
```

它主要覆盖 accent 家族：

```css
--accent
--accent-main
--accent-sub
--accent-rgb
```

规则：

- `data-color-theme` 只应该影响“强调色”相关 UI。
- 如果某个组件不应该随用户 accent 变色，就不要用 `--accent`。
- code、status、diff、tool 普通文字都不应该因为用户选 pink accent 而整体变粉。

### 禁止项清单

组件 CSS 中应避免：

```css
/* hardcoded theme color */
color: #ff79c6;
background: rgba(255, 85, 85, 0.1);

/* direct palette dependency */
color: var(--fx-magenta);

/* semantic mismatch */
--text-code-inline: var(--accent);
.error { color: var(--text-code-string); }
.badge { color: var(--syntax-keyword); }
.diff-delete { color: var(--text-code-keyword); }
```

推荐写法：

```css
.inline-code {
  color: var(--text-code-inline);
  background: var(--bg-code-inline);
}

.error {
  color: var(--text-error);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
}

.tool-card {
  color: var(--tool-ink);
  background: var(--tool-surface);
  border-color: var(--tool-border);
}
```

### 主题审计规则

后续可以把这些变成测试或脚本：

1. `theme.text.code.inline` 应等于或接近 `theme.text.code.block`。
2. `theme.text.code.block` 与 `theme.bg.code.block` 对比度合格。
3. `theme.text.code.comment` 与 block text 不同，并且更弱。
4. `keyword/string/number/function` 至少有 3 个不同色相或明显不同颜色。
5. `inline/code block ordinary text` 不依赖 `accent`。
6. `diff add/delete` 使用 success/danger 或 `diff.*`，不使用 syntax token 代替。
7. `tool card UI` 不直接使用 `--syntax-*`、`--fx-*` 或 hardcoded colors。
8. `data-color-theme="pink"` 不应让普通 code 文本、tool 普通文本、diff 普通文本整体变粉。

---

## Markdown 颜色选取规则

Markdown 渲染主要有两套样式入口：

- `src/renderer/styles/markdown.css`：共享 `.md-body` 样式。
- `src/renderer/components/chat/message/MessageBubble.vue`：聊天消息里针对 `.content :deep(...)` 的局部样式。

当前 Markdown 元素的颜色选择如下：

| Markdown 场景 | CSS selector | 使用变量 | 来自 theme path | 设计意图 |
| --- | --- | --- | --- | --- |
| 普通段落正文 | inherited from message container | `--text-ai-primary` / `--text-primary` 等 | `text.ai.primary` / `text.primary` | 普通聊天正文，不属于 code palette |
| 链接 | `.md-body a` | `--accent` 或 `--text-link`（不同入口有差异） | `accent` / `text.link` | 可点击强调色 |
| 引用左边线 | `.md-body blockquote` | `--accent` | `accent` | 引用的视觉强调 |
| inline code 文本 | `.inline-code` | `--text-code-inline` | `text.code.inline` | 行内代码文字，当前原则是接近 `text.code.block`，不跟随 accent |
| inline code 背景 | `.inline-code` | `--bg-code-inline` | `bg.code.inline` | 行内代码底色 |
| fenced code 背景 | `.code-block-container` | `--bg-code-block` | `bg.code.block` | 代码块主体背景 |
| fenced code header | `.code-block-header` | `--bg-code-header` | `bg.code.header` | 代码块语言/header 背景 |
| fenced code 边框 | `.code-block-container` | `--border-code` | `border.code` | 代码块边界 |
| fenced code 普通文本 | `.hljs` | `--text-code-block` | `text.code.block` | 未被语法高亮 token 覆盖的代码正文 |
| 注释 | `.hljs-comment`, `.hljs-quote` | `--hljs-comment` → `--text-code-comment` | `text.code.comment` | 弱化、可读但不抢眼 |
| 关键字 | `.hljs-keyword`, `.hljs-built_in`, `.hljs-literal` | `--hljs-keyword` → `--text-code-keyword` | `text.code.keyword` | 语法结构色 |
| 字符串 | `.hljs-string`, `.hljs-regexp`, `.hljs-symbol` | `--hljs-string` → `--text-code-string` | `text.code.string` | 字面量内容色 |
| 数字 | `.hljs-number` | `--hljs-number` → `--text-code-number` | `text.code.number` | 数值色 |
| 函数/标题 | `.hljs-title`, `.hljs-title.function_`, `.hljs-section` | `--hljs-function` → `--text-code-function` | `text.code.function` | 函数、标题、section 色 |
| 变量/属性 | `.hljs-variable`, `.hljs-attr`, `.hljs-attribute` | `--hljs-property` / `--hljs-variable` | `text.code.property` / `text.code.variable` | 标识符/属性色，当前还需要进一步统一 |
| 类型/class | `.hljs-type`, `.hljs-class`, `.hljs-title.class_` | `--hljs-type` | `text.code.type` | 类型色 |
| 运算符/标点 | `.hljs-operator`, `.hljs-punctuation` | `--hljs-operator` / `--hljs-punctuation` | `text.code.operator` / `text.code.punctuation` | 应该是低强调中性色 |
| diff addition | `.hljs-addition` | `--color-success` bg + string fg | `color.success` / `text.code.string` | 语义成功/新增 |
| diff deletion | `.hljs-deletion` | `--color-danger` | `color.danger` | 语义危险/删除 |

原则：

```text
Markdown 普通文本走 text.*
Markdown code 背景走 bg.code.*
Markdown code 普通文本走 text.code.block / inline
Markdown syntax token 走 text.code.keyword/string/number/...
Markdown diff add/delete 走 semantic color.success/color.danger
```

---

## 当前内置主题的 Markdown/code 颜色选取

下面是当前内置主题在 `theme.text.code.*` 上的语义引用。当前规则已经统一为：

- `inline === block`：行内代码使用普通代码正文色，不使用 accent / pink / magenta。
- `block`：使用主题主文本或接近主文本的中性色。
- `comment`：弱于普通 code text。
- `keyword/string/number/function`：至少形成 3 个明显不同的视觉角色。
- `number` 避免 magenta / pink。
- `operator/punctuation` 使用 muted neutral。

| Theme | inline | block | keyword | string | number | function | variable | comment | Pink-heavy | Readability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| catppuccin-latte | text | text | mauve | green | peach | blue | subtext1 | overlay1 | No | Pass |
| catppuccin | text | text | mauve | green | peach | blue | subtext1 | overlay1 | No | Pass |
| dracula | foreground | foreground | purple | green | orange | cyan | foreground | comment | No | Pass |
| flexoki | base900 | base900 | purple | green | orange | blue | base800 | base500 | No | Pass |
| github-dark | fg | fg | purple | green | orange | blue | fgMuted | fgSubtle | No | Pass |
| github-light | fg | fg | purple | green | orange | blue | fgMuted | fgMuted | No | Pass |
| gruvbox-dark | fg1 | fg1 | purple | green | orange | blue | fg2 | gray | No | Pass |
| gruvbox-light | fg1 | fg1 | purpleBright | greenBright | orangeBright | blueBright | fg2 | gray | No | Pass |
| nord | nord5 | nord5 | nord9 | nord14 | nord13 | nord8 | nord4 | nord3 | No | Pass |
| one-dark | fg | fg | purple | green | orange | blue | fg | #5C6370 | No | Pass |
| one-light | fg | fg | purple | green | orange | blue | fgDim | gutter | No | Pass |
| rose-pine | text | text | iris | pine | gold | foam | text | muted | No | Pass |
| solarized-dark | base1 | base1 | violet | cyan | orange | blue | base1 | base01 | No | Pass |
| solarized-light | base01 | base01 | violet | cyan | orange | blue | base01 | base1 | No | Pass |
| tokyo-night | fg | fg | blue2 | green | orange | blue | fgDark | comment | No | Pass |

`Pink-heavy` 的判断不是禁止所有 purple/mauve/iris；它只标记粉/紫色是否泄漏到 inline/block/number/variable/operator/punctuation，或多个核心语法角色同时偏 pink/magenta。现在所有内置主题都通过了这个检查。

当前内置主题的 `theme.bg.code.*` 审计结果：

| Theme | inline bg | block bg | header bg | Status |
| --- | --- | --- | --- | --- |
| catppuccin-latte | surface0 | crust | surface0 | Pass |
| catppuccin | surface0 | crust | surface0 | Pass |
| dracula | currentLine | bgDarker | currentLine | Pass |
| flexoki | base200 | base150 | base200 | Pass |
| github-dark | bgSubtle | bgInset | bgSubtle | Pass |
| github-light | bgInset | bgSubtle | bgInset | Pass |
| gruvbox-dark | bg1 | bg0 | bg1 | Pass |
| gruvbox-light | bg1 | bg1 | bg2 | Pass |
| nord | nord2 | nord0 | nord2 | Pass |
| one-dark | bgHighlight | bgDark | bgHighlight | Pass |
| one-light | bgHighlight | bgDark | bgHighlight | Pass |
| rose-pine | surface | base | surface | Pass |
| solarized-dark | base02 | base03 | base02 | Pass |
| solarized-light | base2 | base2 | base1 | Pass |
| tokyo-night | bgHighlight | bgDark | bgHighlight | Pass |

`bg.code.*` 当前没有使用 accent/pink/magenta/rose/red 这类装饰或状态色，保持为低干扰 surface。

---

## Theme application pipeline

Theme colors are not only defined in CSS. Runtime theme JSON can override the fallback variables.

```text
src/main/themes/builtin/*.json
~/.onething/themes/*.json|*.lua
<project>/.start-electron/themes/*.json|*.lua
        ↓
src/main/themes/resolver.ts
  resolveTheme(theme, mode)
        ↓
src/main/themes/css-mapper.ts
  generateCSSVariables(resolvedTheme)
        ↓
IPC applyTheme
        ↓
src/renderer/stores/themes.ts
  applyThemeVariables(cssVariables)
        ↓
document.documentElement.style.setProperty(...)
        ↓
component CSS var(...)
```

Important consequence:

> Values from theme JSON override the default/fallback values in `src/renderer/styles/variables.css`.

So changing `variables.css` alone may not affect the running app if the current theme supplies the same CSS variable through the theme system.

---

## Main files

### Theme definition and resolution

| File | Role |
| --- | --- |
| `src/main/themes/builtin/*.json` | Built-in theme palettes and semantic theme fields |
| `src/main/themes/index.ts` | Theme manager: load built-ins/custom themes, apply theme |
| `src/main/themes/resolver.ts` | Resolve `defs` references and dark/light variants |
| `src/main/themes/css-mapper.ts` | Map semantic theme paths to CSS variable names |
| `src/main/themes/base46-parser.ts` | Convert Base46 Lua themes into app theme format |

### Renderer CSS and usage

| File | Role |
| --- | --- |
| `src/renderer/styles/variables.css` | Fallback/default CSS variables and color-theme accent overrides |
| `src/renderer/styles/markdown.css` | Shared Markdown styles for `.md-body` containers |
| `src/renderer/styles/hljs-theme.css` | Highlight.js class to theme-variable mapping |
| `src/renderer/styles/main.css` | Imports global CSS including `hljs-theme.css` and `markdown.css` |
| `src/renderer/components/chat/message/MessageBubble.vue` | Message Markdown/code rendering styles; duplicates some Markdown styling |
| `src/renderer/components/chat/ToolDiffPreview.vue` | Tool diff syntax highlighting with `--syntax-*` variables |
| `src/renderer/components/chat/ToolStepDetails.vue` | Tool details / output / error code-ish blocks |
| `src/renderer/components/chat/ToolResultRenderer.vue` | Structured tool output blocks |
| `src/renderer/stores/themes.ts` | Applies CSS variables to the document and caches them |

---

## Semantic theme keys for code

Current theme JSON code-related fields are under:

```json
{
  "theme": {
    "bg": {
      "code": {
        "inline": "...",
        "block": "...",
        "header": "..."
      }
    },
    "text": {
      "code": {
        "inline": "...",
        "block": "...",
        "comment": "...",
        "keyword": "...",
        "string": "...",
        "number": "...",
        "function": "...",
        "variable": "...",
        "operator": "...",
        "type": "...",
        "property": "...",
        "punctuation": "..."
      }
    },
    "border": {
      "code": "..."
    }
  }
}
```

These theme paths are mapped by `src/main/themes/css-mapper.ts`.

### Code backgrounds

```ts
'bg.code.inline' → ['--bg-code-inline']
'bg.code.block'  → ['--bg-code-block']
'bg.code.header' → ['--bg-code-header']
```

### Code text

```ts
'text.code.inline'     → ['--text-code-inline']
'text.code.block'      → ['--text-code-block']
'text.code.comment'    → ['--text-code-comment', '--hljs-comment']
'text.code.keyword'    → ['--text-code-keyword', '--hljs-keyword']
'text.code.string'     → ['--text-code-string', '--hljs-string']
'text.code.number'     → ['--text-code-number', '--hljs-number']
'text.code.function'   → ['--text-code-function', '--hljs-function']
'text.code.variable'   → ['--text-code-variable', '--hljs-variable']
'text.code.operator'   → ['--text-code-operator', '--hljs-operator']
'text.code.type'       → ['--text-code-type', '--hljs-type']
'text.code.property'   → ['--text-code-property', '--hljs-property']
'text.code.punctuation'→ ['--text-code-punctuation', '--hljs-punctuation']
```

### Code border

```ts
'border.code' → ['--border-code']
```

---

## Renderer CSS variables for code

`src/renderer/styles/variables.css` defines fallback values for both dark and light defaults.

Current fallback intent:

```css
--text-code-inline: var(--text-code-block);
--text-code-block: ...neutral foreground...;
--text-code-comment: ...muted...;
--text-code-keyword: ...purple...;
--text-code-string: ...green...;
--text-code-number: ...orange...;
--text-code-function: ...blue...;
--text-code-variable: ...cyan...;
--text-code-operator: ...muted neutral...;
```

Important: this file also contains color-theme accent overrides:

```css
[data-color-theme="blue"]    { --accent: ... }
[data-color-theme="purple"]  { --accent: ... }
[data-color-theme="green"]   { --accent: ... }
[data-color-theme="orange"]  { --accent: ... }
[data-color-theme="cyan"]    { --accent: ... }
[data-color-theme="red"]     { --accent: ... }
[data-color-theme="pink"]    { --accent: ... }
```

Code colors should generally avoid depending on `--accent`, because user accent selection can make code look like the accent color everywhere.

---

## Markdown code block rendering

There are two Markdown-style CSS surfaces right now.

### Shared Markdown body

`src/renderer/styles/markdown.css` applies to `.md-body`.

Relevant roles:

```css
.md-body .inline-code {
  color: var(--text-code-inline);
  background: var(--bg-code-inline);
}

.md-body .code-block-container {
  background: var(--bg-code-block);
  border: 1px solid var(--border-code, var(--border));
}

.md-body .code-block-header {
  background: var(--bg-code-header);
}

.md-body .hljs {
  color: var(--text-code-block);
}
```

### MessageBubble-specific Markdown styling

`src/renderer/components/chat/message/MessageBubble.vue` contains similar/deeper rules for `.content :deep(...)`.

Relevant roles:

```css
.content :deep(.inline-code) {
  color: var(--text-code-inline);
  background: var(--bg-code-inline);
}

.content :deep(.code-block-container) {
  background: var(--bg-code-block);
  border: 1px solid var(--border-code, var(--border));
}

.content :deep(.code-block-header) {
  background: var(--bg-code-header);
}

.content :deep(.hljs) {
  color: var(--text-code-block);
}
```

Note: duplication between `markdown.css` and `MessageBubble.vue` means code styling can drift unless one is made authoritative.

---

## Highlight.js mapping

`src/renderer/styles/hljs-theme.css` maps Highlight.js classes to theme variables.

Current mapping intent:

```css
.hljs-keyword,
.hljs-selector-tag,
.hljs-built_in,
.hljs-literal {
  color: var(--hljs-keyword, var(--text-code-keyword));
}

.hljs-string,
.hljs-doctag,
.hljs-regexp,
.hljs-symbol {
  color: var(--hljs-string, var(--text-code-string));
}

.hljs-number {
  color: var(--hljs-number, var(--text-code-number));
}

.hljs-comment,
.hljs-quote {
  color: var(--hljs-comment, var(--text-code-comment));
  font-style: italic;
}

.hljs-title,
.hljs-title.function_,
.hljs-section {
  color: var(--hljs-function, var(--text-code-function));
}

.hljs-variable,
.hljs-attr,
.hljs-attribute,
.hljs-template-variable {
  color: var(--hljs-property, var(--text-code-variable));
}

.hljs-type,
.hljs-class,
.hljs-title.class_ {
  color: var(--hljs-type, var(--text-code-variable));
}

.hljs-operator,
.hljs-punctuation {
  color: var(--hljs-operator, var(--text-code-operator));
}
```

Diff-specific classes currently use semantic colors:

```css
.hljs-addition {
  color: var(--hljs-string, var(--text-code-string));
  background-color: color-mix(in srgb, var(--color-success) 12%, transparent);
}

.hljs-deletion {
  color: var(--color-danger);
  background-color: color-mix(in srgb, var(--color-danger) 12%, transparent);
}
```

---

## Tool/diff code syntax variables

Tool-card diff highlighting uses `--syntax-*`, not `--hljs-*` directly.

In `variables.css`:

```css
--syntax-keyword: var(--text-code-keyword);
--syntax-number:  var(--text-code-number);
--syntax-string:  var(--text-code-string);
--syntax-comment: var(--text-code-comment);
--syntax-func:    var(--text-code-function);
--syntax-punct:   var(--text-code-operator);
```

Current intent:

- `--syntax-*` is for syntax highlighting only.
- Tool-card UI chrome should use `--tool-*`, not `--syntax-*`.
- Diff add/delete should use semantic success/danger variables, not generic syntax colors.

---

## Current built-in theme code palette snapshot

As of this document, built-in themes have been adjusted with the hybrid rule: preserve each theme palette, but normalize code-token roles for AI-chat readability.

| Theme | inline | block | keyword | string | number | function | variable | comment | Pink-heavy | Readability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| catppuccin-latte | text | text | mauve | green | peach | blue | subtext1 | overlay1 | No | Pass |
| catppuccin | text | text | mauve | green | peach | blue | subtext1 | overlay1 | No | Pass |
| dracula | foreground | foreground | purple | green | orange | cyan | foreground | comment | No | Pass |
| flexoki | base900 | base900 | purple | green | orange | blue | base800 | base500 | No | Pass |
| github-dark | fg | fg | purple | green | orange | blue | fgMuted | fgSubtle | No | Pass |
| github-light | fg | fg | purple | green | orange | blue | fgMuted | fgMuted | No | Pass |
| gruvbox-dark | fg1 | fg1 | purple | green | orange | blue | fg2 | gray | No | Pass |
| gruvbox-light | fg1 | fg1 | purpleBright | greenBright | orangeBright | blueBright | fg2 | gray | No | Pass |
| nord | nord5 | nord5 | nord9 | nord14 | nord13 | nord8 | nord4 | nord3 | No | Pass |
| one-dark | fg | fg | purple | green | orange | blue | fg | #5C6370 | No | Pass |
| one-light | fg | fg | purple | green | orange | blue | fgDim | gutter | No | Pass |
| rose-pine | text | text | iris | pine | gold | foam | text | muted | No | Pass |
| solarized-dark | base1 | base1 | violet | cyan | orange | blue | base1 | base01 | No | Pass |
| solarized-light | base01 | base01 | violet | cyan | orange | blue | base01 | base1 | No | Pass |
| tokyo-night | fg | fg | blue2 | green | orange | blue | fgDark | comment | No | Pass |

The audit criteria used here:

1. `inline === block`.
2. inline/block/operator/punctuation do not use accent, pink, magenta, or rose-like decorative colors.
3. `keyword/string/number/function` have at least three distinct visual roles.
4. `number` avoids magenta/pink.
5. `comment !== block` and is visually weaker.
6. `variable` is neutral or low-emphasis, not louder than function.

---

## Recent issue: “code is all pink”

Observed causes:

1. `--text-code-inline` was temporarily changed to `var(--accent)`.
   - If the user color theme is pink, inline code becomes pink everywhere.
2. Many built-in themes originally set `theme.text.code.inline` to `pink`, `magenta`, `rose`, or `purple`.
   - Theme JSON overrides `variables.css`, so fallback changes alone did not fix runtime colors.
3. Several original syntax palettes used pink/purple/magenta for too many roles at once (`keyword`, `number`, `variable`, `operator`, or `inline`).
   - In an AI chat interface, this reads as decorative color rather than code-reading hierarchy.

Current local state:

- `variables.css`: `--text-code-inline` fallback points to `--text-code-block`.
- Built-in themes: `theme.text.code.inline` matches `theme.text.code.block`.
- Built-in themes: `theme.text.code.*` has been normalized so keyword/string/number/function are role-distinct and no theme is currently marked pink-heavy.
- `hljs-theme.css`: highlight.js classes map through `--hljs-*` with `--text-code-*` fallback.
- Diff add/delete stays semantic via success/danger, not syntax colors.

---

## Design policy now in force

### 1. Inline code is neutral code text

```text
inline code = code block foreground + code inline background
```

Rationale: inline code is code, not an accent/CTA. It must not follow user accent color.

### 2. Syntax highlighting is muted but role-distinct

```text
keyword   → purple / blue-purple, but not pink-heavy
string    → green / cyan-green
number    → orange / yellow, not magenta/pink
function  → blue / cyan
variable  → neutral or low-emphasis cyan
comment   → muted/faint + italic
operator  → muted neutral
property  → blue/cyan or neutral depending on theme
punctuation → muted neutral
```

### 3. Theme identity is preserved through palette choice, not role drift

Each theme can keep its own colors, but token roles should remain stable. For example:

- Catppuccin can keep `mauve` for keyword, but inline/variable should not also become decorative pink/purple.
- Dracula can keep purple-ish keywords, but strings/numbers/functions need separate roles.
- Tokyo Night can stay blue/cyan-heavy without turning the whole code block magenta.

---

## Proposed constraints for syntax audit

A script/test should validate:

1. `text.code.inline` equals or closely matches `text.code.block` unless explicitly allowed.
2. `text.code.block` has sufficient contrast against `bg.code.block`.
3. `text.code.comment` differs from `text.code.block` and is visibly muted.
4. `keyword`, `string`, `number`, and `function` do not all collapse to the same hue.
5. No ordinary code text depends on `accent`.
6. Diff deletion/addition uses semantic danger/success or `diff.*`, not arbitrary syntax colors.
7. Tool-card UI uses `--tool-*`; syntax inside tool previews uses `--syntax-*`.
8. `data-color-theme="pink"` does not make ordinary code text pink.

---

## Known cleanup opportunities

1. **Remove duplication between `markdown.css` and `MessageBubble.vue`.**
   - Ideally, `.md-body` should be the single Markdown styling surface.
2. **Clarify `--hljs-property` vs `--text-code-variable`.**
   - CSS mapper maps `text.code.property` to `--hljs-property`, but some CSS fallback currently uses variable-like colors.
3. **Clarify type/property/punctuation fallbacks.**
   - Theme JSON supports these fields, but fallback CSS in `variables.css` currently emphasizes the core six roles more than the extended roles.
4. **Add a code palette preview in the theme selector.**
   - A small code snippet preview would make “too pink” obvious before applying a theme.
5. **Add a theme audit command/test.**
   - Prevent future regressions like inline code being tied to `accent`.

---

## Practical next step

Before further edits, generate visual/code palette samples per theme:

```text
plain text
inline code
keyword / string / number / function / variable / comment / operator
```

Then adjust each built-in theme’s `theme.text.code.*` values with a consistent rule instead of one-off fixes.
