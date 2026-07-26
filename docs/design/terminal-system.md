# 终端系统接入方案 — 真 PTY + Workbench 分屏 + 底部 Dock

日期：2026-07-26　状态：设计定稿（两轮审读：首轮对抗审读 12/12 事实断言确认、8 缺口并入；二轮三透镜复查——自洽性+P5 核查 / 产品与在途碰撞 / 实施者走查——全部修正并入，见各处"复查"标注），待实施

## 一、现状与问题

1. **假终端**。`RightWorkbenchPanel.vue` 里的 "Terminal" 是逐条 `platformApi.executeTool('bash', { command, timeout: 120000 })` 的表单（`RightWorkbenchPanel.vue:562`）：无 PTY、无 stdin、无流式输出、无 ANSI 渲染，跑不了 vim/top/交互式 REPL，Ctrl+C 都发不出去。
2. **只能在 Workbench 创建，且最多一个**。`addWorkbenchTab` 按 type 去重（`RightWorkbenchPanel.vue:326`），终端 tab 全局唯一；没有底部 Dock，没有分屏。
3. **Workbench 无分屏**。整个右侧面板是单 Tabs 平铺，不能上下左右切分。
4. **Web 端连假终端都不可用**。服务端 `/api/tools/execute` 硬锁 `read/glob/grep`（`apps/server/src/runtime.ts:5263`），bash 直接被拒——所以 PTY 是净新增服务端能力，不存在"回归兼容"包袱。

## 二、目标

- 真终端：node-pty 起真实 shell，xterm.js 渲染，全 ANSI/交互能力。
- 多实例：任意数量终端，可放在右侧 Workbench，也可放在底部 Dock（Ctrl+` 开合），可在两处之间移动而不杀进程。
- Workbench 分屏：面板可上下左右四向切分，递归嵌套，尺寸可拖拽，布局持久化。
- Web 对齐（后期）：apps/server 暴露 PTY（WS 数据面 + HTTP 控制面），readonly 部署自动禁用。

**不做（Non-goals）**：AI 的 bash 工具不改走 PTY（两条独立链路——AI 自己干活用 bash 工具，用户终端 AI 只读+参谋，见 P5）；AI 不自动在用户终端执行命令（建议只回填不回车）；终端进程跨 app 重启存活不做（只恢复布局与 cwd）；多窗口终端不做（IPCBridge 只绑主窗）。

**作用域教义（一句话定死，避免歧义蔓延）**：终端是 **app 级** 资源，不属于任何会话——`sessionId` 在创建时只用来播种 cwd，删会话不影响终端；Workbench tab 同样是 app 级（今天的 `openTabs` 本就静默跨会话存活，P1 的全局 store 是把这个既成事实转正）。P0 阶段无会话选中时 Workbench 打不开（`inspectorVisible` 要求 `currentSessionId`，`App.vue:438`），终端进程照常后台运行、暂不可达——接受此限制，P2 的 Dock 不受会话门限。

## 三、关键事实（侦察结论，方案的地基）

- `node-pty ^1.1.0` **已安装且全仓零 import**。它是 N-API 插件（一个二进制同时兼容 Electron 和 Node ABI，无 better-sqlite3 那种 rebuild 舞步）；`electron-builder.yml:30-32` 已 asarUnpack；postinstall 已有 `fix:node-pty-perms`（bun 会把 spawn-helper 装成 0644，症状是天书般的 `posix_spawnp failed`）；electron-vite 主进程构建 `externalizeDepsPlugin` 自动外置；server SSR 构建默认外置裸依赖。**四个构建配置零改动。**
- `ws ^8.20.0` 已是依赖（目前只被 volcano 语音当客户端用），server 加 WS 升级免安装。
- Splitter/SplitterPanel 支持递归嵌套已被生产验证（chat 的 `PanelTree.vue` 就是递归分屏树），px/percent/flex 混合、min/max/collapse 齐全。
- chat 分屏的纯树操作 `stores/workspace-tree.ts`（`splitLeaf` 四向、`closeLeaf` 合并、`equalizeSiblings`）正是 Workbench 分屏需要的算法，只是 leaf 的 tab 类型被硬编码成 `ChatTab`；`types/tabs.ts` 里 `FileTab/WorkbenchTab` union 成员早已声明但无人用。
- CLAUDE.md 里 "create-api.ts 从 router 生成 wrapper" 是死约定：`defineRouter/createRouterAPI` 零生产调用点，所有域都在 `preload/bridge.ts` 手写 wrapper + 手动维护 `ElectronAPI` 接口。
- 域级推送的正确范本是 **practice**（`configurePracticeEventBroadcaster` → `getIPCBridge()?.sendToRenderer`）；`FILE_WATCH_EVENT` 是半接线陷阱（主进程侧是 stub，从未发出），别抄。
- xterm.js 不在依赖里，需新增（唯一的新依赖面）。

## 四、总体架构

```
┌─ packages/renderer ─────────────────────────────────────────────┐
│ TerminalView.vue (xterm 宿主, ResizeObserver→fit→resize)        │
│ services/terminal-registry.ts (xterm 实例注册表, DOM 可迁移)     │
│ stores/terminals.ts (终端描述符: id/title/location/exited)      │
│ stores/workbench.ts (Workbench 分屏树, 泛化自 workspace-tree)   │
│ TerminalDock.vue (底部 Dock) / WorkbenchPaneTree.vue (递归分屏) │
└──────────────┬─────────────────────────────┬────────────────────┘
        Electron IPC                    fetch + WebSocket
   (terminal:* invoke + push)        (/api/terminals + :id/ws)
┌──────────────┴──────────────┐   ┌──────────┴──────────────────┐
│ apps/electron               │   │ apps/server                 │
│ main/ipc/terminal.ts (接线) │   │ http.ts 控制面路由           │
│ ipc/terminal.ts (可移植工厂)│   │ main.ts on('upgrade') WS    │
└──────────────┬──────────────┘   └──────────┬──────────────────┘
               └────────────┬────────────────┘
