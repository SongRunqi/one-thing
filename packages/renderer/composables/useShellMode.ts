/**
 * 工作台式外壳(docs/design/im-workbench-layout.md §5 C0)的形态推导。
 *
 * 这里只放**纯函数**:外壳形态下的每一条差异都是「同一份状态,两种读法」,
 * 把读法从 App.vue 抽出来,workbench / classic 的分野才钉得住测试
 * (App.vue 挂不起来)。状态本身(ref / timer / 动画)仍然留在 App.vue。
 *
 * 纪律(C0 起对 C1–C4 全程有效):
 *  1. **视觉差异一律走 `:root[data-shell-mode='workbench']` 的 CSS 门**,
 *     不要每个组件各自 import 一次判定、也不要往下透传 prop;
 *  2. 改视觉时**改输入变量,不要直接写派生变量**。
 *     实例:C2 收窄/放宽阅读列要写 `--content-measure` / `--chat-measure-cap`,
 *     **不能**直接写 `--chat-content-width` —— `:root[…] .chat-panel` 的特异性
 *     是 (0,3,1),会压过 ChatPanel.vue 文件末尾窄窗 `@media` 里 (0,1,0) 的
 *     `.chat-panel` 覆盖,把 768/480 两个断点整个废掉。
 *  3. classic 是**逐像素回滚闸**:任何 workbench 分支都不许把 classic 的字面量
 *     改掉,只许在门里另加一份。
 */

import type { AppSettings, ShellMode } from '@/types'

/**
 * 右栏(RightWorkbenchPanel)默认展开的窗宽阈值 —— W-Q2 已拍板。
 *
 * 右栏常驻吃掉约 330px:1400 以上的窗口摊得开三栏,以下则先把中栏的话留住,
 * 入口(⌘ 面板按钮 / 关闭按钮)照旧在。这是**默认值不是强制值**:用户手动开合
 * 之后就以用户的选择为准(见 App.vue 的 `readStoredInspectorOpen`)。
 */
export const WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH = 1400

/** 只认 'classic' 一个显式值,其余一律 workbench —— 与 shared 的 normalizeUISettings 同口径。 */
export function resolveShellMode(settings: Pick<AppSettings, 'ui'> | null | undefined): ShellMode {
  return settings?.ui?.shellMode === 'classic' ? 'classic' : 'workbench'
}

export interface InspectorDefaultInput {
  shellMode: ShellMode
  /** 窗口宽度(px)。取不到就当窄窗处理:宁可少开,不要把中栏挤没。 */
  viewportWidth: number
  /**
   * 上一次的用户选择(localStorage)。**存在即胜出** —— 手动收起过的人不该
   * 每次启动都被重新弹开,这正是 W-Q2 里「默认值不是强制」的那一句。
   */
  stored?: boolean | null
}

/**
 * 右栏开合的初值。
 *
 * - classic:恒 false —— 回滚闸下右栏的初值行为一个字节不变(原来就是关着的)。
 * - workbench:用户存过什么就是什么;没存过才按窗宽给默认值。
 */
export function resolveInspectorDefaultOpen(input: InspectorDefaultInput): boolean {
  if (input.shellMode !== 'workbench') return false
  if (typeof input.stored === 'boolean') return input.stored
  return Number.isFinite(input.viewportWidth)
    && input.viewportWidth >= WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH
}
