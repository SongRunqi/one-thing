/**
 * 项目目录的规范形。
 *
 * 项目名册(`stores/projects`)存的是用户挑目录时系统给的那个字符串,会话存的是
 * 引擎写下的 `workingDirectory` —— 同一个目录在两处可能一个带尾斜杠一个不带。
 * 左栏把两份按目录并成一组,并的键就是这里的产物;两边各自规范化再比,谁都不必
 * 知道对方存的是什么形状。
 *
 * 放在 utils 而不是任一侧:store 与分组 composable 都要用它,而 store 在测试里
 * 常被整体 mock 掉 —— 一个纯字符串函数不该跟着 store 的替身一起消失。
 */
export function normalizeProjectDir(dir: string): string {
  return dir.trim().replace(/[/\\]+$/, '')
}
