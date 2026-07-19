# Settings 画线风(Ledger)风格指南

设置页统一采用与 sidebar / StepsPanel / Skills 面板一致的画线语言:
**No background fills, no radii — state lives in the line.**

参照实现:`src/renderer/components/settings/skills/SkillsSettingsPanel.vue`(2026-07 落地)。

## 令牌

一律使用 `SettingsPage.vue` 级联下来的 settings 令牌(带回退),不写死颜色:

- 纸面:`--settings-paper` / `-paper-2` / `-paper-3`(仅用于弹窗底、遮挡线条的场景)
- 墨线:`--settings-rule`(实线)/ `--settings-rule-soft`(发丝线)
- 墨色:`--settings-ink`(正文)/ `-ink-2` / `-ink-3` / `-ink-4`(faint)
- 强调:`--settings-accent` / `--settings-accent-soft`
- 等宽:`var(--font-mono, monospace)` + `font-variant-numeric: tabular-nums`

弹窗等 teleport 到 body 的组件拿不到 settings 令牌,直接用 `--ui-*` 回退链
(`var(--ui-text-primary-fg, var(--text-primary))` 等,见 AddSkillDirectoryDialog)。

## 公理

1. `border-radius: 0`。唯二例外:圆形墨点/圆环(toggle 旋钮、状态点)与徽章圆环(`border-radius: 999px` 描边圆环)。
2. 背景不填充。selected/hover/active 用线表达:边线变色、加粗、tick 变长、`box-shadow: inset 2px 0 0 <color>` 左墨线。禁止 `box-shadow` 光晕/投影(弹窗可用 `4px 4px 0` 硬偏移墨影)。
3. 分隔用发丝线:`border-bottom: 1px solid var(--settings-rule-soft)` 或
   `color-mix(in srgb, var(--settings-rule-soft) 32%, transparent)`。
4. 元数据(路径、URL、计数、序号、快捷键)用 mono + tabular-nums;标题/正文用默认 sans。
5. 禁用态 = 虚线 + faint 墨色(可加删除线),不是透明度堆叠。

## 控件配方

- **行**:`border-bottom` 发丝线,transparent 背景;hover 只变文字墨色或 tick。
- **分组标题**:uppercase 小字 + `::after` 拉横线(SettingsPage `:deep(.section-title)` 已有)。
- **输入/select/textarea**:transparent 背景、`border: 1px solid var(--settings-rule)`、radius 0;
  或下划线式(`border` 只留 bottom)。focus:`border-color: var(--settings-accent)`,无 box-shadow。
- **Toggle**:统一由 SettingsPage `:deep()` 全局绘制(`.toggle-row/.native-toggle` 的原生 checkbox 与
  `.toggle > input + .toggle-slider` 两种标记都覆盖):虚线轨 + 空心圆旋钮;开 = 实线轨(accent)+ 实心墨点右移。
  **各 tab 不要再自绘 `.toggle-slider` 视觉**,删掉本地的颜色/圆角/阴影定义,仅保留布局所需的尺寸容器即可(或直接删,靠全局)。
- **按钮**:文本动作(mono 小字,hover 加 accent 下划线 `text-underline-offset: 3px`)优先;
  需要框的用 transparent + 1px 边线方角;primary = accent 边线 + accent 文字,**不用填充+白字**。
- **徽章/状态**:描边圆环(transparent 背景 + 1px 边线 + 彩色文字),色用 `--ui-status-*-fg`;不要填充色块。
- **空态**:虚线方框图标位(`border: 1px dashed var(--settings-rule)`)+ faint 文案。
- **弹窗**:`background: var(--ui-surface-app-bg, ...)` + 1px 实线边 + `box-shadow: 4px 4px 0 <墨影>`,
  header 底部发丝线,footer 文本按钮(见 skills/AddSkillDirectoryDialog.vue)。

## 布局健壮性(本轮必修)

- flex/grid 文本容器一律补 `min-width: 0`;grid 列用 `minmax(0, 1fr)`。
- 单行路径/URL/命令:`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`(容器要能收缩)。
- 多行 key/token:`word-break: break-all`。
- 清理写死的 `width: Npx`(toggle 尺寸除外),改 `max-width` / flex。
- 窄宽(~900px 视口)不得出现横向滚动、控件重叠、行折断错位。

## 不要做

- 不要 `background: rgba(255,255,255,…)` 之类写死色;不要 hex 直出(var() 回退链末位允许)。
- 不要 iOS 药丸 toggle、白色滑块、knob 阴影。
- 不要 `box-shadow: 0 0 0 3px` focus/active 光晕(a11y 的 `:focus-visible` outline 保留)。
- 不要动 `styles/__tests__/ui-token-vars.test.ts` 锁定的令牌契约;新样式颜色走令牌即可。