┌───────────────────────────┴─────────────────────────────────────┐
│ packages/onething-runtime/src/app/terminal/   (装配层, 双宿主共用)│
│ service.ts: 懒加载单例 TerminalService                           │
│  - createRequire 动态加载 node-pty (首个终端创建时才 dlopen)     │
│  - 每终端: PTY + seq 环形缓冲(scrollback 重放) + 16ms 输出合帧   │
│  - configureTerminalOutputBroadcaster(fn) 出站端口               │
│  - killAllTerminals() (未创建过则 no-op)                         │
│ 线上契约: packages/shared/ipc/terminal.ts (renderer 可见)        │
└─────────────────────────────────────────────────────────────────┘
```

## 五、关键决策与理由

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | PTY 服务落位 `packages/onething-runtime/src/app/terminal/`（新目录） | 装配层双宿主可达；`@shared/ipc` 在此允许（线上类型要给 renderer 用，而 `tsconfig.web.json` 没有 `@onething/app` path，所以类型必须放 `packages/shared/ipc/`）；边界检查器任何规则集都不禁 node-pty。**严禁放 `app/tools/` 子树**——那在 `MAIN_CORE_SYSTEM_DIRS` 严规则集里（禁 node:fs/node:path）。`@onething/app` 是单前缀 alias，新目录零 alias 表改动 |
| D2 | 懒加载单例 `getTerminalService()`，**不进** `createOnethingBackend` 装配序列 | `import-side-effect-free.test.ts` 禁 import 期配置；无启动顺序约束；CLI daemon（HeadlessBackend）和 readonly server 永不 dlopen pty.node。范本：`app/music/service.ts` 的 `let service = null` 模式 |
| D3 | node-pty 经 `createRequire` 在首次 spawn 时动态 require，且包一层 `PtyBackend` 接口注入缝 | 范本 `app/voice/kws.ts:103`（sherpa-onnx-node）；native 加载失败不炸整个进程；vitest 单测 mock 缝、永不加载真插件（音乐 `OnethingMusicProcessRunner` 注入缝同款） |
| D4 | 输出链路：PTY onData → 每终端 16ms 合帧 → seq 戳号 → 有界环形缓冲（默认 1MB/终端）→ 广播端口 | 合帧在**服务内**做，IPC 与未来 WS/SSE 共享（`IPCBridge.sendToRenderer` 本身不合帧，裸转发会重演 coalescer 诞生前的 IPC 洪水）；seq+环形缓冲让 renderer 刷新/重连后经 attach 协议（7.2/7.5）重放，PTY 活在主进程天然扛住渲染进程 reload |
| D5 | 流控：renderer 每次 `term.write` 回调后按字节 ack；服务端 unacked 超高水位（~128KB）`pty.pause()`，回落 `resume()` | `cat 大文件`/`yes` 不冻死 renderer；同一机制在 server 侧换成 `ws.bufferedAmount` 判据 |
| D6 | 前端 xterm 实例活在 **module 级注册表**（`services/terminal-registry.ts`），每终端一个常驻 detached div，视图挂载时 `appendChild` 迁移 | 终端在 Workbench/Dock 间移动、分屏树重排时**不销毁 xterm、不杀 PTY**；Pinia 只存可序列化描述符。这也解除了对 `workbenchMounted` 永不卸载 hack 的依赖 |
| D7 | Workbench 分屏**泛化复用** `workspace-tree.ts`，不另造轮子 | 把纯树操作抽成对 leaf-payload 泛型（`splitLeaf` 的 `createChatTab` 改注入），chat 侧包一层薄 wrapper 保持现调用点不动；递归渲染抄 `PanelTree.vue` 模式。符合"组件化而不是创建新的组件" |
| D8 | 底部 Dock 插入点：App.vue `.app-content` 内、把现有 `app-content-splitter` 包进一个新的**垂直 Splitter** | Dock 横跨主区+右侧 Workbench（VS Code 式）；`.app-sidebar-actions`（position:fixed）与拖拽域条不受影响；**不能**给现有水平 splitter 加第三个面板（`mainWorkspacePanelSize = 100 - inspectorPanelSize` 的双面板反演假设会碎）。Dock 面板用 `sizeUnit='px'` + min（percent 的 min/max 会随窗口高度缩放） |
| D9 | Web 传输：WS 数据面（`/api/terminals/:id/ws`，`server.on('upgrade')` + 已有 ws 依赖）+ HTTP 控制面（POST/GET/DELETE 走 matchRoute 白捡 bearer auth 和 owner scope） | SSE+POST 备选（每键击一次完整 auth+路由匹配，且无回压）；**升级请求绕过 http.ts 里的 auth 门**，WS 侧必须用 `tokenMatches()` 对 `?token=` 重验（浏览器无法给 WS/EventSource 设 Authorization 头） |
| D10 | 能力开关：`RuntimeHostCapabilities` 增 `terminal` 字段（不复用 `shellTools`，它还 gate 着别的 UI）；server 的 `webServerCapabilities` 从静态 const 改为按 tool tier 计算 | readonly 部署 → capability off + 端点 501，renderer 零特判 |
| D11 | 渠道命名 `terminal:*` / 类型 `Terminal*` | 与 ACP 的非 PTY "terminal"（`acp/client.ts:596`，pipes 实现）在 IPC 渠道层无冲突；shared barrel 里若撞类型名，ACP 侧已带 `Acp` 前缀 |
| D12 | 桌面端用户终端**不过 Permission 系统** | 与现状一致：假终端走的 `EXECUTE_TOOL` IPC 本就直调 `registry.executeTool`、无 Permission ask（审批门在 AI tool-loop 里，管的是 AI 发起的执行）。用户亲手敲的 shell 与用户在系统终端里敲无异；server 端另说（见 P4 安全） |

## 六、阶段总览

| 阶段 | 交付 | 规模 |
| --- | --- | --- |
| **P0** | 真 PTY 终端替换假终端：app/terminal 服务 + 11 步 IPC 配方 + xterm TerminalView + Workbench 内多实例 | 大（~23 文件：新 10/改 13 + App.container-layout.test.ts 整套重写） |
| **P1** | Workbench 四向分屏：树泛化 + WorkbenchPaneTree 递归渲染 + 分屏手势 | 中 |
| **P2** | 底部 Dock + Ctrl+` 开合 + 终端在 Dock/Workbench 间移动 | 中 |
| **P3** | 持久化与打磨：布局入 ui-state、主题映射、OSC 标题、search/links addon、快捷键仲裁 | 小-中 |
| **P4** | Web 对齐：server WS/HTTP 端点 + capabilities 计算化 + web.ts 实现 | 中（复查建议冻结，见第十一节） |
| **P5** | AI 融合：shell integration 命令账本 + 聊天可见（变量+工具）+ 建议回填 | 中 |

