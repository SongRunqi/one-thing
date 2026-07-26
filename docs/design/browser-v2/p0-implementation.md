# Browser v2 · P0 实施清单(可直接开工版)

> 状态:实施计划。日期:2026-07-26。母设计:`docs/design/browser-v2.md`。
> 范式蓝本:刚落地的**终端 P0**(`docs/design/terminal-system.md` §7 + 实际代码),它把"Workbench 面板内多实例 + main 服务 + 新 IPC 域"整套管道跑通了。本清单 = 抄终端管道 + 新造原生 WebContentsView 几何机器。

## 0. 前置时序决策(开工前必读)

终端设计 §14 已拍板(2026-07-26):**终端全线先行,Browser v2 之后另开会话对终端最终几何一次接线,两案绝不并行开工**。当前终端 P0 已落地、P1(分屏树)/P2(Dock)未做。

据此把 P0 任务分两类:

- **几何无关(现在就能开工,终端 P1 不影响)**:IPC 域十一步、BrowserService、session 装配、workbench tab 分支、alias/门禁/测试。这部分完成后浏览器已能加载任意站点、导航、持久登录。
- **几何相关(临时对齐当前"单 Tabs + 双 splitter"几何,待终端 P1 分屏树落地后按 §14.2 四条共存问题定稿)**:bounds 同步、HTML5 全屏铺满、遮挡协调。**先按当前几何实现,注释标 `TODO(browser-geometry): 终端 P1 分屏树后重接`**。

若选择严格遵循 §14,则本清单只开工几何无关部分,几何相关部分留到终端几何定稿。

## 1. 服务落位(偏离终端一处,给足理由)

终端把服务放**装配层** `app/terminal/`(electron-free,node-pty 走 `PtyBackend` 接口 + `createRequire` 缝)。**浏览器 P0 不这么做**,服务放 **electron-host** `apps/electron/src/browser/`,理由:

- BrowserService 的电面(WebContentsView / session.fromPartition / webContents 事件 / 未来 debugger)又宽又深,为 P0 抽一层 `BrowserViewBackend` 接口不划算(终端 PtyBackend 只有 spawn/write/resize/kill/onData/onExit 六个面,浏览器是几十个)。
- P0 没有任何产品层/装配层消费者(AI 工具是 P3 才接,经 `configureBrowserHost` 桥)。服务此刻纯是 electron-host 的窗口生命周期 + IPC,放 apps/electron 名正言顺,与母设计 §D2/§4 一致。
- 代价:BrowserService 无法用 fake-backend 纯 mock 单测(终端能)。补偿:核心几何/状态逻辑(tab registry、bounds 计算、事件合帧)抽成 electron-free 纯函数单独测,electron 调用面靠集成/真机验收。

文件:
- `apps/electron/src/browser/service.ts` — `BrowserViewService`(懒单例 `getBrowserViewService()`,范式同终端 `service.ts:321` 的 `??=`);持 `Map<viewId, BrowserTabRecord>`(WebContentsView + 状态);`createTab/closeTab/selectTab/navigate/back/forward/reload/stop/setBounds/setVisible/killAll`。
- `apps/electron/src/browser/session.ts` — `getBrowserPartitionSession()`:`session.fromPartition('persist:browser')`,**UA 完整 Chrome 串且先于任何 view 创建**(母设计 D3);镜像 proxy(`network/proxy.ts:29` 传 session);权限 handler 默认拒;`will-download` 先裸放(下载条 P1b)。
- `apps/electron/src/browser/tab-state.ts` — electron-free 纯逻辑:tab 描述符结构、bounds 计算(DIP 取整)、事件→patch 合并(供单测)。
- `apps/electron/src/browser/geometry.ts` — bounds 同步 + 全屏(几何相关,标 TODO)。
- **生命周期收尾照终端第一坑**:`killAll()` 进 `apps/electron/src/app/before-quit.ts` 清理表(接口加字段 + 执行序列)+ `main-process.ts` 信号钩子(dev SIGTERM);**不靠 backend.shutdown**(桌面丢弃 backend 句柄,那是死代码)。同步改 `before-quit.test.ts` / `bootstrap.test.ts` 的清理表 mock。

## 2. IPC 域十一步(逐文件镜像终端)

IPC 域名 `browser`(shared 无既有 browser IPC,不撞)。channel 前缀 `BROWSER_`。

