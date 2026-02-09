# REQ-012: E2E 优先测试计划

> Sprint 5 | 优先级: P0 | PM: Qiqi

## 1. 核心理念

**聚焦真实用户体验，而非代码覆盖率**

- ❌ 不要：Mock 太多的单元测试（容易通过但漏 bug）
- ✅ 要：E2E 测试真实 Electron + 真实数据流
- ✅ 要：每个 bug 修复附带回归 E2E 测试

## 2. 现状

| 类型 | 数量 | 问题 |
|------|------|------|
| 单元测试 | 256 | Mock 太多，漏掉了 session 切换、UIMessage 同步等真实 bug |
| E2E 测试 | 16 | 覆盖基础场景，但不够深 |

## 3. 分阶段计划

### Phase 1: 回归 E2E (P0) — 立即
**目标**: 覆盖刚修复的 bug，确保不再复发

| 场景 | 测试内容 |
|------|---------|
| Session 切换 | 创建 session → 发消息 → 切换 → 返回 → 消息仍在 |
| 空 Session | 新建 session → 显示 EmptyState → 发消息 → 显示消息 |
| 长对话滚动 | 50+ 条消息 → 滚动流畅 → 新消息自动滚到底 |
| 流式响应 | 发消息 → 看到流式输出 → 完成后消息完整 |

```typescript
// e2e/tests/session-real-flow.spec.ts
test('session switch preserves messages', async () => {
  // 创建 session A，发送消息
  // 创建 session B
  // 切换回 session A
  // 验证消息仍然显示
})
```

### Phase 2: 核心用户流程 (P0)
**目标**: 覆盖用户每天都会用的功能

| 流程 | 测试内容 |
|------|---------|
| 首次使用 | 启动 → 配置 Provider → 发第一条消息 |
| 日常对话 | 发消息 → 收回复 → 编辑 → 重发 |
| 多轮对话 | 连续多轮 → 上下文保持 → 压缩触发 |
| 中断恢复 | 流式中 → 点停止 → 状态正确 |

### Phase 3: Provider 集成 (P1)
**目标**: 测试真实 Provider 行为（用 Mock Server 模拟）

| 场景 | 测试内容 |
|------|---------|
| Provider 切换 | OpenAI → Claude → DeepSeek |
| 认证失败 | 无效 API Key → 显示错误 → 可重试 |
| 网络断开 | 请求中断网 → 优雅降级 |
| Rate Limit | 429 响应 → 显示提示 → 自动重试 |

### Phase 4: 工具系统 (P1)
**目标**: 测试 AI 工具调用真实流程

| 场景 | 测试内容 |
|------|---------|
| 读文件 | AI 请求读 → 用户确认 → 返回内容 |
| 执行命令 | AI 请求执行 → 用户拒绝 → 换方案 |
| 连续工具 | 多个工具调用 → 依次执行 → 最终回复 |

### Phase 5: 边界场景 (P2)
**目标**: 测试异常和边界情况

| 场景 | 测试内容 |
|------|---------|
| 大消息 | 100KB 消息 → 正常渲染 |
| 特殊字符 | Emoji / 代码块 / LaTeX → 正确显示 |
| 快速操作 | 快速切换 session → 不崩溃 |
| 内存压力 | 100+ session → 性能可接受 |

## 4. 实施原则

### E2E 测试规范
```typescript
// e2e/tests/xxx.spec.ts
import { test, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'

test.describe('Feature Name', () => {
  test('user can do X', async ({ page }) => {
    // 1. Setup - 模拟真实状态
    // 2. Action - 执行用户操作
    // 3. Assert - 验证 UI 结果
  })
})
```

### Bug 修复流程
1. **复现**: 写一个会失败的 E2E 测试
2. **修复**: 改代码
3. **验证**: 测试通过
4. **提交**: 测试和修复一起

### Mock 策略
- **Mock Provider API** — 用本地 HTTP server
- **不 Mock Electron** — 用真实 Electron
- **不 Mock IPC** — 走真实 IPC 通道
- **不 Mock Store** — 用真实 Pinia store

## 5. 工作量

| Phase | E2E 数 | 工时 |
|-------|--------|------|
| Phase 1 回归 | 6 | 1h |
| Phase 2 核心流程 | 10 | 2h |
| Phase 3 Provider | 8 | 2h |
| Phase 4 工具 | 6 | 2h |
| Phase 5 边界 | 5 | 1h |
| **总计** | **35** | **8h** |

## 6. 成功标准

- [ ] 今日修复的 bug 都有 E2E 覆盖
- [ ] 核心用户流程 100% E2E 覆盖
- [ ] E2E 运行时间 < 2 分钟
- [ ] CI 每次 PR 都跑 E2E

---

*Updated: 2026-02-09 by Qiqi — 聚焦 E2E，删除无效单元测试目标*