P0-P2 桌面可完整体验；P4/P5 相互独立、P0 之后任意顺序插入（P5 只要求 P0 spawn 留注入缝，见 7.3）。

---

## 七、P0 — 真 PTY 终端（桌面）

### 7.1 新依赖（唯一一次 package.json 改动）

`@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl` + `@xterm/addon-unicode11`（P0 必需——xterm 5.x 默认 DOM renderer，"cat 3MB 不冻 UI"的验收和流控水位都建立在快渲染器上，webgl 加载失败时自动回落 DOM；unicode11 管 CJK/emoji 宽度，"中文正常"验收离不开）；`@xterm/addon-web-links`、`@xterm/addon-search` P3 再加。装完跑一次 `bun run fix:node-pty-perms` 确认 spawn-helper +x。⚠️ 主窗仍是 `transparent:true`（合成层丢帧前科），webgl 叠透明窗要进真机清单验一条。

### 7.2 线上契约 — `packages/shared/ipc/terminal.ts`（新）

```ts
interface TerminalCreateRequest { cwd?: string; shell?: string; cols?: number; rows?: number; sessionId?: string /* 只播种 cwd */ }
// cols/rows 可缺省：新建时 xterm 尚未挂载、量不出尺寸——服务端默认 80x24 spawn，首次挂载 fit 后 resize 校正
interface TerminalInfo { id: string; title: string; cwd: string; shell: string; cols: number; rows: number; createdAt: number; exited?: { code: number | null } }
interface TerminalDataEvent { terminalId: string; seq: number; data: string }   // node-pty onData 就是 utf8 string
interface TerminalExitEvent { terminalId: string; exitCode: number | null }
// attach = 重挂协议（renderer reload / 窗口重开）：一次调用同时完成
// scrollback 快照 + 流控代际重置（见 7.3）
interface TerminalAttachResponse {
  info: TerminalInfo                       // 带当前 cols/rows — xterm 必须先按此开/调尺寸再重放，否则重放内容按错误宽度折行
  chunks: Array<{ seq: number; data: string }>
  lastSeq: number
  truncated: boolean                       // true 时重放可能始于转义序列中段 — 客户端先写全量 reset (\x1bc) 再重放
  generation: number                       // 流控代际，ack 必须携带
}
```

`packages/shared/ipc/channels.ts` 增：`TERMINAL_CREATE/LIST/WRITE/RESIZE/KILL/ACK/ATTACH: 'terminal:create'…` + 推送 `TERMINAL_DATA: 'terminal:data'`、`TERMINAL_EXIT: 'terminal:exit'`。`packages/shared/ipc/index.ts` 补 re-export 块。

### 7.3 服务 — `packages/onething-runtime/src/app/terminal/service.ts`（新）

- `getTerminalService()` 懒单例；内部 `PtyBackend` 接口（`spawn(shell, args, {cwd, env, cols, rows})` → `{onData, onExit, write, resize, pause, resume, kill}`），默认实现 `createRequire(import.meta.url)` 首次调用时 `require('node-pty')`。
- spawn 细节：shell 取 `$SHELL` ?? （darwin `/bin/zsh`）；参数 `['-l']` 登录壳；env 继承 + `TERM=xterm-256color`、`COLORTERM=truecolor`，并复用 `app/music/process-runner.ts` 的 PATH 增补逻辑（GUI 启动的 Electron 没有 login-shell PATH——把该逻辑抽成共享 helper）；cwd 取请求值 ?? 会话 workspace root ?? home。**为 P5 留注入缝**：spawn 参数构造收敛到一个 `buildSpawnProfile(request)` 函数（P5 在此挂 ZDOTDIR 包装做 shell integration，P0 本体不做）。
- 每终端状态：`{ pty, seq, ring: 有界环形缓冲(1MB), pendingFlush(16ms 定时合帧), unackedBytes, generation, attached }`。onData → 追加 pending → 16ms flush 时 `seq++`、入 ring、`broadcast({terminalId, seq, data})`、`unackedBytes += len`；超 128KB 高水位 `pty.pause()`，ack 回落到 64KB 以下 `resume()`。exit 前**先 flush 再广播 exit**（复刻 coalescer 的 flush-before-event 规则，防止 exit 超车尾部输出）。
- **流控代际协议（防永久暂停死锁）**：ack 只来自活着的 renderer——renderer reload、mac 关窗留后台（`safeSend` 静默丢弃）都会让 unacked 永不归零、PTY 停在 pause。规则：① `attach` 即换代——`generation++`、`unackedBytes = 0`、`resume()`，响应携带新 generation；② ack 必须带 generation，旧代 ack 直接丢弃（防重放字节双计/下溢）；③ **无消费者挂载时不 pause**（`attached=false` 期间只写 ring 任其环形覆盖——ring 存在的意义就是这个）；④ 重放 chunks 的写入不产生 ack；⑤ **detach 触发边（复查补——attached 不能只有置 true 的边）**：接线层（`main/ipc/terminal.ts`）监听 webContents `render-process-gone`/`did-start-loading`（reload 必发）与主窗 destroy → `service.markAllDetached()`（置 false、清 unacked、resume），服务端再兜一道"unacked 超水位且 N 秒无 ack 视同 detach"——否则 mac 关窗留后台时，长任务终端累到 128KB 就静默冻死；⑥ **计量单位两侧统一 JS `string.length`（UTF-16 code unit）**——过手的本就是同一个 string，一侧按 utf8 字节记会在中文/emoji 重输出下让两本账渐行渐远；ack 走单向 `ipcRenderer.send`（纯通知，丢一个只是晚一拍 resume，不值 invoke 往返）。
- 出站端口：`configureTerminalOutputBroadcaster(fn)`（practice 模式）。
- `killAllTerminals()`：单例未创建过则 no-op；实现上对 shell 的**进程组**先 `kill(-pid, 'SIGHUP')` 再限时 SIGKILL（nohup 类忽略 SIGHUP 的孙进程也要收走）。**接线位置（审读修正）**：`backend.ts:186` 和 `HeadlessBackend.shutdown()` 各加一行只是对称摆设——桌面宿主把 backend 句柄**丢弃了**（`main-process.ts:155` await 后不赋值），真正的退出路径是 `main-process.ts:341-364` 手工维护的 beforeQuit 清理表（`killTrackedDetachedChildren` 就在那里）。所以必须把 `killAllTerminals` 加进 `ElectronBeforeQuitCleanupOptions`（定义在 `apps/electron/src/app/before-quit.ts:10`——接口字段 + 执行序列两处，此文件在改动清单内）+ 该清理表；另注册 SIGTERM/SIGINT（dev 脚本用 SIGTERM→SIGKILL 杀进程组，before-quit 根本不触发）。
- 单测：mock `PtyBackend`，覆盖合帧、seq、环形缓冲重放、flush-before-exit、高低水位、**代际换代/旧代 ack 丢弃/无消费者不 pause**、no-op shutdown。

