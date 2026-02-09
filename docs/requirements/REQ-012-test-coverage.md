# REQ-012: 测试覆盖率提升计划

> Sprint 5 | 优先级: P1 | PM: Qiqi

## 1. 现状分析

### 当前测试统计
| 类型 | 文件数 | 测试数 |
|------|--------|--------|
| 单元测试 | 13 | 256 |
| E2E 测试 | 8 | ~16 |

### 已覆盖模块
- ✅ `src/shared/` — 消息转换、错误处理、IPC Router
- ✅ `src/main/tools/` — 沙箱、替换器、注册表
- ✅ `src/main/permission/` — 权限系统
- ✅ `src/renderer/stores/chat.ts` — 部分（流式、错误）
- ✅ E2E — 启动、会话、聊天流、设置

### 未覆盖/覆盖不足的关键模块
| 模块 | 行数 | 风险 | 优先级 |
|------|------|------|--------|
| `stores/chat.ts` (session 切换、UIMessage 同步) | 1300+ | **高** | P0 |
| `stores/sessions.ts` | 400+ | 高 | P1 |
| `main/ipc/sessions.ts` | 380 | 高 | P1 |
| `main/ipc/chat.ts` | 500+ | 高 | P1 |
| `main/services/` | 2000+ | 中 | P2 |
| `composables/useChatSession.ts` | 150 | 中 | P2 |
| 虚拟滚动渲染 | - | **高** | P0 |

## 2. 目标

| 指标 | 当前 | 目标 |
|------|------|------|
| 单元测试数 | 256 | 400+ |
| 关键路径覆盖 | ~40% | 80%+ |
| 回归测试 | 无 | 每个 bug 修复附带 |
| E2E 场景 | 16 | 30+ |

## 3. 分阶段计划

### Phase 1: 回归测试 + 关键路径 (P0)
**目标**: 覆盖刚修复的 bug，防止回归

1. **Session/UIMessage 同步测试**
   ```typescript
   // stores/__tests__/chat-session-sync.test.ts
   - setSessionMessages 应同步到 sessionUIMessages
   - loadMessages 后 getSessionUIMessages 返回正确数据
   - session 切换后消息正确加载
   ```

2. **虚拟滚动集成测试**
   ```typescript
   // components/__tests__/MessageList-virtual.test.ts
   - virtualItems 索引不越界
   - messages 变化时 virtualizer 正确更新
   - 空消息列表显示 EmptyState
   ```

3. **E2E: Session 切换**
   ```typescript
   // e2e/tests/session-switch.spec.ts
   - 创建多个 session
   - 切换 session 后消息正确显示
   - 返回原 session 消息仍在
   ```

### Phase 2: Store 核心逻辑 (P1)
**目标**: 覆盖 Pinia stores 的核心业务逻辑

1. **chat.ts 完整测试**
   - `sendMessage` 流程
   - `editAndResend` 流程
   - `handleStreamChunk` 各类型
   - `handleStreamFinish` 状态清理
   - 分支 (branch) 逻辑

2. **sessions.ts 测试**
   - CRUD 操作
   - 排序、置顶、归档
   - currentSessionId 切换

3. **settings.ts 测试**
   - 加载/保存
   - Provider 配置
   - 主题切换

### Phase 3: IPC Handlers (P1)
**目标**: 覆盖主进程 IPC 处理

1. **sessions.ts**
   - createSession / deleteSession
   - switchSession
   - updateSession

2. **chat.ts**
   - sendMessageStream
   - 消息持久化
   - 流中断处理

3. **models.ts**
   - Provider 注册
   - 模型列表获取
   - 能力查询

### Phase 4: Services 层 (P2)
**目标**: 覆盖业务服务

1. **memory-service.ts**
   - 向量搜索
   - 记忆提取
   - 用户画像

2. **custom-agent-service.ts**
   - Agent CRUD
   - Agent 调用

3. **prompt-service.ts**
   - 模板加载
   - 变量替换

### Phase 5: E2E 扩展 (P2)
**目标**: 覆盖更多用户场景

1. **多 Provider 切换**
2. **工具调用流程**
3. **Memory 交互**
4. **自定义 Agent**
5. **MCP 连接**

## 4. 实施规范

### 测试文件命名
```
src/renderer/stores/__tests__/chat.test.ts          # 单元测试
src/renderer/stores/__tests__/chat-*.test.ts        # 按功能拆分
src/renderer/components/__tests__/Component.test.ts # 组件测试
e2e/tests/feature.spec.ts                           # E2E 测试
```

### 每个 Bug 修复必须附带
1. 复现 bug 的测试用例（先写，确保失败）
2. 修复代码
3. 测试通过

### Mock 原则
- 单元测试：Mock 外部依赖（IPC、API）
- 集成测试：Mock 最外层（API）
- E2E 测试：Mock Provider，真实 Electron

## 5. 工作量估算

| Phase | 测试数 | 工时 |
|-------|--------|------|
| Phase 1 | ~30 | 2h |
| Phase 2 | ~60 | 4h |
| Phase 3 | ~40 | 3h |
| Phase 4 | ~30 | 3h |
| Phase 5 | ~15 | 2h |
| **总计** | **~175** | **14h** |

## 6. 成功标准

- [ ] 所有修复的 bug 有对应回归测试
- [ ] chat store 核心路径覆盖 > 80%
- [ ] sessions store 覆盖 > 70%
- [ ] E2E 覆盖主要用户流程
- [ ] CI 运行时间 < 3 分钟

## 7. 依赖

- 安装 `@vitest/coverage-v8` 生成覆盖率报告
- REQ-010 E2E 框架已就绪 ✅

---

*Created: 2026-02-09 by Qiqi*
