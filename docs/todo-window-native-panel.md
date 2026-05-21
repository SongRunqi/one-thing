# Todo Window Native Panel 实现说明

## 背景

Todo / Notes 独立窗口最初是普通 Electron `BrowserWindow`。这会带来几个桌面体验问题：

- 通过全局快捷键打开 Todo 时，主窗口可能被一起带出来。
- 隐藏 Todo 时，主窗口也可能被系统或 `app.hide()` 一起隐藏。
- Todo 已经可见但被其他窗口盖住时，再按快捷键容易被误判成“隐藏”，而不是把 Todo 捞回前台。
- macOS 上普通 `hide()` 在 panel / 透明窗口组合下可能先改变 frame，再消失，导致肉眼可见的位置跳动。
- Pin on/off 后窗口层级、激活状态和快捷键语义容易回退。

当前实现把 Todo window 改成 macOS native non-activating panel 语义：Todo 是一个独立辅助面板，数据仍和聊天卡片共享，但窗口显示/隐藏、置前、pin、位置保存都由 Todo 自己负责，不再牵连主窗口。

## 相关文件

- `src/main/window.ts`
  - Todo window 创建、显示、隐藏、toggle、pin、窗口状态保存。
- `src/main/native/macos-panel.ts`
  - TypeScript native addon loader 和安全 fallback。
- `native/macos-panel/macos_panel.mm`
  - AppKit / Cocoa 层的 native panel 控制。
- `scripts/build-macos-panel.mjs`
  - 构建并 codesign native addon，输出到 `resources/native/macos_panel.node`。
- `src/shared/ipc/todo-plan.ts`
  - Todo window action 的 IPC 类型。
- `src/main/shortcuts/global-shortcuts.ts`
  - 全局快捷键入口。

## 核心语义

Todo window action 默认使用：

```ts
{
  activation: 'preserve-current-app',
  preserveMainWindowVisibility: true,
}
```

含义是：

- 打开 Todo 不应该主动激活 onething 主应用。
- 打开 / 隐藏 Todo 不应该显示或隐藏 main window。
- 如果调用过程中 macOS 或 Electron 临时把隐藏的 main window 带出来，只恢复“调用前本来隐藏”的 main window；调用前已经可见的 main window 永远保持可见。

`TodoPlanActivationMode` 有两个值：

- `preserve-current-app`
  - 全局快捷键默认语义。优先用 native `orderFrontRegardless()` 显示 Todo，并尽量保持当前 macOS active app 不变。
- `focus-if-app-active`
  - 当 onething 本来就是当前 active app 时，可以走普通 focus 语义。

## Window 创建

Todo window 在 `openTodoPlanWindow()` 中创建，macOS 下关键配置是：

```ts
new BrowserWindow({
  type: 'panel',
  focusable: true,
  acceptFirstMouse: true,
  skipTaskbar: true,
  transparent: true,
  titleBarStyle: 'hidden',
  trafficLightPosition: { x: 16, y: 9 },
  minWidth: 320,
  minHeight: 280,
})
```

这些选项负责 Electron 侧的基础形态；真正的 non-activating、置前、隐藏和 pin 逻辑在 native bridge 里完成。

启动后 `warmTodoPlanWindow()` 会后台创建并加载一个隐藏的 Todo window。它只预热 renderer 和 native panel，不调用 native show / Electron show；首次快捷键打开时复用这个已加载窗口，从而避免把 CodeMirror、Markdown live preview 和 note snapshot 的初始化成本压到第一次显示那一下。

窗口大小和位置保存在主窗口 state 文件的 `todoPlan` 字段下，和 main window 的 `width / height / x / y` 分开：

```ts
{
  width,
  height,
  x,
  y,
  todoPlan: {
    width,
    height,
    x,
    y
  }
}
```

## Native Panel Bridge

`native/macos-panel/macos_panel.mm` 暴露 5 个 N-API 方法：

```ts
configureNonActivatingPanel(nativeWindowHandle): boolean
showNonActivatingPanel(nativeWindowHandle): boolean
hideNonActivatingPanel(nativeWindowHandle): boolean
isNonActivatingPanelFrontmost(nativeWindowHandle): boolean
setNonActivatingPanelPinned(nativeWindowHandle, pinned): boolean
```

### configure