### 7.4 桌面 IPC — 11 步配方（照抄现役约定，router 机制是死的别用）

1. channels 常量（7.2 已列）。
2. `packages/shared/ipc/terminal.ts` + index.ts re-export。
3. 可移植工厂 `apps/electron/src/ipc/terminal.ts`：`registerElectronTerminalIpcHandlers({ channels, 回调们, ipcMain? })`，照 `apps/electron/src/ipc/files.ts` 模子（可注入 fake ipcMain 测试）。
4. **`onething.aliases.ts` 加 `'@onething/electron-host/ipc/terminal'`**（漏了只在运行期炸、typecheck 全绿的静默陷阱）。
5. （即 7.3 的服务本体。）
6. 接线 `apps/electron/src/main/ipc/terminal.ts`：先 `configureTerminalOutputBroadcaster(p => getIPCBridge()?.sendToRenderer(IPC_CHANNELS.TERMINAL_DATA, p))`（practice 模式，`main/ipc/practice.ts:36-39`），再把工厂绑到服务方法。
7. `apps/electron/src/main/ipc/handlers.ts` 的 `initializeIPC()` 加一行注册（它在 afterTools hook 里跑，时机无忧）。
8. `apps/electron/src/preload/bridge.ts`：invoke wrapper `createTerminal/listTerminals/writeTerminal/resizeTerminal/killTerminal/ackTerminal/attachTerminal` + 推送 `onTerminalData/onTerminalExit`（照 `onSessionStream` 的 listener+unsubscribe 模式）。
9. `packages/renderer/types/index.ts` 的 `ElectronAPI` 接口手动同步（bridge 与接口会静默漂移，这是 renderer 眼中的唯一契约）。
10. `packages/renderer/platform/web.ts`：方法族 P0 先不实现——web 的 Proxy 兜底会把未实现方法软失败（`on*` → no-op unsubscribe），UI 由 capability 门挡住。但 **capability 字段躲不掉**：`PlatformCapabilities` 加 `terminal` 后，web.ts 的 `webCapabilities` 对象与 `normalizeServerCapabilities` 两处必须补 `terminal: false`，否则 typecheck 直接红——这两行是 P0 动作。
11. 组件直接 `platformApi.onTerminalData(cb)` 订阅，不进 ipc-hub（域级推送的现行惯例）。

capability：`platform/types.ts` 的 `PlatformCapabilities` + `platform/electron.ts` 增 `terminal: true`（web 默认 false）。

### 7.5 前端 — 注册表 + TerminalView

