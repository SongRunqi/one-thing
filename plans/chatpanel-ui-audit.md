# ChatPanel UI 审查

> 范围：审查 + 已落地修复。本文所有结论均对照当前源码逐条核对（行号为审查时快照）。
>
> **修复状态（本轮）**
> - ✅ 2.2 消息 footer 改为悬停 / 聚焦 / 高亮时显示（`MessageItem.vue`，`min-height` 占位避免抖动）
> - ✅ 2.3 删除死令牌 `--composer-height` 的两处写入与专用 ResizeObserver（`InputBox.vue`）
> - ✅ 2.4 移除队列卡里点了没反应的「More actions」死按钮并修正 grid 列数（`InputBox.vue`）
> - ✅ 2.5 权限拒绝弹窗文案统一为英文（`MessageList.vue`）
> - ✅ 2.6 收敛 EmptyState 主题映射，去掉只回退到 default 的占位项（`EmptyState.vue`）
> - ⏸ 2.1 右侧浮层重叠——经确认本轮暂不改（需跨组件互斥或让位的设计决策）
>
> typecheck:web 通过；lint 无新增 error；ChatWindow / InputBox 相关测试全绿。
>
> 核对的文件：
> - `src/renderer/components/chat/ChatPanel.vue`
> - `src/renderer/components/chat/MessageList.vue`
> - `src/renderer/components/chat/InputBox.vue`
> - `src/renderer/components/chat/MessageItem.vue`
> - `src/renderer/components/chat/message/MessageActions.vue`
> - `src/renderer/components/chat/TodoPlanPanel.vue`
> - `src/renderer/components/chat/AssistantMessageNavRail.vue`
> - `src/renderer/components/chat/UserMessageNavRail.vue`
> - `src/renderer/components/chat/EmptyState.vue`
> - `src/renderer/composables/useFollowScroll.ts`

## 1. 当前结构

`ChatPanel.vue` 是一个纵向 flex 容器，三个直接子节点：

```txt
.chat-panel (flex column, position: relative, overflow: hidden)
├─ MessageList         flex:1，内部独立滚动容器
├─ TodoPlanPanel       position: absolute 覆盖层（默认折叠）
└─ .composer-container flex-shrink:0 底部输入区（InputBox）
```

共享的内容宽度令牌（`ChatPanel.vue:278`）：

```css
.chat-panel { --chat-content-width: min(680px, max(64%, calc(100% - 96px))); }
```

`MessageList` 的 `.message-list-content`（`MessageList.vue`）与 `InputBox` 的 `.composer-wrapper`（`InputBox.vue:1043`）都用 `width: var(--chat-content-width); margin: 0 auto`。**这点是健康的**：消息列与输入框水平对齐、共用一条居中内容列。滚动归 MessageList 独占。

下面是核对后确认存在的问题，按严重度排序。

---

## 2. 发现的问题

### 2.1 右侧边缘多个浮层挤在同一区域（中高）

**文件：** `MessageList.vue`、`AssistantMessageNavRail.vue`、`UserMessageNavRail.vue`、`TodoPlanPanel.vue`

右上 / 右侧同时存在多个 `position: absolute` 浮层，全部贴右边：

| 元素 | 定位 | z-index | 宽度 |
|------|------|---------|------|
| `.nav-mode-toggle` | `top:16px; right:14px` | `var(--z-dropdown)` | 胶囊小按钮 |
| 导航栏（outline/trail） | `top:50%; right:12px`（垂直居中） | `var(--z-dropdown)` | 展开可达 `min(306px, 100vw-64px)` |
| `TodoPlanPanel` 浮动卡 | `top:52px; right:12px` | `var(--z-dropdown)+2` | `min(280px, 100vw-70px)` |
| `.scroll-to-bottom-btn` | `bottom:32px; left:50%` | `4` | 34px 圆钮 |

问题点：

