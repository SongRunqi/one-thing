/**
 * 三宿主装配面的冒烟(D6-a)。
 *
 * D6-a 把协作的装配点从 v2 协调器换成了 v3 运行时,而那一行住在
 * `createOnethingBackend` 里 —— 三个宿主(桌面 / headless daemon / server)全从它
 * 出发。这份测试问的是**最便宜也最容易忘的那一条**:换完之后,这三条 import 图
 * 还求得动值吗。
 *
 * 为什么值得单独一份:v3 的运行时静态引了引擎、看板、计费、providers,而
 * `backend.ts` 又静态引了它。一条新的实边把 `@onething/app` 的 import 图接成环
 * (或者把某个带顶层 await 的模块排到了它的依赖前面)时,症状不是测试红,是
 * **打包产物启动即卡死** —— 那是最贵的一类回归,而它在这里只要一次 import 就能
 * 照出来。
 *
 * **不 mock 任何东西**:import 图的形状正是被测对象,替掉一个节点就等于没测。
 */
import { describe, expect, it } from 'vitest'

describe('D6-a 三宿主装配冒烟', () => {
  it('createOnethingBackend 的 import 图求得动值', { timeout: 60_000 }, async () => {
    const backend = await import('../../../backend.js')
    expect(typeof backend.createOnethingBackend).toBe('function')
    expect(typeof backend.configureAppRuntimeAdapters).toBe('function')
  })

  it('CLI daemon 的 HeadlessBackend 同样求得动值', { timeout: 60_000 }, async () => {
    const headless = await import('../../../headless/backend.js')
    expect(typeof headless.HeadlessBackend).toBe('function')
  })

  it('collab 装配面同时导出 v3 运行时与仍在的 v2 协调器', { timeout: 60_000 }, async () => {
    const collab = await import('../../index.js')
    // 新的生产路径。
    expect(typeof collab.initializeCollabV3Runtime).toBe('function')
    expect(typeof collab.shutdownCollabV3Runtime).toBe('function')
    // 旧的那条**仍然导出**:D6-a 只是不再初始化它,删除是 D6-b。它的单元测试
    // 直接吃这两个名字,所以这一条同时是「本期没动 v2」的结构性证据。
    expect(typeof collab.initializeCollabCoordinator).toBe('function')
    expect(typeof collab.shutdownCollabCoordinator).toBe('function')
    // 停止按钮那扇门换了实现,名字一个字没改(apps 侧零改动的判据)。
    expect(typeof collab.abortCollabRoomTurnForStop).toBe('function')
  })
})
