/**
 * 右栏(RightWorkbenchPanel)开合初值的纯函数。
 *
 * 这个文件的前身是 `useShellMode.ts` —— 它同时装着 C0 的外壳形态推导
 * (`resolveShellMode`,workbench ↔ classic 回滚闸)与右栏初值。形态开关已于
 * 2026-08-05 退役(docs/design/product-two-forms-chatgpt-shell.md D2),只剩右栏
 * 初值这一件事,故改名。状态本身(ref / timer / 动画)仍然留在 App.vue,这里只放
 * 纯函数 —— .vue 挂不起测试,而这一条恰恰要钉住。
 */

/**
 * 右栏默认展开的窗宽阈值 —— im-workbench-layout.md W-Q2 已拍板。
 *
 * 右栏常驻吃掉约 330px:1400 以上的窗口摊得开三栏,以下则先把中栏的话留住,
 * 入口(⌘ 面板按钮 / 关闭按钮)照旧在。这是**默认值不是强制值**:用户手动开合
 * 之后就以用户的选择为准(见 App.vue 的 `readStoredInspectorOpen`)。
 */
export const WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH = 1400

export interface InspectorDefaultInput {
  /** 窗口宽度(px)。取不到就当窄窗处理:宁可少开,不要把中栏挤没。 */
  viewportWidth: number
  /**
   * 上一次的用户选择(localStorage)。**存在即胜出** —— 手动收起过的人不该
   * 每次启动都被重新弹开,这正是 W-Q2 里「默认值不是强制」的那一句。
   */
  stored?: boolean | null
}

/** 用户存过什么就是什么;没存过才按窗宽给默认值。 */
export function resolveInspectorDefaultOpen(input: InspectorDefaultInput): boolean {
  if (typeof input.stored === 'boolean') return input.stored
  return Number.isFinite(input.viewportWidth)
    && input.viewportWidth >= WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH
}