- **导航栏展开宽度（最多 306px）会盖住正文。** 当 `--chat-content-width` 取 `64%` 时，单侧空白只有约 18%。在约 1000px 宽的面板上右侧空白≈180px，小于展开后的 306px → 展开的导航栏直接压在阅读区上方。折叠态（34px）没问题。
- **导航栏（垂直居中、右 12px）与展开的 TodoPlanPanel 浮动卡（top:52、右 12px、宽 280px）重叠区域明确。** 二者 z-index 不同（Todo 为 `dropdown+2`，导航栏为 `dropdown`），所以展开导航栏会被 Todo 卡盖住一部分，但两者本身并无互斥逻辑，可同时出现。
- 默认情况下 TodoPlanPanel 是折叠的（`collapsed` 默认 `true`，`TodoPlanPanel.vue:573`，仅剩 `top:74px; right:5px` 的 6px 唤醒条），所以常态不冲突；**冲突只在 Todo 卡被展开 + 导航栏存在时出现**。

方向：明确右侧浮层的优先级与互斥规则；导航栏展开时是否需要把正文内容列左移或给导航栏让出固定 gutter。

---

### 2.2 每条消息的操作栏 + 时间戳常驻显示（中）

**文件：** `MessageItem.vue:136`、`MessageActions.vue`

`MessageActions` 样式本身支持悬停淡入：

```css
.actions { opacity: 0; transition: opacity 0.15s ease; }
.actions.visible { opacity: 1; }
```

但 `MessageItem.vue:136` 写死了 `:visible="true"`，所以**每条消息（user 和 assistant 都有）底部都常驻一行 footer**：时间戳（`.meta`）+ 一排 28px 操作按钮（复制 / 编辑 / 重生成 / 分支 / 朗读 / 更多）。

问题点：

- 长对话里这一行 footer 会在每条消息下方反复出现，视觉噪声大，削弱阅读节奏。
- `opacity:0 → .visible` 的 hover 机制其实已经写好，却被 `visible="true"` 旁路掉，等于预留了「按需出现」的能力但未启用。

方向：考虑改为悬停 / 聚焦时显示该 footer（至少对历史消息），保留无障碍可达性（键盘焦点也能触发）。

---

### 2.3 尾部留白固定 64px，与真实输入框高度脱钩（中）

**文件：** `MessageList.vue`、`useFollowScroll.ts:12`、`InputBox.vue:415,620`

- 列表尾部留白是固定常量：`.message-list-content { padding-bottom: var(--follow-bottom-gap, 64px) }`，`FOLLOW_BOTTOM_GAP = 64`。
- InputBox 会写 `document.documentElement.style.setProperty('--composer-height', ...+40)`（两处），**但全仓没有任何地方消费 `--composer-height`**（grep 仅这两处写入、零处读取）。

问题点：

- 输入框是 flex 兄弟节点，本身会占位，所以这不是「内容被遮挡」的硬 bug。
- 但底部感知留白是固定 64px，与输入框实际高度无关：当出现**附件托盘、排队消息卡、语音采集、多行输入**导致输入框变高时，最后一条消息与输入框之间的视觉间距会显得不一致。
- `--composer-height` 是上一代「悬浮输入框 / 覆盖式 composer」遗留的死代码，应清理或重新接上。

方向：决定尾部留白是保持固定还是跟随输入框真实高度；若保持 flex 兄弟模型，删除 `--composer-height` 写入逻辑。

---

### 2.4 「发送中再发 = 入队」缺少显式提示（中低）

**文件：** `InputBox.vue`、`ChatPanel.vue:203`

生成进行中时，同一个主按钮含义会随「输入是否有内容」切换：

- 输入为空 → 主按钮变「停止」。
- 输入有内容 → 点击会把消息放进队列（出现 `.queued-message-card` 卡片），并可「Steer」插入当前工具循环。

问题点：

- 同一按钮在「停止 / 入队发送」之间切换语义，且队列卡只在发送**之后**才出现，用户事前难以预期「发送中再发会进队列」。
- 队列卡中第四个「More actions」按钮（`InputBox.vue:55`，`MoreHorizontal`）`@click.stop` 只阻止冒泡、没有任何处理逻辑，是一个**点了没反应的死按钮**。