- `packages/renderer/services/terminal-registry.ts`（新）：`Map<terminalId, { term: Terminal, fit: FitAddon, host: HTMLDivElement(常驻 detached), generation }>`。**一个全局** `onTerminalData` 订阅按 terminalId 分发（不是每视图一个）；`term.write(data, () => platformApi.ackTerminal(id, bytes, generation))` 回调驱动 ack；`onTerminalExit` 标记 exited。创建流程：`createTerminal({cols, rows, cwd})` → 建 xterm 实例 → `term.onData(d => writeTerminal(id, d))`、`term.onResize` → `resizeTerminal`、`term.onTitleChange` → 更新 store 标题。⚠️ **不要对 detached 零尺寸 div 提前 `term.open()`**（xterm 已知毛边：0×0 测量、字形缺失）——`open` 推迟到首次真实挂载，且首次 `appendChild` 后立即 `fit()+refresh()`。三个工程细节（复查补）：① registry 顶部 `import '@xterm/xterm/css/xterm.css'`（全案唯一导入点，两个 Vite 构建通吃、vitest 视 CSS 为空模块——漏掉的话 IME 组合输入宿主 textarea 无定位、"中文正常"验收会以极难归因的方式挂）；② xterm 全家在 registry 内**动态 import**（首次 createTerminal 才加载——happy-dom 测试和 web readonly 部署都不拉 xterm）；③ 文件内写 `if (import.meta.hot) import.meta.hot.invalidate()`——module 级注册表在 HMR 下会被换成空 Map、旧 xterm 成孤儿、订阅翻倍，强制整页 reload 即可（attach 协议已把整页 reload 做成廉价操作，这是它的免费红利）。
- **attach 状态机（惰性执行，与"禁提前 open"不打架）**：reload 后 store 只 `listTerminals()` 恢复描述符（幂等 `ensureLoaded()`，P0 由 RightWorkbenchPanel setup 调用，P2 的 Ctrl+` handler 与 Dock 再各加调用点）；attach 全流程收进 `registry.ensureAttached(terminalId, hostEl)`，由 TerminalView onMounted 调用——此刻 div 有真实尺寸，"开 xterm 必有真实 DOM"由调用点天然保证。流程：① 排队该终端的 live chunk；② `attachTerminal(id)` 拿 `{info, chunks, lastSeq, generation}`；③ 按 `info.cols/rows` open+resize；④ `truncated` 先写 `\x1bc` 全量 reset；⑤ 顺写重放 chunks（**不 ack**）；⑥ 丢弃 `seq ≤ lastSeq` 的排队 chunk、其余按序 drain，恢复直写。未挂载终端的推送数据直接丢弃——ring 兜底，晚 attach 不丢内容。
- `stores/terminals.ts`（新 Pinia）：`Array<{ id, title, cwd, exited }>` 纯描述符 + create/close/rename actions + `ensureLoaded()`。
- `components/terminal/TerminalView.vue`（新，唯一的视图组件，Workbench/Dock 共用）：props `terminalId`；onMounted 把注册表的 host div `appendChild` 进来 + `fit()`；ResizeObserver 观察自身 → `fit()`（TabPane 的 v-show 复显与 Splitter 拖拽都不派发元素级 resize，必须自己观察）；exited 状态盖"进程已退出 [重启]"条。
- RightWorkbenchPanel：终端 tab 改为 `{ id: 'terminal-<uuid>', type: 'terminal', terminalId }`，**去掉 type 去重**（files/browser 保留去重）；picker 点 Terminal = 新建实例；关 tab = `killTerminal` + 注册表销毁。假终端的 template/逻辑（114-160、537-591 行）整体删除。
- **xterm 主题（复查修正——"从现有 CSS 变量取静态映射"不可行）**：16 个内置主题 JSON 里没有任何 ANSI 16 色资产，CSS 变量只能凑出 fg/bg；回落 xterm 默认调色板（为深底设计）在纸墨（米色底）、catppuccin-latte 等 7 个浅色主题上 bright yellow/green/cyan 几乎不可读。P0 做一条**推导规则**：按主题 colorScheme 选浅/深两套内置 ANSI 基板 + fg/bg/cursor/selection 从主题变量取，纸墨系单独手调一套（光标色与 selection 半透明也要在米色底上专门核对）；P3 再接主题切换重下发。字体：P0 直接 `getComputedStyle` 解析 `--font-mono`（纯系统字体栈、零加载竞态）显式传给 xterm 的 fontFamily（xterm 不读 CSS）；P3 若接注册表 webfont mono，必须等 `document.fonts` 就位再 open/refresh，否则 cell 宽度按 fallback 字体量错。xterm `scrollback` 定 10000 行（与 ring 1MB 量级对齐；默认仅 1000 行——重放 1MB 时头部会被静默丢弃、addon-search 也只搜 buffer），写死不进设置。

### 7.6 P0 验收

vim/htop/claude 交互正常；Ctrl+C/粘贴/中文/ANSI 色正常；`cat` 3MB 文件不冻 UI 且尾部完整；两个终端并存互不串流；关 tab 进程真死（`ps` 验证）；renderer 手动 reload 后终端列表与 scrollback 恢复；`bun run boundary:gate`、既有测试改绿（见第十三节）。附加（复查补）：关窗留后台跑长输出→重开窗不冻（detach 边生效）；中文 vim 会话（CJK 记账一致）；终端聚焦时 useShortcuts 全部跳过（最小仲裁已提前进 P0，见 9.2）。

## 八、P1 — Workbench 四向分屏

1. **树泛化（实读确认 diff <60 行，原地泛化、勿 fork）**：`WorkspaceLeaf<TTab extends {id:string} = ChatTab>` 默认类型参数（ChatTab 全文件只在 3 处露头）；泛型版 `splitLeaf` 改收**预构建的 tab**（比注入 createTab 回调更简）；同文件保留旧签名 `splitLeaf(root, leafId, sessionId, dir)` 与 `activeSessionOf` 作 chat 薄包装——`workspace.ts`/`workspace-persistence.ts`/`workspace.test.ts` 一行不改、原样绿（persistence 是纯 chat 序列化，泛化零涉及）。不 fork 的理由：`closeLeaf` 祖父塌缩与 `splitLeaf` 的 0-then-grow 钳制注释是踩过坑的活知识，复制一份必然漂移。
2. `stores/workbench.ts`（新 Pinia）：分屏树，leaf = `{ id, tabs: WorkbenchTab[], activeTabId }`；tab union 为 files/file/terminal/browser/review，终端 tab 带 `terminalId`。⚠️ **撞名（复查揪出）**：该 union 现在是 RightWorkbenchPanel.vue:254 的组件局部类型，而 `types/tabs.ts:21` 已导出一个**形状完全不同的死 `WorkbenchTab`**（零消费者）——提升前先删死类型、由组件局部定义占用该名。RightWorkbenchPanel 的 `openTabs/activeTabId` 组件态整体迁入（`openFile/openGoalReview` 的 defineExpose 契约对 App.vue 保持不变）。
3. `components/workbench/WorkbenchPaneTree.vue`（新）：照 `PanelTree.vue` 递归 Splitter/SplitterPanel；leaf 渲染 Tabs 条 + 各 pane 内容（内容组件从现 RightWorkbenchPanel 模板拆出：TerminalView / EditorWorkbench / browser iframe / GoalReviewWorkbench）。
4. **分屏手势**：第一步 tab 右键菜单"向右/向下/向左/向上分屏"（把当前 tab 移入新 leaf）+ 空 pane 的"+"；第二步复用 chat `splitDrop` 的四向拖拽落点样式（能抽共享就抽，抽不动就先菜单）。
5. 关 pane：末 tab 关闭即 `closeLeaf` 合并回邻居（尺寸并入，退化 split 塌缩——树操作自带）。

**验收**：终端左右分屏各自独立交互；xterm 在树重排后不重建（registry DOM 迁移生效，输出不断流）；拖 resizer 两侧终端都正确 refit。

## 九、P2 — 底部 Dock + 移动

1. App.vue：`.app-content` 内新垂直 Splitter 包住现 `app-content-splitter`；底部 `SplitterPanel`（`sizeUnit='px'`，默认 280，min 120，collapsible，`:collapsed`）挂 `components/terminal/TerminalDock.vue`（新）：左侧终端列表（列**全部**终端并带位置徽标，不只 Dock 位——否则"终端去哪了"会成高频困惑）+ 右侧 TerminalView + "新建/清理已退出/最大化"动作。**盯住** `.workbench-slide` 宽度冻结计算（App.vue:529-533）——它量的是内层水平 splitter 宽度，包一层后需真机确认不歪。
2. Ctrl+`：`ShortcutSettings`（`packages/shared/ipc/settings.ts:56`）加可选 `toggleTerminal` + defaults；`useShortcuts` 照 Cmd+, 的硬编码兜底精神接 handler 线（`ShortcutHandlers` + App.vue 调用点）。**焦点仲裁（复查修正：全局键有三个入口，逐个处理，"单一策略"不成立）**：① `useShortcuts`（DOM）——入口加 `isInsideTerminal(event.target)` 门：终端内除白名单穿透键（toggleTerminal、Cmd+,、Cmd+F 预留给 P3 域内查找）外全部放行给 shell（Cmd+1..9、Cmd+B/K 一并覆盖）；此条的最小版（终端内跳过 useShortcuts 全部处理）**提前进 P0**，白名单机制留本期。② **应用菜单加速键在主进程消费、DOM 拦不到**——`CmdOrCtrl+W`（application-menu.ts:53 → 'menu:close-chat'）会在终端聚焦时关掉聊天 tab，其 renderer handler 须加终端焦点分支（改为关焦点终端 tab）。③ `useDoubleShift`（独立 window 监听，双击 Shift 弹 Search Everywhere 抢焦点）同加门。反向地，白名单键注册进 `term.attachCustomKeyEventHandler`（registry 统一装）保证 xterm 不吞。（好消息：usePermissionShortcuts 的裸键 Enter/D 因 xterm 隐藏 textarea 天然豁免。）**焦点语义（VS Code 式）**：Ctrl+` 未聚焦则聚焦终端、已聚焦则收起，收起后焦点回聊天输入框（`chatContainerRef.focusInput` 现成）；registry 记录"最后聚焦终端"供定向。
3. 移动：终端 tab 菜单"移到底部面板 / 移到 Workbench"= terminals store 改 `location` + 两棵树增删 tab，注册表实例不动、进程不断。
4. Dock 开合、高度存 localStorage（`inspectorPanelSize` 同款待遇）。

## 十、P3 — 持久化与打磨

- **布局持久化**：saveUIState payload（`renderer/types/index.ts:1742` + `preload/bridge.ts:1251`）加 `workbenchLayout` 字段：`{ version: 1, tree(不含终端进程态), dock: { open, height, terminalCwds } }`。启动恢复布局；终端位恢复为"在原 cwd 重启一个新 shell"（进程不跨重启）。合并语义**已验证无虞**：`mergeOnethingUiState`（`packages/onething-runtime/src/storage/app-state.ts:101-112`）本就是字段级合并 + 单进程同步读改写，两 store 竞写不同字段不会互相覆盖——只需给 patch 类型和 merge 加上新字段。
- 主题：xterm theme 从 CSS 变量计算，监听 themes store 切换重下发；终端字体接字体注册表的 mono 栈。
- OSC 标题已接（onTitleChange），补 tab 标题溢出中断样式；加 `@xterm/addon-web-links`（链接落系统浏览器，Browser v2 落地后可选改内嵌打开）、`addon-search`（Cmd+F 域内查找，按焦点 pane 路由、与 EditorWorkbench 自有 find 同域共存；unicode11 已随 P0 装）。
- **拖文件进终端**：全局 `installGlobalFileDropGuard` 会吞掉未注册 drop zone 的拖放（无声无息）——TerminalView 注册自己的 zone：file 拖入 → 写入 shell 转义后的路径 + 尾随空格（多文件空格分隔），高亮样式与聊天附件流区分。
- **布局恢复语义补三句**：分屏树中的终端 tab 按记录 cwd 重启新 shell（与 dock 同语义）；`inspectorOpen` 不随 workbenchLayout 恢复（重启默认闭，树等面板打开时按位复现）；shell 不做选择 UI（`TerminalCreateRequest.shell` 字段留给 API/P5）。`-l` 登录壳全量跑用户 rc，重 rc 用户开终端有秒级延迟——进真机清单。
- 流控真机压测（`yes`、`find /`），调水位参数。

## 十一、P4 — Web 对齐

> **已拍板（2026-07-26）：本期冻结**，出现真实远程场景再启。理由：单用户个人部署收益/风险比低（手机 xterm 体验差、全案安全成本最高的一期、前置依赖补全局 web auth）。架构上 P0 守住懒加载（readonly/headless 永不 dlopen）即可，不留钩子也无损失。以下内容保留作未来启动时的设计存档。

1. **能力**：`packages/core/runtime-facade.ts:29` `RuntimeHostCapabilities` 加 `terminal: boolean`；`apps/server/src/runtime.ts:698` `webServerCapabilities` 从静态 const 改按 tier 计算（full → `terminal: true`）；`platform/web.ts` `normalizeServerCapabilities` 接上。
2. **控制面**（http.ts matchRoute，天然过 bearer auth + owner scope）：`POST /api/terminals`、`GET /api/terminals`、`DELETE /api/terminals/:id`；resize 只走 WS 帧（与桌面 IPC 对称，控制面不重复设端点）；readonly tier 一律 501。
3. **数据面**：`apps/server/src/main.ts` `server.on('upgrade')` + `ws`（noServer）挂 `/api/terminals/:id/ws`；帧 `{input|resize}` 入、`{data(seq)|exit}` 出；`ws.bufferedAmount` 超水位 `pty.pause()`；30s ping/pong（现有 SSE 连心跳都没有，无可复用）。**重连复用 attach 语义**（复查修正——不另设 `?after=` 弱协议）：WS 建立后服务端首个出帧即 `TerminalAttachResponse`（generation/cols/rows/chunks/truncated 全套），与桌面同一状态机。**流控模式缝 P0 就留**：共享服务每终端 `flowControl: 'ack' | 'transport'`（attach 时声明）——web 消费者永不发 ack，transport 模式下服务不记 unackedBytes、由宿主按 bufferedAmount 自调 pause/resume；不留这道缝，web 终端 128KB 后照样冻死。
4. **安全硬化（终端是本服务器第一个零审批任意执行的 HTTP 面，门槛必须高于其他端点）**：
   - **无 token 不开张**：`ONETHING_SERVER_TOKEN` 未配置时终端端点一律 501、capability 报 false——**loopback 也不豁免**。否则任意网页可对 `ws://127.0.0.1:8787` 发起跨站 WebSocket 劫持（WS 无同源策略；现有 CORS 还反射任意 origin，`http.ts:2233-2240`）直接拿 shell。
   - **升级路径自跑认证 + Origin 校验**：http.ts 的 auth 门不覆盖 `upgrade` 事件，upgrade handler 自行 `tokenMatches()`；同时校验 `Origin` 头在允许列表（服务源 + ONETHING_CORS_ORIGIN）。
   - **token 不走 URL**：`?token=` 会漏进代理/访问日志和浏览器历史——改用 `Sec-WebSocket-Protocol` 携带，或控制面（已认证）先 `POST /api/terminals/:id/ticket` 领一次性短时 ticket、WS 用 ticket 连。
   - owner 归属校验照 `getSessionForContext` 的 scope 逻辑，防跨 owner attach。
