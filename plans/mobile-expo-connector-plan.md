# Expo 移动端连接器规划（直连 onething-server）

> 决策记录：不新写 HTTP server、不换语言。手机端直连现有 `apps/server`（onething-server），
> 一跳架构，与 `apps/web` 相同。本文档是最终落地规划。

## 1. 目标架构

```
┌──────────────┐   REST + SSE + Bearer token（一跳，LAN/隧道）
│  Expo App    │ ─────────────────────────────────────────────▶
│  (apps/mobile)│
└──────────────┘                                          ┌────────────────────────┐
                                                          │ onething-server :8787  │
                                                          │  apps/server           │
                                                          │   http.ts（路由/SSE）   │
                                                          │   runtime.ts（适配层）  │
                                                          └───────────┬────────────┘
                                                                      │ 进程内
                                                                      ▼
                                                          createOnethingBackend()
                                                          EventBus + StreamEngine
                                                          (packages/core + runtime)
```

- 手机 → `POST /api/sessions/:id/commands` → EventBus → 引擎干活
- 引擎 → EventBus → SSE 推回手机，事件格式与桌面端完全一致
- 已验证先例：`apps/web` 用同一 API 跑起了完整桌面 UI（客户端参考实现：`packages/renderer/platform/web.ts`，1571 行）

## 2. 协议事实（已从代码确认）

| 项 | 事实 | 出处 |
|---|---|---|
| 认证 | `Authorization: Bearer <ONETHING_SERVER_TOKEN>`，未配置且绑定非 loopback 会警告 | http.ts:41-82, main.ts |
| 发命令 | `POST /api/sessions/:id/commands`，body 为 SessionCommand union：`{type:'command:send-message', channel:'api', content, attachments?}`、`command:abort`、`command:edit-and-resend` 等 | http.ts:314/1904, session-commands.ts |
| 收事件 | SSE：`GET /api/sessions/:id/events` 或 `/api/events?sessionId=<id>`；两种帧：`event: session:event`（envelope）、`event: session:stream`（流 chunk） | http.ts:1979 |
| 流合并 | 服务端 16ms coalescer 合并 delta chunk，与桌面 IPCBridge 同语义——手机端直接可用 | http.ts:2002 |
| **断线续传** | SSE 支持 `?after=<seq>` 从 ring buffer 重放——移动端弱网关键能力，已内置 | http.ts:1991-1993 |
| 权限审批 | `GET /api/sessions/:id/permissions/pending` + `POST /api/permissions/:requestId/respond`；权限请求通过 SSE 实时到达 | http.ts:285-289, 370-373 |
| 中断 | `POST /api/streams/abort`（或 commands 发 `command:abort`） | http.ts:278 |
| 历史 | `POST /api/session-messages/page` 分页拉取 | http.ts:276 |
| 会话管理 | `GET/POST /api/sessions`、`/api/sessions/:id/{rename,archive,model,permission-mode}` | http.ts:273-324 |

## 3. 服务端小改（本仓库，~1 天）

- [x] **S1 安全加固** ✅：绑定非 loopback 且未设 `ONETHING_SERVER_TOKEN` 时**拒绝启动**（fail-fast，runtime 创建前退出）；显式豁免：`ONETHING_SERVER_ALLOW_INSECURE=1`（main.ts）
- [x] **S2 配对信息** ✅：启动时 stdout 打印 `[onething-server] pairing {"host":...,"port":...,"token":...}` JSON，供生成二维码（main.ts）
- [x] **S3 Last-Event-ID** ✅：SSE 同时支持 `?after=`（优先）与 `Last-Event-ID` header（降级），且 `session:event` 帧现带 `id: <sequence>` 字段，RN SSE 库自动重连可无缝续传（http.ts handleEvents + writeSse）
- [ ] 不做：CORS（RN 不强制）、WebSocket（SSE 够用）

启动方式：
```bash
bun run server:build
ONETHING_SERVER_TOKEN=<random> ONETHING_SERVER_HOST=0.0.0.0 bun run server:start
# 数据目录默认与桌面端共享；可用 ONETHING_SERVER_DATA_ROOT 覆盖
```

## 4. 移动端工程（新建，建议放 monorepo 内 `apps/mobile`）

放 monorepo 内的理由：Metro 配 `watchFolders` 后可直接 import `@shared/events` 的
`SessionEventEnvelope` / `SessionCommand` 等类型，协议永远与服务端同源，零契约漂移。

### 4.0 技术选型定稿

