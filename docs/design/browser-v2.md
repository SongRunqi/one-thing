# Browser v2:从 iframe 预览到真正的浏览器

> 状态:设计定稿(经三路对抗评审:仓库事实核查 / Electron 39 平台断言核查 / 产品架构批判)。日期:2026-07-26。
> 涉及:apps/electron、packages/renderer、packages/shared、packages/onething-runtime(产品层 + app 装配层)、packages/core。

> **实现状态（2026-07-26，`experiment/castlabs-electron` 未提交）**：P0 骨架 + castlabs 换核（内嵌浏览器可登录 Google，见 `castlabs-migration.md`）已落地；**P2 元素拾取**（拾取模式 executeJavaScript 覆盖层 + 主进程 capturePage 截图 + 结构化附件 → composer → 引擎 `<attachment source_url>` 文本部件）已落地；**多 profile**（Chrome 式隔离登录，设置页「Browser」增删切，`persist:browser-<id>` 分区，default→旧分区兼容）已落地——虽在原设计里列为非目标，但换 castlabs 后成本降低、用户明确需要。**未做**：P1a/P1b 浏览器正确性/舒适性、P3 AI 操控 browser 工具、P4/P5 扩展。拾取实现走 `executeJavaScript` 而非独立 preload 构建（更轻、闭环一个 IPC 往返、不碰 CDP，符合"拾取路径不碰 CDP"）。

## 0. 一句话

把 Workbench 里的 iframe 假浏览器,升级为 **main 进程真源的 WebContentsView 多 tab 浏览器**,在其上生长三个能力:**元素拾取带入会话**(显式拾取模式 + 结构化附件)、**AI 直接操控**(browser 工具 + 进程内 CDP,内建 prompt-injection 防线)、**Chrome 扩展**(官方 loadExtension + MIT 的 web-store 安装链起步,GPL 的 electron-chrome-extensions 作为许可门后的第二层)。

## 1. 目标与非目标

**目标**

1. 成熟浏览器形态:任意站点可加载、多 tab、地址栏回写、导航控件、标题/favicon/加载态、OAuth 弹窗流可走通、页面崩溃恢复、HTML5 全屏、右键菜单、页内查找、下载、缩放、cookie 持久登录、tab 恢复。
2. 元素带进会话:显式拾取模式(devtools inspect 心智)选中页面元素 → 高亮 → 拖进/直投 composer,成为"元素截图 + 文本摘录 + 来源 URL"的结构化附件;选中文本/图片/链接的原生拖拽也接住。
3. AI 操控:模型侧新增 `browser` 工具,能看(AX 快照/截图)、能动(导航/点击/输入/滚动),操作对用户可见、可停止、走权限审批,且对页面内容的 prompt injection 有内建防线。
4. Chrome 扩展:能从 Chrome Web Store 安装解包扩展(内容脚本类/devtools 类先行),预留完整扩展 UI(action/popup/menus)的第二层。

**非目标(明确不做,堵住预期)**

- 独立浏览器窗口(弹出为单独 BrowserWindow)——形态收敛在 Workbench 右侧面板,弹窗后置。
- 书签、多 profile、同步、打印、Widevine DRM(Netflix/Spotify 网页播放必挂,stock Electron 无 CDM)。
- 跨域 iframe 内的元素拾取(session preload 只进主 frame;`nodeIntegrationInSubFrames` 是 experimental 且有安全前科,不开)。
- `evaluate(js)` 动作(AI 在用户登录态上执行任意 JS 的权限面比 bash 更大)。将来若加:主世界执行、独立 effect、进 `NEVER_GRANTABLE_TYPES`(`packages/core/permission/permission-grants.ts:14` 机制现成)、永远逐次 ask。
- apps/web 宿主的同能力对齐——web 端降级(见 §7)。
- 与 Chrome 扩展生态 100% 兼容(那是 Chromium fork 路线,见 §9)。

## 2. 现状事实(设计依据,已逐条核查)

- 现有"浏览器" = `RightWorkbenchPanel.vue` 里一个纯 `<iframe>` + 单行地址栏(`packages/renderer/components/workbench/RightWorkbenchPanel.vue:195`),tab 类型 `'browser'` 全局去重只允许一个;无导航控件、无回写、无持久化。
- **现有 CSP 已把这个 iframe 打死(静态可确认)**:`apps/electron/src/window/session-security.ts:57` 给 defaultSession **所有响应**注入 `frame-src 'none'`(注册点 `window/index.ts:446`),dev 下渲染页走 vite http 必中,Electron 内该 iframe 无法显示任何内容;web 宿主无此注入所以能用。新方案的 WebContentsView 是原生视图,不受页面 CSP 管辖,问题消解。
- 全仓零 webview/BrowserView/WebContentsView 使用;`webviewTag` 全窗未开;六窗共用 defaultSession,无自定义 partition。
- Electron **39.2.7**:`WebContentsView`、`ses.extensions.loadExtension`、`ses.registerPreloadScript`、`setWindowOpenHandler` 的 `createWindow` 覆盖(electron.d.ts:19362-19387)、MV3 service worker(≥35)全部就绪。
- 外链策略只装在主窗(`apps/electron/src/window/external-links.ts:23-26`,唯一调用点 `window/index.ts:478`),浏览器 view 是白纸,策略完全由本设计定义。
- 主窗已有崩溃恢复先例:`apps/electron/src/window/main-window-recovery.ts:132`(render-process-gone → reload)。
- 工具层:浏览器相关只有 `web_search`/`web_open`(HTTP 抓取);宿主能力经 `configure*Host` 端口注入(七个现成端口,`configureVoiceHost.runtimeWindow` 的 ensure/sendCommand 惰性形状是本设计端口的范本,`app/voice/host-ports.ts:30-37`)。
- 权限:工具 `analyze()` 自报 `ToolEffect[]` → `decidePermission`(read 直放、匹配持久 grant、否则 ask + channel affinity)。**新增 effect kind 的真实同步点**(评审纠错后):kind 枚举 + `isBarrierEffect` 在 `packages/core/tools/tool-effect.ts`;`titleForEffect` 在 `packages/core/permission/permission-policy.ts:131`;capability-registry **零改动**(isCapabilityCovered 只覆盖 read/file_* 系);另有两处易漏——`packages/core/agent-loop/tool-execution-order.ts:37` 的 `needsOrderedSideEffectGate` 按 toolName 硬编码副作用串行表(browser 写动作必须加入,否则与 bash/edit 副作用并发)、renderer 权限 UI(`ChatPanel.vue:472-482` canAllowWorkspace 的 scope 按钮语义 + `tool-display.ts:152` buildToolPermissionTitle 的 case)。
- grant 匹配器只支持前缀通配(`packages/core/permission/permission-grants.ts:100-108` matchWildcard 仅 `endsWith('*')` 的 startsWith),域名授权需要的后缀语义(`*.google.com`)表达不了 → §6 已定规则。
- 附件:`MessageAttachment`(`packages/shared/ipc/chat.ts:94-108`)→ `buildMessageContent`(`packages/core/engine/message-content.ts:176`)image 走 data-URL part(:199-210)、文本走 `<attachment>` XML(:160-162);vision 降级在 `packages/core/agent-loop/capabilities.ts:45-46`。拖拽进件口 `useFileDrop`(`useFileDrop.ts:11-15` 只认 "Files",自定义 MIME 今天会被静默忽略)+ `InputBox.handleIncomingFiles`(:1248);自定义 MIME 拖拽先例:发送端 `TabItem.vue:160`、接收端 `ChatWindow.vue:269`。
- 工具结果图片:`renderKind: 'image'` 枚举存在(`shared/ipc/tools.ts:80`),但 `ToolResultRenderer.vue:92-101` 只渲染路径文字不出图(P3 修)。
- 打包:`extraResources`/`asarUnpack` 机制现成。