5. `apps/web/vite.config.ts` `/api` 代理加 `ws: true`（一行）；`platform/web.ts` 实现 terminal 方法族（WS 客户端 + 控制面 fetch）。方法名**尽量**同名（create/list/kill 同名；attachTerminal/ackTerminal 在 web 无对应物——attach 语义由 WS 首帧承担、ack 不存在），electron.ts 的转发 Proxy 仍零改动。
6. 已知前置债：web 前端从不带 Authorization（`requestJson` 无 token 支持）——而上一条又要求有 token 才开终端，所以 **web 终端实际可用的前提是先补全局 web auth**（独立工作项，排在 P4 之前或并入 P4）。

## 十二、P5 — AI 融合：命令账本 + 聊天可见 + 建议回填

原则一句话：**AI 是用户终端的读者和参谋，不是操作者**——建议只回填不执行；终端输出进 AI 上下文一律按不可信数据处理。AI 自己干活继续走它的 bash 工具，两条链路不合并。

### 12.1 命令账本（shell integration，OSC 133——业界标准，VS Code/iTerm2/Warp/WezTerm 同款）

PTY 字节流没有"命令"概念，边界靠 shell 自己打标：
- **注入**：`buildSpawnProfile`（7.3 预留缝）对 zsh 用 ZDOTDIR 包装。⚠️ 设了 ZDOTDIR 后 zsh **全部**启动文件都改道，登录壳 `-l` 顺序读 `.zshenv → .zprofile → .zshrc → .zlogin`——macOS 用户 PATH 惯例在 `.zprofile`，只 shim `.zshrc` 会把用户 PATH/env 静默剪掉（正是方案在别处专门防的事故）。包装目录须提供**四个 shim**（VS Code 同款），各自还原真实 ZDOTDIR 后 source 用户对应文件，钩子挂 `.zshrc` shim 尾部。钩子发 `OSC 133;C/D;<exit>`（输出始/命令终+退出码）、命令原文（preexec `$1`，OSC 633;E 语义）、cwd（OSC 7）——**不发 A/B**：B（提示符终）只能靠 PROMPT 内嵌转义实现、会跟 p10k 类主题打架，而账本只需 C/D + 633;E + OSC 7。xterm 对不认识的 OSC 静默忽略，**终端显示零影响**。bash/fish 后续跟进，先 zsh（本机即 zsh）。
- **解析在 app/terminal 服务内**（它本来就过手全部输出流，且 web 端免费共享）：产出 per-terminal 有界账本（~200 条）：`{ command, cwd, exitCode, durationMs, startSeq, endSeq, excerpt(输出 head+tail 各 4KB) }`。
- **降级是铁律**：注入失败 / ssh / tmux / 异构 shell → 标记消失，账本自动退化为"仅原始尾部可读"，终端本体永远不受影响（best-effort，任何注入错误都不能挡 shell 启动）。