`ConfigureWindow()` 会：

- 给 `NSWindow` 增加 `NSWindowStyleMaskNonactivatingPanel`。
- 调用私有 selector `_setPreventsActivation:YES`，降低点击 Todo 时激活 Electron app 的概率。
- 设置 collection behavior：
  - `CanJoinAllSpaces`
  - `FullScreenAuxiliary`
  - `Transient`
- 设置 `hidesOnDeactivate = NO`。
- 配置前后保存并恢复 frame，避免 style mask 改动造成窗口位置变化。

### show

`ShowWindow()` 会：

- 再次执行 `ConfigureWindow()`，防止 Electron 后续状态切换覆盖 native 设置。
- 如果窗口被 miniaturize，先 `deminiaturize`。
- 调用 `orderFrontRegardless()` 把 Todo 捞到前台。
- 如果可以成为 key window，调用 `makeKeyWindow()` 让 Todo 可以接收输入。

这条路径比 Electron `showInactive() + moveTop()` 更可靠。Electron 路径只作为 native bridge 不可用时的 fallback。

### hide

`HideWindow()` 不使用 Electron `BrowserWindow.hide()` 作为 macOS 主路径，而是在 Cocoa 层：

- 保存当前 stable frame。
- 关闭隐式动画。
- 调用 `orderOut:nil`。
- 如果隐藏过程导致 frame 变化，立即恢复到隐藏前 frame。

这样避免“隐藏前先跳位置再消失”的视觉问题。

### frontmost

`IsWindowFrontmost()` 判断：

- window 不可见则 false。
- key window 则 true。
- 否则用 `orderedIndex == 0` 判断是否在窗口栈最前。

toggle 依赖这个判断：

- Todo hidden：打开。
- Todo visible 且 frontmost：隐藏。
- Todo visible 但 behind：只捞到前台，不隐藏。

### pin

`SetWindowPinned()` 使用 native window level：

- pinned：`NSStatusWindowLevel`
- unpinned：`NSNormalWindowLevel`

native 失败时 fallback 到 Electron：

```ts
window.setAlwaysOnTop(pinned, pinned ? 'floating' : 'normal')
```

## Main Window 隔离

`prepareTodoPlanWindowAction()` 会在需要 preserve current app 时：

1. 设置短时间 suppress 标记，阻止 `app.on('activate')` 立刻恢复 main window。
2. 捕获所有 main window 当前可见性快照。

`restoreHiddenMainWindows()` 只处理“调用前隐藏、调用后被误显示”的 main window。它会在多个延迟点重复检查：

```ts
[0, 80, 250, 600, 1200, 2400]
```

这样做是为了覆盖 macOS / Electron 可能异步触发的 activate 或 show 行为，但不会影响调用前本来就可见的 main window。

`app.on('activate')` 中也会检查：

```ts
if (shouldSuppressMainWindowActivation()) {
  return
}
```

因此 Todo 快捷键导致的短时间 activate 不会把 main window 拉出来。Dock 点击 onething 时，如果没有 suppress，仍按普通 app activate 语义显示 main window。

## Frame Guard 与状态保存

Todo window 有两个保护标记：

- `isHidingTodoPlanWindow`
  - hide 期间忽略 `move` / `resize` 事件，避免隐藏动画或系统 transient frame 被写入 state。
- `isSyncingTodoPlanNativeFrame`
  - native configure / show / pin 时短暂忽略 `move` / `resize`，避免 AppKit 调整 frame 时污染持久化 bounds。

隐藏前会读取 stable bounds：

```ts
const stableBounds = todoPlanWindow.getBounds()
saveTodoPlanWindowState(todoPlanWindow, stableBounds)
```

这保证即使 native / Electron 隐藏时发生临时 frame mutation，落盘的仍是用户真正看到和调整过的位置。

## 快捷键行为

全局快捷键在 `registerGlobalWindowShortcuts()` 中注册，调用：

```ts
toggleTodoPlanWindow({
  activation: 'preserve-current-app',
  preserveMainWindowVisibility: true,
})
```

目标行为：