| 步 | 文件 | 内容(对照终端) |
| - | --- | --- |
| 1 渠道常量 | `packages/shared/ipc/channels.ts` | `BROWSER_CREATE_TAB/LIST_TABS/CLOSE_TAB/SELECT_TAB/NAVIGATE/GO_BACK/GO_FORWARD/RELOAD/STOP/SET_BOUNDS/SET_VISIBLE`(invoke)+ 推送 `BROWSER_TABS_CHANGED`(单一合并批,母设计 D2)+ `BROWSER_HYDRATE`(拉全量) |
| 2 线上契约 | `packages/shared/ipc/browser.ts`(新) | `BrowserTabInfo`/请求响应/`BrowserTabsPatch` 事件;`ipc/index.ts` re-export |
| 3 可移植工厂 | `apps/electron/src/ipc/browser.ts`(新) | `registerElectronBrowserIpcHandlers({channels, 回调, ipcMain?})`,照 `ipc/terminal.ts` 模子,`ipcMain?` 注入缝可测 |
| 4 alias 登记 | `onething.aliases.ts` | `@onething/electron-host/ipc/browser`(1 条;忘登记 typecheck 绿、运行炸——终端第 4 坑) |
| 5 服务本体 | `apps/electron/src/browser/service.ts` | 见 §1 |
| 6 接线 | `apps/electron/src/main/ipc/browser.ts`(新) | `registerBrowserHandlers()`:配 broadcaster 端口(patch 推送经 `getIPCBridge()?.sendToRenderer`)+ 工厂绑 `getBrowserViewService()` 方法 |
| 7 注册 | `apps/electron/src/main/ipc/handlers.ts` | `initializeIPC()` 加 `registerBrowserHandlers()` |
| 8 preload bridge | `apps/electron/src/preload/bridge.ts` | invoke wrapper + `onBrowserTabsChanged`(listener + unsubscribe) |
| 9 ElectronAPI 接口 | `packages/renderer/types/index.ts` | 方法签名 + `BrowserTabInfo` 类型(renderer 眼中唯一契约,手动同步) |
| 10 web 降级 | `packages/renderer/platform/{types,electron,web}.ts` | capability `embeddedBrowser`:types 声明 / electron `true` / web `false` + `normalizeServerCapabilities` 补 `false` + 方法进 `WEB_DESKTOP_ONLY_PLATFORM_METHODS`(软失败) |
| 11 组件订阅 | renderer store | `platformApi.onBrowserTabsChanged(cb)` 全局单订阅,按 tabId 分发 |

**patch 合并批(终端第 5 坑 IPC 洪水)**:一次导航串 did-start/stop-loading/title/favicon/canGoBack 十余发,必须在**服务内** ~30ms 合帧成单条 `BROWSER_TABS_CHANGED`,renderer store 单点 applyPatch。冷启动 `BROWSER_HYDRATE` 拉全量→再订阅(拉后订,母设计 D2)。

## 3. Renderer:BrowserPanel + store(几何无关部分)

- `packages/renderer/stores/browser.ts`(新,Pinia):镜像 tab 列表 + activeTabId;`hydrate()` 幂等拉全量,`applyPatch()` 消费合并批;命令方法转发 platformApi。**不落盘**(镜像;真源在 main state.json)。范式同终端 `stores/terminals.ts` 两层拆分。
- `packages/renderer/components/workbench/RightWorkbenchPanel.vue`:
  - `browser` 分支从 `<iframe>`(:195 一带)换成 `<BrowserPanel>` 组件;**iframe 代码不删,挪进 `v-if="!caps.embeddedBrowser"` 降级分支给 web 宿主**(母设计 §7)。
  - **保持 browser 类型全局去重**(与终端相反!终端刻意去掉 type 去重做多实例;浏览器 §14.2 明确"全局去重是 WebContentsView 几何可控的前提"——**别照抄终端的去重反转**)。多 web-tab 在 BrowserPanel 内部的 tab strip 管,不是多个 workbench tab。
  - `App.container-layout.test.ts` / `RightWorkbenchPanel.test.ts` 字符串断言更新(终端第 4 坑同款,工作量计划内;若 iframe 保留给 web 降级,`:240` 的 `<iframe` 断言可能不用改)。
- `packages/renderer/components/workbench/browser/BrowserPanel.vue`(新):chrome bar(tab strip + 导航 + omnibox)+ 视口占位 `<div ref="viewportRef">`。UI 全按 `mockup.html` 与母设计 §11(复用 TabItem 墨签 CSS、FilterSearchInput 骨架、`.header-btn` 点描、lucide 图标)。
- 占位 div `ResizeObserver` + `getBoundingClientRect()` → 节流 IPC `setBounds`(几何相关,见 §4)。

## 4. 几何机器(几何相关 · 标 TODO(browser-geometry))

终端无此先例(xterm 是 DOM,靠 `ResizeObserver+fit` 自适应,无主进程几何同步)。浏览器净新造:

- **bounds 同步**:占位 div rect(ResizeObserver + Splitter 现成 `resize-start/resize/resize-end` 事件,`App.vue:116-117`)→ rAF 节流 IPC → `view.setBounds`(整数 DIP,**不乘 DPR**)。
- **开合过渡**:真动画是 SplitterPanel flex-basis 0.16s(`SplitterPanel.vue:139`;`.workbench-slide` 只是宽度冻结)。过渡起 = `workbenchRevealed` watcher(`App.vue:485`),终 = panel `transitionend`;期间 `capturePage()` 贴占位 + `setVisible(false)`。
- **tab 切换**:browser workbench-tab 被 v-show 切走 → 显式 `setVisible(false)`(§14.2)。
- **HTML5 全屏**:`enter/leave-html-full-screen` → setBounds 铺满窗口内容区 + 隐藏 chrome,Esc 还原。
- **崩溃(几何无关,可先做)**:`render-process-gone` → 视口内 `ErrorNote` block + 重载钮(复用组件,先例 `main-window-recovery.ts:132`);连续崩溃退避。
- **遮挡骨架(几何相关)**:`overlay-presence` store + 模态浮层登记矩形 → `setVisible(false)` + 截图占位(母设计 §8.2)。P0 先接命令面板/ImagePreview/composer flyout 三大件,MutationObserver 兜底过滤 tooltip/select。

> ⚠️ 全 §4 标 `TODO(browser-geometry)`:当前对齐"单 Tabs + 双 splitter";终端 P1 分屏树落地后,按 §14.2 四条(resizer 命中区内缩 / 树拖拽主动广播重查 bounds / Workbench 浮层进 pane 矩形 / Dock 最大化遮挡)重接。

## 5. 弹窗与外链(P0 临时策略)

- `setWindowOpenHandler` on 每个 tab 的 webContents:P0 临时 → **交系统浏览器打开**(不做当前 tab 导航,会毁 opener);文档标注"OAuth 弹窗 P1a 可用"。P1a 再改 `createWindow` override 收编为 popup-tab 保 opener(母设计 P1a)。

## 6. alias / 门禁 / 依赖 / 测试

- **alias**:1 条 `@onething/electron-host/ipc/browser`;`app/`/`apps/electron/src/browser/` 走既有前缀,零改;tsconfig 无改;boundary checker 无新豁免(服务在 apps/electron 天然合规,不进 `app/tools/` 严规则)。
- **依赖**:P0 零新依赖(WebContentsView/session/capturePage 都是 electron 内置;debugger/CDP 是 P3)。
- **测试**:
  - `apps/electron/src/browser/__tests__/tab-state.test.ts`:纯逻辑(patch 合并、bounds DIP 取整)。
  - 可移植 IPC 工厂:fake ipcMain 注入测。
  - `RightWorkbenchPanel.test.ts`:`vi.mock` BrowserPanel 空壳(避 WebContentsView 进 happy-dom);断言 browser 分支挂 BrowserPanel、保持去重。
  - `App.container-layout.test.ts`:字符串断言更新。
  - `before-quit.test.ts` / `bootstrap.test.ts`:清理表 mock 加 `killAllBrowserTabs`。
  - 守门:`bun run boundary` / `boundary:gate` 零新红;`import-side-effect-free`;`bun run typecheck`。

## 7. 执行顺序(建议)

几何无关先行,几何相关后置(呼应 §0 时序):

1. IPC 域十一步骨架(§2)+ alias(空实现,通链路)。
2. BrowserViewService + session 装配(§1),单 tab 能 `createTab/navigate`,view 硬编码 bounds 先能显示。
3. BrowserPanel chrome UI + store(§3),地址栏回写/导航/loading/title/favicon。
4. 崩溃恢复 + 弹窗临时策略(§4 崩溃条 / §5)。
5. **几何机器**(§4 bounds/过渡/全屏/遮挡,标 TODO)。
6. 生命周期收尾 + 测试 + 门禁(§1/§6)。

## 8. P0 验收

- 任意站点可加载(iframe 时代被 CSP/X-Frame-Options 封的站现在能开)。
- **accounts.google.com 能走完登录**(UA 伪装探针,母设计 D3);重启后 cookie 还在。
- YouTube 可播含 HTML5 全屏 Esc 还原。
- kill 掉 tab 渲染进程 → 崩溃页可重载。
- 拖宽/折叠 Workbench、切 tab、开命令面板,原生视图 bounds/遮挡跟手不撕裂(几何相关,终端几何定稿后复验)。
- `bun run typecheck` + `boundary:gate` + 相关单测全绿。