### 12.2 AI 可见（两层，接现有变量系统）

- **变量 `terminal`**（volatility 档位名实为 `'turn'`——类型是 `static | turn | on-demand`，没有 'volatile'；turn 档即走 contextUpdate 尾注链）：百 token 级小摘要——活跃终端数 + 最近 N 条 `命令行 + 退出码 + 耗时`。聊天里 AI 自动知道"你刚跑了什么、成没成"，不用你贴。**注册走 gateway 范式**（复查修正：provider 注册唯一入口在 product 层 `variables/bootstrap.ts`，而 product 层禁 import app 层）：`src/variables/providers/terminal.ts` 新 provider + `TerminalGateway` 接口、`StandardVariableProviderGateways` 加可选字段（以上 product 层），`app/variables/gateways.ts` 实现读 `getTerminalService()` + `app/variables/index.ts` 传入（app 层）；`'terminal'` 加入 `RESERVED_NAMES` 防自定义变量抢注。摘要值**禁含活计时**（"运行中 12s"式活值让 turn 通道 dedupe 失效、每轮重注——background-jobs.ts:15 的注释是现成教训）；provider 常驻注册、gateway 在 `list()` 时查 `getSettings()`（注册时门控会让开关翻转要重启才生效）。
- **工具 `terminal_read`**（只读，注册进 full registry——放 `app/tools/builtin/` 完全合法：严规则集只禁 node:fs 等，不禁跨 app 模块 import，照 read.ts 委托模式写即可；`builtinTools` 数组加一项，零 alias/backend 改动）：AI 按需拉某终端的结构化命令记录 / 单条命令的输出摘录 / 裸尾部 scrollback。大输出不进默认上下文，AI 想看才拉；execute 时查 getSettings()（与变量共享同一开关）。

### 12.3 建议回填（保持用户 agency）

- AI 回复中的命令块加"**填入终端**"动作：写进当前终端输入行、**不回车**，用户看一眼再执行。
- exit≠0 的命令在终端 UI 出"问 AI"角标：预填一条带账本引用的消息进聊天框。
- Warp 式行内 ghost-text 自动补全列为远期，不进本方案。

### 12.4 安全与成本

