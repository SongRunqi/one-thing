# Electron IPC / `window.electronAPI`（本仓库速查）

这个项目把「渲染进程」想调用的能力，统一封装成 `window.electronAPI`，再通过 Electron 的 IPC 让「主进程」去真正执行（读写本地 store、请求 AI 接口等）。

## 进程与文件对应关系

- 渲染进程（Vue 页面）：`src/renderer/**`
  - 例如：`src/renderer/stores/chat.ts` 会调用 `window.electronAPI.sendMessage(...)`
- 预加载脚本（安全桥）：`src/preload/index.ts`
  - 用 `contextBridge.exposeInMainWorld('electronAPI', ...)` 把白名单 API 挂到 `window`
  - 内部用 `ipcRenderer.invoke(...)` 发请求给主进程并等待返回值
- 主进程（Electron 后端）：`src/main/**`
  - 入口：`src/main/index.ts`
  - 创建窗口：`src/main/window.ts`
  - 注册 IPC：`src/main/ipc/handlers.ts`
  - 具体处理器：`src/main/ipc/chat.ts`、`src/main/ipc/sessions.ts`、`src/main/ipc/settings.ts`
- IPC 通道名与共享类型：`src/shared/ipc.ts`
  - `IPC_CHANNELS` 是通道名常量，渲染/预加载/主进程共用，避免拼字符串写错

## 这套 IPC 的关键点（`invoke` / `handle`）

本项目用的是「请求-响应」模型：

- 渲染/预加载：`ipcRenderer.invoke(channel, payload)`（返回 Promise）
- 主进程：`ipcMain.handle(channel, async (event, payload) => { return result })`

所以你在渲染进程里看到的：

- `await window.electronAPI.sendMessage(...)`

本质上就是：

- `await ipcRenderer.invoke('chat:send-message', { ... })`

然后由主进程 `ipcMain.handle('chat:send-message', ...)` 返回一个对象（例如 `{ success: true, ... }`）。

## `window.electronAPI` 是哪里来的？

它不是 Electron 自带的对象，而是项目自己在预加载脚本里定义的。

- 定义位置：`src/preload/index.ts`
- 挂载方式：`contextBridge.exposeInMainWorld('electronAPI', electronAPI)`

这样渲染进程（网页环境）就能在不打开 Node 权限的前提下，安全地调用你允许的 API。

## 从 `sendMessage()` 跑一遍完整链路

1) 渲染进程：`src/renderer/stores/chat.ts`

- 调用：`window.electronAPI.sendMessage(sessionId, content)`

2) 预加载：`src/preload/index.ts`

- 转发：`ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { sessionId, message })`

3) 主进程：`src/main/ipc/chat.ts`

- 接收：`ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, { sessionId, message }) => ...)`
- 处理：保存 user message → 根据 settings 调用 AI → 保存 assistant message → `return { success, userMessage, assistantMessage }`

4) 回到渲染进程

- `invoke` 的 Promise resolve 为上面 `return` 的对象
- store 把 `userMessage`/`assistantMessage` 追加到 `messages`

## 常见排错位置

- 渲染进程报 `window.electronAPI is undefined`
  - 看 `BrowserWindow` 是否配置了正确的 `preload` 路径（`src/main/window.ts`）
  - 看是否开启 `contextIsolation: true`（本项目是开启的，配套 `contextBridge`）
- `invoke` 一直 pending / 报 “No handler registered”
  - 看主进程是否有对应 `ipcMain.handle(channel, ...)`
  - 看 `IPC_CHANNELS` 两边是否一致（推荐都从 `src/shared/ipc.ts` 引用）

## 开发 / 打包入口的区别（避免混淆）

- 开发脚本 `npm run dev:electron` 直接跑根目录的 `main.js`（它配套用根目录 `preload.js`）
- 打包配置 `electron-builder.yml` 走的是 `dist/main/index.js`（由 `build-main.js` 编译 `src/main/index.ts` 输出）

