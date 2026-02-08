# REQ-010: E2E 端到端测试

> Sprint 4 | 优先级: P0 | PM: Qiqi

## 1. 背景

目前有 256 个单元/集成测试，但都是在 Node 环境跑的 mock 测试。没有任何测试真正启动 Electron 应用、操作 UI、验证用户可见的行为。

Sprint 3 的流式渲染 bug（`ca92fc8`）就是典型案例——单元测试全过，但用户看到空白消息。E2E 测试能捕获这类问题。

## 2. 目标

- 建立 Electron E2E 测试框架
- 覆盖核心用户流程（启动、对话、设置）
- 可在 CI 和本地运行
- 不依赖真实 AI API（mock provider 响应）

## 3. 技术选型

### 方案: Playwright + electron-playwright

**理由:**
- Playwright 原生支持 Electron（`electron.launch()`）
- 与现有 Vitest 不冲突
- 社区活跃，文档完善
- 支持截图、录屏、trace 用于调试

**依赖:**
```
@playwright/test
```

Playwright 内置 Electron 支持，不需要额外包。

## 4. 架构设计

```
e2e/
├── fixtures/
│   ├── app.ts          # Electron app launch fixture
│   └── mock-provider.ts # Mock AI provider (本地 HTTP server)
├── helpers/
│   ├── selectors.ts    # 页面元素选择器常量
│   └── wait.ts         # 等待工具函数
├── tests/
│   ├── app-launch.spec.ts      # 启动测试
│   ├── session-crud.spec.ts    # 会话增删改
│   ├── chat-flow.spec.ts       # 发消息 + 收回复
│   ├── streaming.spec.ts       # 流式渲染验证
│   ├── settings.spec.ts        # 设置页面操作
│   ├── error-handling.spec.ts  # 错误展示 + 重试
│   └── agent-switch.spec.ts    # 切换 Agent
├── playwright.config.ts
└── README.md
```

### 4.1 App Launch Fixture

```typescript
// e2e/fixtures/app.ts
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],  // electron-vite 入口
    env: {
      ...process.env,
      NODE_ENV: 'test',
      E2E_TESTING: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}
```

### 4.2 Mock Provider

E2E 测试不调用真实 AI API。方案：

**方案 A: 本地 HTTP Mock Server**
- 启动一个本地 HTTP server 模拟 OpenAI 兼容 API
- 测试前在设置中配置 provider 指向 `http://localhost:PORT`
- 可控制响应内容、延迟、错误

**方案 B: Electron IPC 拦截**
- 在 `E2E_TESTING=1` 时，main 进程拦截 provider 调用
- 返回预设响应
- 更简单但耦合度高

**推荐: 方案 A** — 更真实，不侵入生产代码。

```typescript
// e2e/fixtures/mock-provider.ts
import http from 'http'

export function createMockProvider(port = 18321) {
  const server = http.createServer((req, res) => {
    if (req.url?.includes('/chat/completions')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      // 模拟 SSE 流式响应
      const chunks = ['Hello', ' from', ' mock', ' AI!']
      chunks.forEach((chunk, i) => {
        setTimeout(() => {
          res.write(`data: ${JSON.stringify({
            choices: [{ delta: { content: chunk }, index: 0 }]
          })}\n\n`)
          if (i === chunks.length - 1) {
            res.write('data: [DONE]\n\n')
            res.end()
          }
        }, i * 50)
      })
    }
  })
  return {
    start: () => new Promise<void>(resolve => server.listen(port, resolve)),
    stop: () => new Promise<void>(resolve => server.close(() => resolve())),
    port,
  }
}
```

### 4.3 测试数据隔离

每次测试使用独立的 userData 目录，避免污染：

```typescript
const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    ELECTRON_USER_DATA: tmpDir, // 临时目录
  },
})
```

需要在 main 进程中支持 `ELECTRON_USER_DATA` 环境变量覆盖默认路径。

## 5. 核心测试用例

### 5.1 应用启动 (`app-launch.spec.ts`)

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 冷启动 | 窗口出现、主界面渲染完成 |
| 2 | 启动时间 | < 3 秒（从 launch 到 DOM ready） |
| 3 | 无配置首次启动 | 显示欢迎/设置引导 |

### 5.2 会话管理 (`session-crud.spec.ts`)

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 新建会话 | 侧栏出现新会话，输入框可用 |
| 2 | 重命名会话 | 名称更新后持久化 |
| 3 | 删除会话 | 从列表消失，切换到其他会话 |
| 4 | 切换会话 | 消息列表切换正确 |

### 5.3 聊天流程 (`chat-flow.spec.ts`)

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 发送消息 | 用户消息出现在列表 |
| 2 | 收到回复 | AI 回复文本可见（mock provider） |
| 3 | 流式渲染 | 文本逐步出现，最终完整显示 |
| 4 | 多轮对话 | 消息按顺序排列 |

### 5.4 流式渲染 (`streaming.spec.ts`)

> **重点测试** — Sprint 3 bug 的根源

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 文本流式显示 | 每个 chunk 到达后 UI 更新 |
| 2 | 推理内容显示 | reasoning 区块可见 |
| 3 | 工具调用显示 | tool-call → tool-result 状态变化 |
| 4 | 流完成后内容持久 | 刷新后消息仍在 |

### 5.5 错误处理 (`error-handling.spec.ts`)

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | API 错误 | 错误消息显示，有重试按钮 |
| 2 | 网络断开 | 友好提示，不崩溃 |
| 3 | 重试成功 | 点击重试后正常收到回复 |

### 5.6 设置页面 (`settings.spec.ts`)

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 打开设置 | 设置面板出现 |
| 2 | 切换主题 | 背景色变化 |
| 3 | 配置 Provider | API Key 保存后持久化 |

## 6. 实施计划

### Phase 1: 框架搭建
- 安装 Playwright
- 创建 app fixture + mock provider
- 支持 `ELECTRON_USER_DATA` 环境变量
- 完成 `app-launch.spec.ts`（验证框架可用）

### Phase 2: 核心流程
- `session-crud.spec.ts`
- `chat-flow.spec.ts`
- `streaming.spec.ts`

### Phase 3: 错误 + 设置
- `error-handling.spec.ts`
- `settings.spec.ts`
- `agent-switch.spec.ts`

## 7. CI 集成

```yaml
# GitHub Actions
e2e:
  runs-on: macos-latest  # Electron 需要 GUI 环境
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npx playwright install
    - run: npm run e2e
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: e2e-traces
        path: e2e/test-results/
```

macOS runner 支持 GUI，Linux 需要 `xvfb-run`。

## 8. 影响分析

### 需要修改的文件

| 文件 | 改动 |
|------|------|
| `package.json` | 添加 `@playwright/test`，添加 `e2e` script |
| `playwright.config.ts` | 新建 |
| `src/main/index.ts` | 支持 `ELECTRON_USER_DATA` 覆盖 |
| `e2e/` 目录 | 全部新建 |

### 不需要修改的文件
- 现有单元测试不受影响
- 生产代码零侵入（仅 env 变量判断）

## 9. 成功标准

- [ ] Playwright 框架可用，`npm run e2e` 一键运行
- [ ] 至少 15 个 E2E 测试覆盖核心流程
- [ ] 流式渲染有专项测试（防止 Sprint 3 类 bug 再现）
- [ ] Mock provider 支持正常/错误/超时场景
- [ ] 测试数据隔离，不污染用户环境
- [ ] CI 可运行（或有明确的 CI 配置方案）

---

*Created: 2026-02-08 by Qiqi*