## 3. 五个总体决策

### D1 容器 = WebContentsView(每 tab 一个)

- iframe 被目标站 X-Frame-Options + 自身 CSP 双重封死;`<webview>` tag 官方文档明确劝退;**WebContentsView** 是官方唯一演进方向,Min / electron-browser-shell / Deta Surf 现役代码均用它;直持 `webContents`,CDP、扩展、下载、右键、capturePage 全部一手掌握。
- 代价:原生视图永远压在窗口 HTML 之上 → 浮层遮挡(§8.2,P0 显式排期);bounds 显式同步(§8.1)。
- API 面已核查(39.2.7 d.ts):`View.setBounds/setVisible`、`addChildView(view, index?)`(重加已存在子 view = 提顶,z 序够用)、`webContents.capturePage(rect?, {stayHidden})`。bounds 单位是**整数 DIP(即 CSS px,无需乘 DPR)**,fractional-DPR 屏取整只为防接缝。

### D2 真源在 main:BrowserService

浏览器状态(tab 列表、活动 tab、每 tab 的 url/title/favicon/loading/canGoBack…)的**唯一真源在 main 进程** `apps/electron/src/browser/`(新 domain,`@onething/electron-host/browser/*`)。理由:WebContentsView 生命周期本在 main;AI 工具与 Chrome 扩展(chrome.tabs 宿主回调)都要读写同一份 tab 真源;与全仓"engine 真源在 main、renderer 镜像"格局一致。

- renderer 镜像:新 pinia `browser` store,**冷启动握手 = 先 `browser:hydrate` RPC 拉全量快照、再订阅增量**(事件带 seq 去重),防"面板恢复了、镜像空白"的漂移。
- **事件面收敛为单一 `browser:tabs-changed`**:载荷是 `{tabId → 变更字段 patch}` 的合并批,main 侧 ~30ms 节流聚合(思想同 `SessionStreamCoalescer` 的 16ms 合帧),renderer 单点 applyPatch。不长出十个零散 channel。

### D3 会话隔离:`persist:browser` partition

- `session.fromPartition('persist:browser')` → cookie/localStorage 持久,登录态跨重启;in-memory session 会被 loadExtension 拒绝,persist 分区合法(已核 d.ts)。
- **不注入**应用 CSP;镜像 proxy(`network/proxy.ts:29` 已支持传入 session);专属权限 handler(§P1b 提示条);下载接管 `ses.on('will-download')`(partition session 可挂,已核)。
- **UA 伪装(评审后加强)**:目标不是"删 Electron token"而是**伪装成与内置 Chromium 版本一致的完整 Chrome UA 串**;`ses.setUserAgent` 不影响已建 WebContents(d.ts:12894),**必须先于任何 view 创建**;预留 per-site UA 覆盖钩子(accounts.google.com 命中 "This browser or app may not be secure" 时切 Firefox UA,社区实证有效);Sec-CH-UA 客户端提示不随 setUserAgent 改(可传 userAgentData 品牌参数缓解),仍是可识别向量 → 进风险表。P0 验收加探针:**accounts.google.com 能走完登录**。

### D4 AI 操控 = `browser` 工具 + configureBrowserHost 端口 + 进程内 CDP

**工具形态**:单一 `browser` 工具,**schema 用 `z.discriminatedUnion('action', [...])` 逐动作声明必填字段并 `.strict()`**——错参在校验层就炸,不重蹈 zod strip 静默吞参数的覆辙(edit replaceAll 事故)。若 union 分支过多影响 schema 体积,拆 `browser`(读)+ `browser_act`(写)两工具,与 effect 分级同构。

- 读动作(read effect,免审批):`tabs`、`snapshot`、`screenshot`、`read_page`(正文抽取)。
- 写动作(effect kind `'browser'`,默认 ask、可持久 grant):`navigate`/`back`/`forward`/`reload`、`new_tab`/`close_tab`/`select_tab`、`click`、`type`(含 key 参数,吸收 press_key)、`scroll`、`wait_for`。
- 无 `evaluate`(非目标,§1)。

**多 tab 语义(评审后定死)**:`snapshot` 返回 `{ tabId, snapshotId, nodes }`;**所有元素级动作显式带 tabId**(`click(tabId, uid)`),driver 校验 uid 所属 snapshotId 与该 tab 当前导航代次,不符返回"请重新 snapshot"——杜绝"AI snapshot 了 A tab、用户切到 B、点击落错页"的竞态。active tab 只作读动作的省参默认。**焦点礼仪**:`new_tab` 默认 background(后续动作显式带 tabId,不依赖前台);`select_tab` 是显式写动作走审批;接管条显示"AI 在后台 tab 操作中"+ 一键跳转,切换权留给用户。

**实现通道**:`webContents.debugger.attach('1.3')` 进程内 CDP,不开调试端口:

- snapshot:Accessibility 域取 AX 树 → 过滤/编号(uid ↔ backendNodeId)。该域是 **experimental**(不在 1.3 稳定面),但 Electron debugger 不按协议版本门控、实践现役(VS Code 同法);用 `getFullAXTree` 的 depth 参数控体积;随 Chromium 升级可能漂移 → 风险表。
- click/type:`Input.dispatchMouseEvent/dispatchKeyEvent`——坐标系是**目标 webContents 视口内 CSS px**(与 preload getBoundingClientRect 同系,免 DPR/窗口偏移换算),与 backendNodeId/坐标闭环、语义完整。
- **attach 生命周期(反爬考量)**:仅在一次工具调用的动作序列内 attach,结束即 detach;拾取与普通浏览路径完全不碰 CDP;尽量避开 `Runtime.enable`(Cloudflare/DataDome 的头号 CDP 检测面);遇验证码/人机检查返回明确结果交还用户,不自动重试。
- **DevTools 共存三态处理**:try/catch 包 attach + 监听 `detach` 事件(带 reason)上报模型 + 每动作前 `isAttached()` 校验;文案是"可能失败或行为异常,建议关闭该页 DevTools",不承诺必然报错(近代 Electron 实测可共存但互相干扰,#34260)。
- OOPIF 是已知边界:v1 快照对跨域 iframe 输出占位节点 `[cross-origin iframe: <url>]`,不无声缺失;逐 frame attach 合并列为后续演进。

**注入路径(评审后修正,不触产品层红线)**:端口接口类型 `BrowserHostPort` 定义在**产品层** `packages/onething-runtime/src/browser/ports.ts`(产品层禁 import `@onething/app`,类型也算 import 边);产品层导出工厂 `createBrowserTool(getPort: () => BrowserHostPort | null)`;装配层 `app/browser/host-ports.ts` 持有 configure/get 晚绑定单例(`configureBrowserHost`),`app/tools/builtin/index.ts` 在 barrel 里**端口已配置才注册**,并对"Electron 宿主但端口缺席"打 warn 防静默。时点约束:Electron 的 configure*Host 在 `startOnethingElectronMain()` 同步接线(`main-process.ts:283-308`),先于 backend boot 的 registry 初始化,时序成立;**端口对象须全惰性**(接线时窗口尚不存在,首次调用才 ensure,照 voice runtimeWindow 范本)。server(`runtime.ts` 用 'full' 档)永不接线 → 自动跳过,桌面平权不破。

**可见与可停**:工具执行期间浏览器面板顶部"AI 正在操控"接管条(消费既有 `tool:execution-start/end` 事件),**常显当前动作的目标域名**(给用户肉眼核对);动作前 CDP Overlay 高亮目标元素;停止 = 既有回合 abort。无人值守回合策略自动继承(ask 即拒 / 120s 超时拒)。

### D5 Chrome 扩展分两层,中间隔一道许可门

- **Layer 1(P4,零许可负担)**:官方 `ses.extensions.loadExtension(path)`,每次启动对 `persist:browser` 重放(官方明文要求;不支持 .crx 直装)。来源:解包目录 `<store>/browser/extensions/<dirName>/` + **`electron-chrome-web-store`(已核:MIT、deps 零依赖 GPL 包、README 明示可独立用)**做商店安装/自动更新——注意其要求打包携带自身 preload 脚本。官方 API 面:内容脚本、`chrome.runtime/storage(local)/scripting/webRequest/devtools` → 油猴类、uBlock(MV2)、devtools 扩展可望运行;**没有** action 图标/popup/contextMenus/cookies。管理 UI:设置页最简列表(启停/移除/打开目录)。
- **Layer 2(P5,许可门后)**:`electron-chrome-extensions` 补齐 browserAction 工具栏 + popup + contextMenus + cookies + notifications + windows。**硬门槛:GPL-3 / 付费商业双许可**(已核 LICENSE.md),0neThing 闭源分发须先解决;次风险:最后提交 2025-07-02,约一年未更新,采用即预算 fork 维护。不过门则 Layer 1 终态。

## 4. 架构图

```
┌─ Renderer(packages/renderer)────────────────────────────────────────┐
│ Workbench BrowserPanel(重写 browser tab;iframe 实现保留给 web 宿主) │
│   tab strip │ 地址栏/导航钮 │ 查找条 │ 下载条 │ AI 接管条 │ 权限提示  │
│   内容区 = 占位 <div>(真内容是 WebContentsView 覆盖其上)            │
│   stores/browser.ts(镜像:hydrate 拉全量 → tabs-changed patch 订阅) │
│   stores/overlay-presence.ts(模态浮层登记 → set-obscured 单点信号)  │
│   useWebReferenceDrop(接 x-onething-web-element → composer)         │
└──────┬─ platformApi.browser.*(命令) ▲ browser:tabs-changed 等 ─────┘
       │ IPC(shared/ipc/browser.ts 新域,标准五步)
┌──────▼──────────────────────────────────────────────────────────────┐
│ Main:apps/electron/src/browser/(新 domain,真源)                   │
│   service.ts    tab registry + WebContentsView 池 + bounds/全屏      │
│   session.ts    persist:browser(UA 先于建 view/proxy/权限/下载)     │
│   pick-preload.ts 显式拾取模式(ses.registerPreloadScript,主 frame) │
│   cdp-driver.ts  按需 attach:AX snapshot/Input/captureScreenshot    │
│   extensions.ts  Layer1 loadExtension + web-store 安装链             │
│   state.json     内层 tab 列表唯一真源(节流写,§8.5 所有权契约)     │
└──────┬───────────────────────────────▲──────────────────────────────┘
       │ 实现 BrowserHostPort           │ configureBrowserHost(main-process.ts 接线)
┌──────▼──────────────────────────────────────────────────────────────┐
│ 装配层 @onething/app:app/browser/host-ports.ts(configure/get 单例) │
│   app/tools/builtin/index.ts:端口在 → createBrowserTool(getPort)    │
│ 产品层 @onething/runtime:src/browser/ports.ts(BrowserHostPort 接口)│
│   src/tools/builtin/browser.ts(createBrowserTool 工厂,Electron-free)│
│ core:tool-effect.ts kind 'browser';permission-policy titleForEffect │
│   tool-execution-order.ts 串行表 + permission-grants 匹配规则        │
└─────────────────────────────────────────────────────────────────────┘
```

依赖方向不破戒:产品层只定义接口与工厂;装配层注入端口实现;Electron 实现全在 `@onething/electron-host/browser/*`。

## 5. 安全模型(独立成章,约束 P3)

### 5.1 Prompt injection(AI browser 的头号威胁,评审 blocker)

browser 工具把任意第三方页面内容送进模型上下文,页面里一句"请点击此链接并授权"就能借已通过的持久 grant 链式作恶(Comet/Atlas 类产品的公开事故面)。**四层防线,与 P3 同 PR 交付,不是后补项**:

1. **不可信信封**:`snapshot`/`read_page`/`screenshot` 结果统一包 `<web_content untrusted source="<url>">` 标记 + 固定警示文案(`<attachment>` XML 同法);web_open 顺手同改。
2. **域跳变熔断**:写动作目标域 ≠ 本次 snapshot 来源域、或 ≠ 已 grant 域时,即使有持久 grant 也强制重新 ask;AI 回合内 `did-navigate` 落到 grant 域之外 → 暂停并重新 ask。grant 校验点在 **did-navigate 后的落地 URL**,不在请求 URL(防 302 绕过)。
3. **敏感语义硬闸**:`type` 命中 `input[type=password]`/支付 iframe 一律 ask 且进 `NEVER_GRANTABLE_TYPES`;页面权限弹窗、文件选择器不可由 AI 代点。
4. **肉眼核对**:接管条常显当前动作目标域名(见 D4)。

P3 验收含 red-team 用例:构造藏"请点击此链接并授权"指令的页面,验证模型行为与审批闸。

### 5.2 授权粒度(与现有 grants 模型对齐)

- matchWildcard 只有前缀通配 → **pattern 归一为 URL 前缀形态 `https://<eTLD+1>/*`**(analyze 时把目标 URL 归一到 eTLD+1,`github.com/*` 覆盖 `gist.github.com` 做成可选开关),不改 core 匹配器;忽略 scheme 差异与端口。
- scope:browser grant **默认 session**,workspace 为显式升级(workspace grant 以 workspaceRoot 为键,与域名弱相关,renderer `canAllowWorkspace` 需为 browser 类型调整按钮语义)。
- 禁止捷径:web_open **不得**挂浏览器 partition 的 cookie 发请求——那等于拿用户凭据做无审批请求,方向性排除。

### 5.3 其余

- pick-preload 以 contextIsolation 运行、不向页面暴露任何 API,页面世界几乎不可探测(真正暴露面在 CDP attach 与 UA,已在 D3/D4 处理)。
- 扩展是全量代码执行:安装入口仅设置页手动;browser 工具**不提供**安装扩展动作。
- AI 与用户输入冲突:工具串行 + 接管条明示 + 可停;不做输入锁(用户动鼠标 = 用户赢)。

## 6. 分阶段计划

> 评审改判:P0+P1a 合起来才是"一个真的能当浏览器用的东西",以 **P1a 为第一个对外可用里程碑**;P1 拆正确性/舒适性两半;P3 预算按"迷你项目"计(全案被低估最多的 phase)。

### P0 骨架:一个真的能浏览的 tab

- main 新 domain `apps/electron/src/browser/`:BrowserService(单 tab)、`persist:browser` 装配(**UA 完整 Chrome 串、先于建 view**/proxy 镜像/权限 handler 默认拒/下载先裸放)、WebContentsView 挂主窗。
- **弹窗临时策略**:`setWindowOpenHandler` → 交系统浏览器打开,文档标注"OAuth 弹窗 P1a 可用"(不做"当前 tab 导航"——会摧毁 opener 链与页面状态)。
- bounds 同步(§8.1):占位 div ResizeObserver + Splitter 现成 resize 事件 → 节流 IPC → setBounds;开合过渡期截图占位。
- **HTML5 全屏**:`enter/leave-html-full-screen` → setBounds 铺满窗口内容区 + 隐藏面板 chrome,Esc 还原(YouTube 验收的隐含依赖)。
- **崩溃恢复**:`render-process-gone` → tab 内错误页 + 重载按钮,连续崩溃退避(先例 main-window-recovery.ts:132);与加载失败错误页共用组件。
- **浮层遮挡骨架(§8.2)**:overlay-presence store + 模态浮层接线,P0 显式排期(全应用横切成本,不再是无主工作)。
- IPC 新域 `browser`(五步)+ renderer BrowserPanel 替换 iframe(iframe 保留给 web 宿主;`App.container-layout.test.ts:240` 的 `<iframe` 断言或可不动,:224 与 `RightWorkbenchPanel.test.ts:148` 按需更新)。
- 地址栏回写、前进/后退/刷新/停止、loading/title/favicon。
- 验收:任意站点可用;**accounts.google.com 能走完登录**(UA 伪装探针);YouTube 可看含全屏;kill 掉 tab 渲染进程出现崩溃页可重载;重启后 cookie 还在。

### P1a 浏览器正确性

- 多 tab:tab strip UI + view 池(惰性创建、后台 `setVisible(false)`;注意主窗 renderer 已设 `backgroundThrottling:false`,同窗任一 webContents 关节流则**整窗**停节流,后台 tab 省电假设已虚,备注即可)。
- **弹窗收编**:`setWindowOpenHandler` 返回 `{ action: 'allow', createWindow: (opts) => BrowserService 建 popup-tab 并返回其 webContents }`,保住 window.opener/postMessage 链;普通 `target=_blank` 开后台 tab。**验收:一个 popup 模式的 Google/GitHub OAuth 登录闭环。**
- **beforeunload**:监听 `will-prevent-unload` → 原生确认框(离开/留下);AI 的 close_tab 遇拦截返回"页面阻止关闭,需用户确认"而非静默失败;app 退出路径统一处理,防一个后台 tab 卡死整个应用退出。
- 快捷键:Cmd+L/T/W/R(面板聚焦时)。

### P1b 浏览器舒适性

- 右键菜单(自画):后退/前进/刷新、复制链接/图片、图片另存、检查元素、"发送到会话"(P2 入口之一)、tab 静音。
- 页内查找(findInPage + 查找条)、缩放(Cmd±,per-tab 记忆)、下载条(will-download → 进度/取消/打开所在目录)。
- **权限提示条(评审提为必做)**:被拒时地址栏尾部亮图标,点击列出本页被拒项、可单次放行(仅 media 与 clipboard-read,逐域记忆存 state.json;通知/地理死拒)。
- 证书错误专用错误页(域名+错误码+开发者向"仍要继续(仅本次)");HTTP Basic Auth(`app.on('login')` → 认证框,内网面板刚需)。
- 音频指示:`media-started-playing`/`-paused` + `isCurrentlyAudible` → tab 喇叭图标,点击 `setAudioMuted`。
- tab 持久化与恢复(§8.5 所有权契约);Cmd+F 等剩余快捷键。
- 验收:日常当浏览器用一天不想切回 Chrome。

### P2 元素拾取 → 带入会话

- **主路径 = 显式拾取模式**(评审改判,350ms hold/Alt 系冲突面太大):浏览器工具栏"拾取"钮 或 面板聚焦时 Cmd+Shift+C 进入 → 悬停高亮(inspector 风格框 + tag/尺寸角标)→ **单击选定即直投 composer**(不依赖跨 view 拖拽,是主兜底)→ Esc 退出。粒度:默认命中提升到"最近的有意义容器"(a/button/li/article/figure/有边界框且面积 ≥ 悬停元素 2 倍的祖先),滚轮/↑↓ 沿祖先链升降。长按 hold 手势降级为默认关的实验开关。
- 拖拽增强:拾取态 dragstart `setData('application/x-onething-web-element', JSON{url,title,selector,text≤2k,rect})` + `text/plain` 兜底;原生拖拽(选中文本/图片/链接)同样补挂自定义 MIME。跨 view DnD 无权威结论(webview 时代的反例不可类推,机制推理倾向可行)→ 真机实证,失败不伤主路径;实证时用 `dataTransfer.types` 判别(drop 前 getData 拿不到值属正常)。
- pick-preload 经 `ses.registerPreloadScript({type:'frame', filePath:绝对路径})` 注入,**只进主 frame**(能力边界写明:iframe 内容不拾取,不算 bug)。
- renderer 接收:`useWebReferenceDrop`(与 useFileDrop 并列挂 InputBox);`installGlobalFileDropGuard` 同步扩展 uri-list/自定义 MIME 的防导航兜底。
- **元素截图(评审修正)**:从简——capture 前 `scrollIntoView({block:'nearest'})`,rect 与视口求交,被截断时 excerpt 加注"截图为可见部分";整页拼接非目标;P3 上 CDP 后统一升级为 `Page.captureScreenshot` clip + `captureBeyondViewport:true` 一条路径(演进路径写死在此)。
- 数据模型:`MessageAttachment` 加 `sourceUrl?/sourceTitle?/excerpt?`;引擎 `buildMessageContent` → image part + `<attachment source_url title>excerpt</attachment>`;**无 vision 模型时 composer chip 标注"当前模型看不到图,仅发送文字摘录"**(查 model-capability 台账)。
- 验收:拾取任意网页卡片直投/拖入输入框,发送后模型看到截图+文本+URL。

### P3 AI 操控:browser 工具(预算按迷你项目计)

- core:effect kind `'browser'`(enum+isBarrierEffect)、`titleForEffect`(permission-policy.ts)、`needsOrderedSideEffectGate` 加 browser 写动作、grants 规则(§5.2)。
- 产品层:`src/browser/ports.ts` 接口 + `src/tools/builtin/browser.ts` 工厂(discriminatedUnion schema、analyze 按动作分 read/'browser' effect + eTLD+1 metadata)。
- 装配层:`app/browser/host-ports.ts` + barrel 条件注册(warn 防静默)。
- Electron:`cdp-driver.ts`(按需 attach/detach、AX snapshot + depth 控体积、Input 域、captureScreenshot、OOPIF 占位节点、detach 三态、Overlay 高亮)。
- **§5.1 四层注入防线同 PR**;renderer 权限 UI 两处 case;接管条;`ToolResultRenderer.vue` 补 image 真渲染(修既有缺口);screenshot 在非 vision 会话返回引导错误"当前模型不支持视觉,请改用 snapshot"。
- 工具互引导(机械,不靠文档):web_open 检测到登录墙特征(401/403/标题 sign in)时结果尾注"浏览器面板已打开该站可用 browser 读取登录内容";browser description 首句"用户浏览器面板内的真实页面,含登录态";variable contextUpdate 尾注注入"用户当前正在浏览 <url>"。
- 验收:"打开 HN 找今天最热的帖子并总结评论"全程可见、审批一次、可中断;red-team 注入用例通过。

### P4 扩展 Layer 1

- **第一天先做 spike:真机验证 MV2 uBlock 在 Electron 39(Chromium 142,Chrome 已弃 MV2)能否加载**;失败则验收改为内容脚本类扩展 + 把"MV2 存续"记入风险表(uBlock Lite 依赖的 declarativeNetRequest 官方不支持,同样要验)。
- `extensions.ts` 启动扫描重放 loadExtension(失败降级+日志);`electron-chrome-web-store` 接入(含其 preload 打包要求);设置页最简列表。
- 验收:装一个内容脚本扩展注入生效;广告屏蔽按 spike 结果定。

### P5 扩展 Layer 2(许可门,默认不进)

- 决策输入:GPL/商业许可谈判 + 停更接盘评估。过门:ElectronChromeExtensions 接 BrowserService tab 回调、`<browser-action-list>` 工具栏、popup、contextMenus 桥接自画菜单。不过门:Layer 1 终态,文档注明边界。

P2 与 P3 无相互依赖可并行;cdp-driver 的截图路径先于两者更优。

## 7. 双宿主降级(apps/web)

- `platformApi.capabilities` 加 `embeddedBrowser: boolean`,照 shellTools 模式,四处同步:`renderer/platform/types.ts:6-14`、`electron.ts`、`web.ts:131-142`(normalize)、server `runtime.ts:702` + `http.ts:119`。
- web 宿主 browser tab 保留现 iframe(本地 dev server 预览的原始用途),隐藏拾取/扩展/AI 入口。
- server 无端口 → browser 工具不注册,模型自然不见。

## 8. 关键技术细节

### 8.1 bounds 同步与开合过渡

- 占位 div ResizeObserver + Splitter 现成事件(`Splitter.vue:99-101` resize-start/resize/resize-end,`App.vue:116-117` 已接;`SplitterPanel @update:size` `App.vue:185`)→ rAF 节流 IPC → `setBounds`(整数 DIP)。拖宽期间 SplitterPanel `transition:none`(:144-146),链路无动画干扰。
- **开合动画的真身是 SplitterPanel 的 flex-grow/flex-basis 0.16s 过渡**(`SplitterPanel.vue:139-142`;`.workbench-slide` 只是宽度冻结包装,`App.vue:1018-1022`,另有 `.is-collapsed` visibility 0.2s 延迟——实现期统一两处时长)。过渡期截图占位:起点信号 = `workbenchRevealed` watcher(`App.vue:485-496`),终点 = panel 元素 `transitionend(flex-basis)`;期间 `capturePage()` 贴占位 + `setVisible(false)`,结束 setBounds+setVisible(true)。
- 隐藏 tab 截图需 `capturePage(rect, {stayHidden:true})`(capturer 会把隐藏页面当可见)。
- 窗口 resize/系统全屏沿同链路;HTML5 全屏见 P0。

### 8.2 浮层遮挡(评审修正版)

- **不构成遮挡**:搜索(Search Everywhere)与设置都是独立 BrowserWindow(`App.vue:207` 注释、`App.vue:3`),天然压在 view 上。
- **模态类(显式接 obscured 信号)**:ImagePreview(`common/ImagePreview.vue:2` Teleport body 全屏)、agent-dialog-overlay(`App.vue:1115`)、EvalsWorkbench(`App.vue:215`)、sidebar-floating-backdrop(`App.vue:1087`)、composer Dock/Flyout。
- **悬浮类(默认豁免或矩形相交判定)**:Tooltip(`Tooltip.vue:9`)、Select 下拉(`Select.vue:158`)、ModelSelector/AgentSelector/ThinkToggle popover、SessionContextMenu——全部 Teleport 直挂 body、高频挂卸,接 MutationObserver 会把浏览器打成随 tooltip 闪断。
- 机制:新 `overlay-presence` store(或 useOverlayPresence),模态浮层 mounted/unmounted 登记矩形,单点发 `browser:set-obscured` → `setVisible(false)` + 截图占位(复用 8.1);MutationObserver 仅作兜底且过滤悬浮类。

### 8.3 AX snapshot 格式

- AX 树 → 过滤不可见/装饰节点 → `uid`(含 tab 命名空间与 snapshotId)→ 缩进文本(role name value + uid),尺寸上限(~30k chars)+ depth 参数 + 截断提示;OOPIF 输出占位节点。
- 与 web_open 分工靠 §P3 的机械互引导,不靠文档。

### 8.4 IPC 与状态同步

- 命令:`platformApi.browser.*`(navigate/newTab/closeTab/select/find/zoom/pick…)。
- 事件:单一 `browser:tabs-changed` 合并批(D2);hydrate 拉-后-订协议。

### 8.5 持久化所有权契约

- 内层 tab 列表唯一真源 = BrowserService `state.json`(节流写);workbench/workspace 层只记"browser 面板是否可见"一个布尔;**关面板 = 休眠**(view 销毁、state.json 保留),重开 = 惰性恢复(恢复 URL/标题,选中才加载);state.json 只在用户逐个关 tab 时收缩。renderer browser store 是镜像,不落盘。

## 9. 风险清单

| # | 风险 | 应对 |
| - | --- | --- |
| 1 | Prompt injection 借持久 grant 链式作恶 | §5.1 四层防线,P3 同 PR;red-team 验收 |
| 2 | WebContentsView 浮层遮挡串全应用 UI | §8.2 分类接线,P0 显式排期;最坏浮层期闪断可接受 |
| 3 | 跨 view DnD 未实证 | 拾取模式单击直投为主路径,拖拽仅是增强 |
| 4 | UA/自动化被站点识别(disallowed_useragent、Sec-CH-UA、Runtime.enable) | 完整 Chrome UA + 先于建 view;per-site 覆盖钩子;CDP 按需 attach、避 Runtime.enable;验证码交还用户;逃生口"在系统浏览器打开" |
| 5 | electron-chrome-extensions GPL/停更 | 分层设计,Layer 1 零 GPL;Layer 2 过许可门才进 |
| 6 | MV2 已被 Chrome 废弃,Electron 存续无承诺;declarativeNetRequest 官方不支持 | P4 第一天 spike 定验收;广告屏蔽能力不做承诺 |
| 7 | debugger 与 DevTools 互相干扰 | 三态处理(D4);不自动关用户 DevTools |
| 8 | Accessibility CDP 域 experimental | 实践现役(VS Code);随 Chromium 升级回归测试 |
| 9 | AX 树超大页面爆上下文 | depth + 尺寸上限 + 视口优先过滤 + 截断提示 |
| 10 | effect kind 波及面 | §2 列出的五处同步点一次 PR 闭环 |
| 11 | 条件注册是新模式(偏离"每调用查端口"约定) | 接线早于 boot 的时点约束 + 缺席 warn + 端口全惰性(D4) |

## 10. 登记与守门清单(实现期逐项过)

- `onething.aliases.ts`:`@onething/electron-host/browser/*` per-file 条目;runtime 新子路径(`src/browser/*`、工具)登记(注意 vitest 一份易漏);`@onething/app` 前缀整入口免登记。
- IPC 五步:channels.ts / `shared/ipc/browser.ts` / `@main` handler / preload bridge / platformApi web 降级;capabilities 四处(§7)。
- 三档 barrel:browser 工具只进 full 且端口在才注册;headless/readonly 不进。
- core 五处:tool-effect enum+isBarrier / permission-policy titleForEffect / tool-execution-order 串行表 / grants 规则(如动 matchWildcard 补测试)/ NEVER_GRANTABLE(敏感字段)。
- renderer 权限 UI:ChatPanel canAllowWorkspace 语义 + tool-display buildToolPermissionTitle case。
- boundary checker 与 `architecture-boundaries.test.ts`:产品层零 electron/app import;`app/browser/host-ports.ts` 过 import-side-effect-free 测试。
- 既有测试:`App.container-layout.test.ts:224`(:240 iframe 断言或可保留)、`RightWorkbenchPanel.test.ts:148`;新增 BrowserService、cdp-driver(mock webContents)、附件 buildMessageContent、工具 analyze/schema 单测。

---

## 11. UI/UX 设计

> 原则:一个内置浏览器一半是看它的 UI。这里不套通用 Chrome 皮,而是让浏览器 chrome 长在 onething 既有的**画线风/账页风**里——没有卡片,只有纸(paper)、框线(frame)、发丝分隔线(hairline)、登记行(row)、朱砂描线(ink accent)。可交互稿:`docs/design/browser-v2/mockup.html`。

### 11.0 视觉宪法(五条配方常量,全 chrome 统一)

画线风的真身不是几个类,而是几条反复内联的 `color-mix` 常量(survey 从 composer/权限栏/ledger-card 交叉比对得出)。浏览器 chrome 一切边界都从这五条派生,**禁写死 hex、禁直引 `--border-*` 具体值**:

1. **外框** = `1px solid color-mix(in srgb, var(--ui-border-strong-border) 52%, transparent)`(composer `InputBox.vue:1990`、权限栏 `ChatPanel.vue:69`、`.ledger-card`)。
2. **内部分隔** = `... --ui-border-strong-border 30%, transparent`(格与格之间)。
3. **竖刻(tick)** = `width:1px; height:14px; background:... 85%, transparent`(分隔按钮组/tab 组,TabBar `header-tick`)。
4. **发丝线(hairline)** = `... --ui-border-default-border 55%, transparent`(`.ledger-row` 行底、`.ledger-rule`)。
5. **基线点描三态** = 元素 `::after` `border-bottom:1.5px dotted transparent` → hover `color-mix(--ui-text-muted-fg 75%)` → active `solid var(--ui-accent-primary-fg)`(朱砂实线)。**tab 与工具钮的选中语法靠这个,不靠底色胶囊**(墨签 `TabItem.vue`、`.header-btn::after`)。

其余落地约束:圆角一律 `--radius-xs`(4px),菜单/pill 才 8–10px,账页区不用胶囊圆角;文本走 `--ui-text-*` 四级,URL/技术字符串用 `--font-mono`(权限栏 `.permission-value` 先例);radius/间距/字体是主题无关的静态 `:root` token,可硬编码 `--radius-xs`/`--space-2`,颜色必走 token;唯一签名阴影 `--shadow-paper`(`4px 4px 0` 硬偏移零模糊)**light 主题未定义**,浅色下要纸影须补定义或改 `--shadow-sm`。

### 11.1 布局:面板内三层堆叠

浏览器活在右侧 Workbench 的 `browser` tab 内(地基已存在,现是 iframe 占位)。自上而下三层:

```
┌─ chrome bar 区(DOM,画线风)───────────────────────────────┐
│ ① Tab strip 行  [墨签tab][墨签tab*][+]          ⋯ 溢出菜单 │  ← 复用 TabBar 弹性/拖窗纪律
│ ─────────────────────────────── hairline ───────────────── │
│ ② 导航 + omnibox 行                                        │
│   [←][→][⟳]   [🔒 example.com/path      ]   [拾取][🔊][⤓]  │  ← 地址栏 = FilterSearchInput 骨架改画线风
├─ 视口区(占位 div,真内容是 WebContentsView 覆盖其上)──────┤
│                                                            │
│   ⌞  原生视图区域,DOM 只留占位 div + ResizeObserver 上报  ⌟ │  ← 折叠/拖宽/切 tab 时 setVisible 协调
│                                                            │
├─ 浮层区(按需 Teleport-to-body,与原生视图让位协调)────────┤
│   查找条 / 下载条 / AI 接管条 / 权限 popover / 右键菜单     │
└────────────────────────────────────────────────────────────┘
```

**核心难点写死**:WebContentsView 在 z 轴之上盖住一切 DOM,所以查找条/下载条/接管条/权限 popover/右键菜单**都必须 Teleport-to-body 且同时让主进程对原生 view `setVisible(false)` 或让出相交区域**——这与 §8.2 的 overlay-presence 信号是同一套机制。chrome bar 本身在原生 view 的 bounds 之外(view 只贴视口占位 div 的矩形),所以顶部两行 DOM 不受遮挡。

### 11.2 组件"造 vs 复用"判断表

survey 结论:**tab strip、右键菜单、权限面板、错误/加载/空态几乎全是现成积木,真正新造的只有原生视口与拾取高亮**。

| chrome 部件 | 判断 | 复用点 / 配方 |
| --- | --- | --- |
| Tab strip 多标签 | **复用** | `Tabs`/`TabPane`(Workbench 已用,`addable/closable/#label(favicon)/lazy`)+ 抄 `TabItem` 墨签 CSS(active 朱砂下划线、冷 tab 虚描图标);弹性溢出/拖窗照 `TabBar.vue` |
| 新建 "+" / 导航钮(←→⟳■) | **复用** | `Button unstyled` + lucide(`ArrowLeft/ArrowRight/RotateCw/Square`);`.header-btn` 点描基线句法;reload→loading 时 accent spinner |
| 地址栏 omnibox | **半造** | `FilterSearchInput.vue` 骨架,框换 52% strong 配方 + `radius-xs` + focus 1px accent 环(对齐 composer,非 8px 圆角);URL 文本 `--font-mono`;左 `Lock/Globe` icon;意图 chip(http/搜索)照 `SearchWindow.vue:97` 的 `color-mix(accent 14%)` |
| 查找条 find-in-page | **半造** | 悬浮壳 = composer 浮层皮 `--ui-composer-overlay-{bg,border,shadow}` + backdrop-blur + `radius-xs`;内芯 = FilterSearchInput;计数 `2/8` mono `tabular-nums`;上/下钮 `.header-btn` |
| 下载条 | **复用** | `.ledger-row`(文件名 primary + 大小/进度 `.ledger-figure` 右对齐 + 行底 hairline)或 ModelSelector flyout 骨;空态 `.ledger-empty` |
| 右键菜单 | **复用** | `SessionContextMenu.vue` 原样(Teleport fixed x/y + backdrop 点外即关 + `.context-item/.danger`);嵌套项用 `Menu/SubMenu` |
| 权限提示 | **复用** | `session-permission-panel`(`ChatPanel.vue:68-233`)——mono `KEY│value` 账页网格,scope 切换 aria-pressed→success 底,allow/reject 全宽格钮;浏览器权限(摄像头/位置/通知)换文案即可 |
| AI 接管条 | **半造** | 条身 = composer 浮层皮;名牌 = `.composer-frame-label` mono 大写 tracked,接管中着 `--ui-accent-primary-fg`(照 `.transcribing` 态);底 `color-mix(accent 14%)`;停止钮 danger 态照 close-btn;可嵌 `AgentSelector` |
| 拾取高亮 | **造**(注入原生 view) | 高亮框 `box-shadow:0 0 0 1px var(--ui-accent-primary-fg)` + 填充 `color-mix(accent 14%, transparent)`(对齐 `--bg-selected`);元素名牌 = `.ledger-label` mono 贴 accent 底;渲染层只做拾取模式开关钮(`Crosshair`)+ 结果预览 `ImagePreview` |
| 加载/错误/崩溃/空态 | **复用** | 加载 `LoadingSpinner`(环形);错误/崩溃 `ErrorNote`(2px 左墨线,`block`,`#actions` 放重载钮);new-tab 空态照 workbench 账页编号行 `empty-root`(`--ledger-label-*`,**非**节日主题的 chat EmptyState) |

图标全部现成(`lucide-vue-next`,已验证存在),无需新增资产。

### 11.3 关键状态的视觉口吻

- **加载**:reload 钮变 accent 环形 spinner;地址栏左 icon 由 `Lock`(https)/`Globe`(http)切换;顶部可选 1px accent 进度描线(不做填充进度条)。
- **页面加载失败 / 证书错误**:视口内 `ErrorNote block`——2px 左墨线 + 域名 + 错误码 + `#actions`(证书页给"仍要继续(仅本次)")。
- **渲染进程崩溃**:同 `ErrorNote` 组件,legend "页面已崩溃" + 重载钮;连续崩溃退避文案。
- **HTML5 全屏**:chrome bar 与浮层全部隐藏,原生 view setBounds 铺满窗口内容区,Esc 还原(P0)。
- **被浮层遮挡**:模态浮层(ImagePreview/agent dialog/composer flyout)登记矩形 → 原生 view 截图占位 + `setVisible(false)`,浮层关闭还原(§8.2)。
- **AI 接管中**:接管条常显 `🤖 AI 操控中 · <目标域名>` + 当前动作(如"正在填写 email 字段")+ 停止钮;每个写动作前原生 view 内 Overlay 高亮目标元素(朱砂描框)。

### 11.4 frameless 与拖拽纪律

chrome bar 顶栏若压在窗口标题栏,照 `TabBar.vue`:整条 `-webkit-app-region: drag` 打底,每个可点控件各自 `no-drag`;`app-region` 只算 content box,**零面积 no-drag slot 要 `align-self: stretch` 撑满行高**否则塌成 0 面积挖不掉 drag(TabBar 血泪注释)。

---

## 12. 端到端:AI 在登录态浏览器代办任务(以"填表并提交"为例)

> 场景:你已在内置浏览器登录某站,让 AI"帮我在这个页面填好报名表并提交"。下面每一步标注**谁在做**与**安全闸**。人类只负责登录与敏感字段,AI 负责其余操作,全程可见可停。

```
[你] ① 在 browser 面板登录目标站(账号/密码你亲手输)
        └─ 安全闸:AI 的 type 永远无法碰 input[type=password](硬闸, NEVER_GRANTABLE)
                  登录态存于 persist:browser,后续跨重启有效

[你] ② 对话:"帮我把这个页面的报名表填好并提交"(可先 @ 引用该页,或 AI 读 active tab)

[AI] ③ browser.snapshot(tabId=active)
        ├─ CDP 按需 attach → Accessibility.getFullAXTree → 编号 uid + snapshotId + 导航代次
        ├─ 返回体包 <web_content untrusted source="example.com"> 信封(注入防线①)
        └─ 安全闸:read effect 免审批;AX 树带 depth 上限防爆上下文

[AI] ④ 首个写动作 → 权限审批(一次)
        ├─ effect kind 'browser',目标域 example.com
        ├─ 你在权限账页栏批准:once / 本会话 example.com / (workspace 需显式升级)
        └─ 安全闸:grant 粒度 = https://<eTLD+1>/*;approve 后同域写动作不再逐次问

[AI] ⑤ 逐字段填写:browser.type(tabId, uid, "张三") / click(tabId, uid) …
        ├─ 每动作前:接管条显示"正在填写 <字段>"+ 原生 view 内朱砂高亮该元素
        ├─ CDP Input.dispatch* 在目标视口 CSS 像素坐标操作
        ├─ 安全闸A:命中 password/支付 iframe 字段 → 直接拒绝并交还你(硬闸)
        ├─ 安全闸B:snapshotId/导航代次不符(你中途切了 tab 或页面跳转)→ 返回"请重新 snapshot"
        └─ 你随时可点接管条"停止"= 回合 abort

[AI] ⑥ 提交前的高风险动作(点"提交/支付/删除"类按钮)
        ├─ 若提交导致域跳变到 grant 域之外 → did-navigate 熔断,暂停并重新 ask(注入防线②)
        └─ 建议:提交类动作即使已 grant 也二次确认(与 goal 二次确认同源心智)

[AI] ⑦ 提交后 browser.snapshot / screenshot 回读结果
        ├─ screenshot 结果:vision 模型出图;非 vision 模型返回"请改用 snapshot"引导(不静默送废图)
        └─ AI 向你汇报"已提交,页面显示提交成功"

[全程] 接管条常显目标域名供你肉眼核对(注入防线③);无人值守回合下 AI 的 ask 即拒/120s 超时拒
```

**人在环上的三个锚点**:登录(你)、首个写动作审批(你批一次)、提交类高风险动作(建议二次确认)。**AI 永远碰不到的**:密码框、支付字段、页面自身的权限弹窗与文件选择器。**注入防线四层**(§5.1)在这条链路上分别落在 ③(不可信信封)、⑥(域跳变熔断)、全程(接管条显域名)、⑤(敏感字段硬闸)。

这条链路复用的现成件:权限账页栏(`ChatPanel.vue:68-233`)、`tool:execution-*` 事件驱动的接管条、`variable contextUpdate` 尾注"你正在浏览 <url>"引导模型选 browser 而非 web_open、goal 式二次确认。