| 决策点 | 定案 | 理由 / 备选 |
|---|---|---|
| 工程形态 | Expo managed，Expo Go 起步 | 零原生代码即可跑通 v1；需要推送/后台能力时再 prebuild 切 dev client |
| 依赖管理 | `apps/mobile` 独立 package.json，不进根 workspaces（本仓库本来就没有） | 与 apps/web、apps/server 现状一致 |
| 类型共享 | tsconfig `paths` 指向 `packages/shared/events` + **强制 `import type`** | Babel 编译期擦除，Metro 永不解析 → 不触达 Node 依赖；将来拆仓库只需换路径/vendor |
| HTTP 层 | `expo/fetch`（SDK 52+ 原生流式 fetch） | 第一方、支持流式响应；备选 ky |
| SSE | expo/fetch 流 + 自研轻量 parser；M1 先做 spike 验证，不可行换 `react-native-sse` | 完全掌控 `?after=<seq>` 续传、心跳、退避 |
| 状态管理 | Zustand 四片：sessions / messagesBySession / permissions / connection | 轻量、免 Provider 嵌套 |
| 导航 | Expo Router：`/pairing` → `/sessions` → `/chat/[sessionId]`；权限审批走 modal | 文件式路由 |
| Token 存储 | expo-secure-store | 系统级加密存储 |
| 事件管线 | 单例 EventStreamService：SSE 生命周期 + seq 记录 + AppState 重连 + 指数退避，分发到 store | 移动端韧性核心，全部集中一处 |

技术栈：Expo SDK（最新）+ Expo Router + TypeScript + Zustand + `react-native-sse`（或 Expo fetch ReadableStream 解析 SSE）+ expo-secure-store（存 token）。

### 4.1 SDK 层（port `platform/web.ts` 的最小子集）

| 模块 | 方法 | 对应端点 |
|---|---|---|
| 连接 | `checkAuth()` | `GET /api/capabilities` |
| 会话 | `listSessions / createSession / renameSession` | `/api/sessions` 系列 |
| 历史 | `getMessagePage(sessionId, cursor)` | `POST /api/session-messages/page` |
| 命令 | `sendMessage / abort / editAndResend` | `POST /api/sessions/:id/commands` |
| 事件 | `subscribeEvents(sessionId, afterSeq, cb)` | SSE `?after=` |
| 权限 | `getPendingPermissions / respondPermission` | permissions 两个端点 |

事件 reducer：按 `SessionEventEnvelope.type` 分发——`content:part` 追加流式文本、
`step:updated` 更新步骤面板、`permission:request` 弹审批卡片、`stream:end` 收尾。
（事件全集定义在 `packages/shared/events/session-events.ts`、`stream-chunks.ts`）

### 4.2 页面

1. **配对页**：扫码（扫 S2 的 JSON）或手输 `host:port + token` → SecureStore → `checkAuth` 验证
2. **会话列表页**：列表/新建/重命名/归档；显示活跃流状态（`/api/streams/active`）
3. **聊天页**：历史分页（上拉加载）+ 输入框 + 流式渲染 + 中断按钮
4. **权限审批卡片**：`permission:request` 事件触发，approve/deny/always → `respondPermission`
5. **会话设置**：模型切换、permission-mode（对应 `/api/sessions/:id/model`、`/permission-mode`）

### 4.3 连接韧性（移动端核心难点）

- 记录每个 session 已消费的最大 `seq`；SSE 断开/AppState 回前台 → 用 `?after=<seq>` 重连补放
- iOS 后台 SSE 必断（系统限制）→ v1 接受"回前台补放"；推送通知不在 v1 范围
- 指数退避重连 + 手动下拉刷新兜底

## 5. 里程碑

| 里程碑 | 内容 | 验收 | 估时 |
|---|---|---|---|
| M0 | 服务端 S1+S2 加固 | 手机浏览器直接访问 `http://<mac>:8787/api/capabilities` 带 token 返回 200 | ✅ 完成（含 S3） |
| M1 | Expo 骨架 + SDK 连接层 | 配对成功，会话列表渲染真实数据 | ✅ 代码完成：`apps/mobile`（Expo SDK 57 + expo-router + zustand）；SSE 解析器 10/10 单测；tsc 干净；`expo export` Metro 打包通过；待真机/模拟器人工验收 |
| M2 | 聊天闭环 | 发消息 → SSE 流式渲染 → 完成；中断可用；断网恢复后 after=seq 无重放空洞 | ✅ 代码完成：EventStreamService（seq 追踪 + after 续传 + 退避 + AppState 重连）+ 纯函数 chat-reducer（桌面同款热路径/兜底语义）+ 聊天页；reducer 19 例单测全绿；tsc/打包通过；待真机验收 |
| M3 | 权限审批 + 会话设置 | 手机批准 bash 工具调用后桌面引擎继续执行 | 1-2 天 |
| M4 | 打磨 | 错误态、空态、加载态；步骤/工具调用折叠展示 | 按需 |

后续可选（不在本期）：Expo Push 通知（需要那时再加一个轻量 webhook/BFF）、图片附件、
语音输入、mDNS 自动发现、把 onething-server 嵌进 Electron 主进程（让手机指挥的就是桌面同一个 runtime）。

## 6. 风险与开放问题

1. **桌面 Electron 与 server 是两个 runtime**：手机指挥的是 server 进程的会话现场。
   - 建议日常使用形态：桌面也用 `apps/web`（:5174）连同一 server → 手机/桌面天然同步；
   - 或接受两者独立；或将 server 嵌入 Electron（中等改动，留作后续）。
2. **SSE 帧有两种**（`session:event` 与 `session:stream`），SDK 需都处理；coalescer 已做 16ms 合并，不要在上游再缓冲。
3. **`attachments` 结构**是 `JsonObject[]`，图片/文件附件的上传协议需要第一次用时对照 web.ts 对齐（v1 纯文本可跳过）。