- **prompt injection**：命令输出是任意程序打印的任意文本，进上下文时包裹为数据（与 Browser v2 对页面内容的处理哲学一致）——**信封抽成共享 helper**、两案共用同一 XML 标记与警示文案，不做两套。
- **跨渠道硬排除（复查揪出的泄漏链）**：channel-guard 只过滤 scope=global 的自定义变量，provider 变量不在其列——terminal 变量若不自设门，**微信/Telegram 网关会话的 prompt 里会带着你本机刚跑的命令行**，且上下文经 L1 逐轮追踪与 provider-requests dump 持久化到磁盘明文。规则：gateway 在 `list()` 用外部身份会话判定（`isExternalIdentitySession` 同款逻辑），外部会话一律返回空；`terminal_read` 同判定拒答。
- **隐私/token**：摘录限额（单条 8KB、变量摘要百 token 级）；设置一个开关"终端对 AI 可见"（**已拍板：默认关**；开=摘要级，关=变量与工具都不暴露），只此一个档位开关，不堆参数；开关文案明示"开=命令摘录会进请求日志落盘"。
- AI 永不向用户终端写入（write 通道对 AI 不可达），杜绝"注入的输出诱导 AI 在你 shell 里跑命令"这条攻击链。

### 12.5 对既有阶段的影响

近零返工，但**不全是装配层加法**（复查修正）：P0 只须把 spawn 参数构造收敛成 `buildSpawnProfile`（已写入 7.3）；账本/工具/回填是服务层与装配层的加法；**变量除外**——须按 12.2 的 gateway 范式动 product 层三处 + app 层两处。不动 PTY 数据面、不动分屏/Dock、不动流控协议。

## 十三、测试与回归

| 项 | 动作 |
| --- | --- |
| `components/__tests__/App.container-layout.test.ts` | **计划内重写**：源码字符串匹配套件钉死了假终端（`executeTool(\n 'bash'`、`<iframe`、WorkbenchTabType union 原文）和双面板 splitter 结构，P0/P1/P2 各阶段都会命中，按新结构重写断言而非迁就 |
| `workbench/__tests__/RightWorkbenchPanel.test.ts` | 更新：category-slot 断言、electronAPI stub 加 terminal 方法族。注意它靠 `Object.defineProperty(window, 'electronAPI')` + platformApi 按访问解析——新代码**禁止 module 顶层缓存 platformApi 方法**，否则测试静默绕过。真 mount 会把 xterm 拖进 happy-dom（open/measure 必炸）——`global.stubs` 把 TerminalView 替空壳 + registry 对 xterm 动态 import（7.5 已定）双保险 |
| 新增单测 | app/terminal service（mock PtyBackend）；泛化后的树操作（chat 原测试原样绿 + workbench 用例）；可移植 IPC 工厂（fake ipcMain）；registry ack/分发逻辑 |
| 守门 | `bun run boundary` `boundary:gate` 零新红；`import-side-effect-free.test.ts` 自动覆盖新模块；`bun run typecheck` |
| 真机清单 | vim/htop/中文 IME/大输出/kill -9 shell 后 UI 状态/分屏拖拽 refit/Dock 开合动画/renderer reload 重放 |

## 十四、与 Browser v2 方案的时序关系（两案同日定稿、抢同一块 Workbench 地皮）

`docs/design/browser-v2.md` 把 browser tab 重写为主进程 WebContentsView 覆盖占位 div，其 bounds 同步、遮挡信号、浮层矩阵全部按**今天的单 Tabs 面板 + 双面板 splitter** 写死（引用了大量 App.vue/RightWorkbenchPanel 行号）；本案 P1 分屏树 + P2 Dock 会把这些几何假设全部推翻。约定：

1. **实施顺序（已拍板 2026-07-26）：终端全线先行（本会话实施），Browser v2 之后另开会话、对终端落地后的最终几何一次接线**；P2 Dock 与 browser-v2 P1a 可再穿插。**两案绝不并行开工**——同时重写同两个测试文件（App.container-layout / RightWorkbenchPanel）。行号锚点以先落地者的新结构为准；`webServerCapabilities` 静态→计算化两案只做一次；不可信内容信封共用一个 helper（12.4 已定）。
2. **分屏树 × WebContentsView 四个共存问题**（记入 browser-v2 接线清单）：① resizer 命中区（hit-size 12px 对称外扩）落进原生视图矩形的一半会失灵——browser bounds 须内缩 hit 边距；② 分屏拖拽可能**只平移不改尺寸** browser pane，占位 div 的 ResizeObserver 不触发——WorkbenchPaneTree 在任何 resizer 拖拽时主动广播重查 bounds；③ Workbench 自有浮层（tab picker、分屏右键菜单、xterm 搜索条）伸进 browser pane 矩形会被原生视图盖住——补进 browser-v2 §8.2 浮层矩阵；④ Dock"最大化"铺到 Workbench 区域会被 WebContentsView 压住——接 overlay-presence 遮挡信号；另同 leaf 内 tab 切换是 v-show，browser tab 被切走时须显式 setVisible(false)。browser tab 保持全局去重是这一切可控的前提。
3. 持久化所有权：browser 内层 web-tab 列表归 BrowserService state.json；browser workbench-tab 的**树位置**归本案 P3 的 workbenchLayout——两层各管各的（browser-v2 §8.5 "只记一个布尔"的契约在 P1 后不再成立，以本条为准）。

## 十五、风险清单（前五个最疼）

1. **退出路径接错**（审读揪出，已并入 7.3）：桌面真正的清理路径是 `main-process.ts` 的 beforeQuit 表，不是 `backend.shutdown()`——接错的话 P0 一个 shell 都收不掉；dev 的 SIGTERM→SIGKILL 还得额外注册信号钩子。
2. **流控死锁**（审读揪出，已并入 7.2/7.3/7.5）：无代际协议的 ack 流控，renderer reload / mac 关窗留后台就把 PTY 永久 pause。
3. **alias 静默失败**：`@onething/electron-host/ipc/terminal` 忘登记 → typecheck 全绿、运行才炸。
4. **App.container-layout.test.ts** 是字符串匹配套件，每阶段都撞，工作量计划内。
5. **IPC 洪水**：合帧必须在服务内做且 exit 前 flush；`sendToRenderer` 裸发会重演旧病。
6. 次级：终端焦点内全局快捷键单一仲裁策略（9.2）；`.workbench-slide` 宽度冻结在包垂直 Splitter 后需真机验证；webgl × transparent 窗真机验证；detached div 提前 `term.open` 的字形毛边（7.5 已规避）；spawn-helper +x 位在新装依赖后可能再丢；ACP "terminal" 命名混淆（代码注释里标注两者无关）。P4 安全三条（无 token 不开张 / Origin 校验 / token 不走 URL）见第十一节。