- 外部 app 激活时按快捷键：Todo 出现，main window 不出现。
- Todo 被其他 app 或窗口盖住时按快捷键：Todo 被捞回前台。
- Todo 已经在最前时按快捷键：只隐藏 Todo。
- Todo 失焦时保持可见，不再自动隐藏。
- main window 获得焦点或 app activate 时，未 pinned Todo 会被 native orderOut 临时收起，避免作为同 app 可见窗口一起被带出；pinned Todo 仍保持置顶。
- main window 和 Todo 同时可见时隐藏 Todo：main window 保持可见。
- main window 隐藏时打开 / 隐藏 Todo：main window 保持隐藏。

## 构建与打包

native addon 构建命令：

```bash
bun run build:native:mac
```

脚本行为：

1. 清理 `native/macos-panel/build`。
2. 使用 `node-gyp rebuild --directory native/macos-panel` 编译 Objective-C++ addon。
3. 复制产物到 `resources/native/macos_panel.node`。
4. 用 ad-hoc `codesign --force --sign -` 签名。

`package.json` 已把它接到：

- `bun run dev`
- `bun run start`
- `bun run build`

`electron-builder.yml` 会把 `resources/native` 打进包内。运行时 loader 会按以下顺序尝试加载：

1. `process.resourcesPath/native/macos_panel.node`
2. `app.getAppPath()/resources/native/macos_panel.node`
3. `process.cwd()/resources/native/macos_panel.node`
4. 源码目录相对 fallback 路径

如果 native bridge 不可用，会 warning 一次，然后回退到 Electron 行为。

## 测试覆盖

主进程测试在 `src/main/__tests__/todo-plan-window.test.ts` 覆盖：

- macOS hide 优先调用 native `hideNonActivatingPanel()`。
- native hide 失败时 fallback 到 Electron `hide()`。
- Todo visible 但 behind 时，toggle 调 native show，不隐藏。
- Todo frontmost 时，toggle 隐藏。
- Todo blur 时保持可见，不调用 native hide；pin on/off 不改变 blur 行为。
- open / hide / toggle 不破坏 main window 可见性。
- warm Todo window 只创建隐藏窗口，不展示、不聚焦、不激活 app。
- native configure / show / pin 期间不会保存 transient bounds。
- hide 期间 move / resize 不污染 Todo window state。
- pin on/off 后 toggle 语义保持一致。

快捷键测试在 `src/main/shortcuts/__tests__/global-shortcuts.test.ts` 覆盖：

- 全局 Todo window 快捷键传入 `activation: 'preserve-current-app'`。
- 快捷键传入 `preserveMainWindowVisibility: true`。

建议回归命令：

```bash
bun run test src/main/__tests__/todo-plan-window.test.ts src/main/shortcuts/__tests__/global-shortcuts.test.ts
bun run typecheck:node
bun run build:native:mac
```

## 手动验证清单

macOS 上重点验证这些场景：

- Chrome / TextEdit 等外部 app 激活时，按 Todo 快捷键，Todo 能出现，main window 不出现。
- Todo 已经可见但在后面时，再按快捷键，Todo 被捞到前台。
- Todo 在前台时，再按快捷键，只隐藏 Todo。
- 点击主窗口或外部 app 后，Todo 失焦但不自动隐藏。
- 把 main window 和 Todo 同时调到前面时，未 pinned Todo 会被临时收起，不覆盖 main；快捷键可再次打开。
- main window 和 Todo 同时可见时隐藏 Todo，main window 不消失。
- main window 隐藏时打开 / 隐藏 Todo，main window 不出现。
- 隐藏 Todo 时窗口不先跳位置。
- 拖动或 resize Todo 后隐藏再打开，位置和大小保持。
- pin 打开后 Todo 保持浮在前面；pin 关闭后恢复普通 panel 层级，但快捷键仍能捞起。

## 当前边界

- 这个实现优先服务 macOS；Windows / Linux 使用 Electron fallback，仍保证 hide Todo 不主动 hide main。
- `_setPreventsActivation:` 是 AppKit 私有 selector。它能显著改善 non-activating panel 行为，但 Electron `WebContents` 在某些点击 / 输入路径下仍可能触发 app activation。若后续仍要求做到 Raycast 级别“点击输入也绝不切菜单栏”，下一阶段需要评估更深的 native host / NSPanel 承载方案。
- `orderFrontRegardless()` 负责可靠捞起 Todo，但它只管理窗口层级，不等同于完整替代系统 active app 机制。