方向：生成中且输入有内容时给一个轻量模式提示（如占位符或小标签）；移除或补全队列卡里的「More actions」按钮。

---

### 2.5 节点拒绝对话框文案为中文、其余 UI 多为英文（低，一致性）

**文件：** `MessageList.vue:139-184`

权限拒绝弹窗是硬编码中文（「拒绝原因」「请输入拒绝原因（可选）...」「按 Ctrl+Enter 确认，Esc 取消」「取消 / 确认拒绝」），而同屏其它控件（导航栏 aria-label、队列卡 Steer、滚动到底等）均为英文。混排导致界面语言不统一。

方向：统一走 i18n 或至少统一语言。

---

### 2.6 EmptyState 多数节日主题是占位（低）

**文件：** `EmptyState.vue:24-29`

节日主题映射里 `spring-festival / valentine / dragon-boat / mid-autumn / halloween / christmas` 全部 `// TODO` 回退到 `NewYearTheme` 或 `DefaultTheme`。即按日期切换主题的逻辑已就位，但大部分节日并没有专属空状态视觉，到了对应日期只会看到「年」或默认主题。

方向：要么补齐主题，要么收敛映射避免误导。

---

## 3. 已确认良好的部分（非问题）

- **内容列对齐**：消息列与输入框共用 `--chat-content-width` 居中，左右边缘对齐，响应式断点（768 / 480px）一致收窄。
- **滚动归属清晰**：仅 MessageList 内部滚动，跟随 / 锚点 / 历史分页（`loadOlderHistoryIfNeeded` + `captureTopAnchor/restoreTopAnchor`）逻辑完整，切会话有快照保存 / 恢复。
- **输入框视觉重量已收敛**：`.composer` 当前是 `box-shadow: 0 1px 3px`、`blur(6px)`、`0.5px` 细边，并非早期的强玻璃 / 发光，视觉克制。
- **导航栏折叠默认窄（34px）**，常态不侵占正文。
- 滚动条、scroll-to-bottom 圆钮等细节有统一的 `color-mix` + `backdrop-filter` 处理，风格一致。

---

## 4. 优先级建议

**P0（高把握，体验收益明显）**
1. 启用消息 footer 的悬停 / 聚焦显示（2.2）——最直接降低长对话噪声。
2. 梳理右侧浮层互斥与展开避让（2.1）。

**P1（中）**
3. 决定尾部留白策略并清理死令牌 `--composer-height`（2.3）。
4. 生成中入队的显式提示 + 移除/补全队列卡死按钮（2.4）。

**P2（清理 / 一致性）**
5. 拒绝弹窗语言统一（2.5）。
6. 收敛 / 补齐 EmptyState 节日主题（2.6）。

---

## 5. 需手动观察的状态清单（视觉回归用）

- 空白新会话（默认 / 各节日日期）。
- 长对话置底流式输出中；长对话上滚后流式输出中。
- 输入框：聚焦 / 失焦 / 多行 / 带附件托盘 / 带排队卡 / 语音采集激活。
- TodoPlanPanel：折叠唤醒条 / 浮动卡展开 / docked 三态，与导航栏并存时的右侧重叠。
- 导航栏 outline / trail 两模式，展开态是否压住正文。
- 分屏（split）两个 ChatPanel 并排时各浮层的表现。
- 窗口宽度 < 768px、< 480px（< 480 时 `.nav-mode-toggle` 会 `display:none`）。
- 明 / 暗主题。

---

## 6. 小结

ChatPanel 的**基础布局是健康的**：消息列与输入框共用居中内容列、滚动归属清晰、输入框视觉重量已经收敛。当前主要 UI 风险不在底层 flex 结构，而在阅读区里**叠加的常驻元素与右侧浮层**：每条消息常驻 footer、右侧导航栏 / Todo 卡 / 模式切换在同一区域竞争空间、尾部留白与输入框高度脱钩，以及若干文案 / 死按钮 / 占位主题的细节一致性。

下一步最佳改进多半不是结构重写，而是**减少常驻视觉元素、明确右侧浮层的避让与优先级**。
