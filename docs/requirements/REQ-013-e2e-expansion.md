# REQ-013: E2E 测试扩展 — 未覆盖场景

> Sprint 5 | 优先级: P1 | PM: Qiqi

## 1. 目标

覆盖当前 E2E 测试缺失的用户场景，提升整体测试质量。

> Memory 系统暂不覆盖，后续单独安排。

## 2. 分阶段计划

### Phase 1: MCP 连接
**文件**: `e2e/tests/mcp-connection.spec.ts`

| 场景 | 测试内容 |
|------|---------|
| 添加 MCP Server | 设置页 → 添加 MCP → 连接成功 |
| 连接失败 | 无效地址 → 显示错误 → 可重试 |
| 断开重连 | 断开 → 重新连接 → 恢复 |
| MCP 工具列表 | 连接后 → 工具列表正确显示 |

### Phase 2: 自定义 Agent
**文件**: `e2e/tests/custom-agent.spec.ts`

| 场景 | 测试内容 |
|------|---------|
| 创建 Agent | 填写名称/Prompt → 保存 → 列表中出现 |
| 编辑 Agent | 修改 Prompt → 保存 → 生效 |
| 删除 Agent | 删除 → 确认 → 从列表消失 |
| 切换 Agent | 选择不同 Agent → 对话使用对应 Prompt |
| Pin 到侧栏 | Pin → 侧栏显示 → Unpin → 消失 |

### Phase 3: 工作区管理
**文件**: `e2e/tests/workspace.spec.ts`

| 场景 | 测试内容 |
|------|---------|
| 创建工作区 | 新建 → 命名 → 出现在切换器 |
| 切换工作区 | 切换 → session 列表隔离 |
| 删除工作区 | 删除 → 确认 → 消失 |
| 工作区头像 | 设置 Emoji 头像 → 正确显示 |

### Phase 4: 主题系统
**文件**: `e2e/tests/theme.spec.ts`

| 场景 | 测试内容 |
|------|---------|
| 切换主题 | 明/暗/跟随系统 → UI 正确变化 |
| 自定义主题 | 创建自定义主题 → 应用 → 颜色正确 |
| 主题持久化 | 切换主题 → 重启 → 主题保持 |

### Phase 5: 快捷键
**文件**: `e2e/tests/keyboard-shortcuts.spec.ts`

| 场景 | 测试内容 |
|------|---------|
| 新建会话 | Cmd+N → 新 session |
| 打开设置 | Cmd+, → 设置页 |
| 发送消息 | Enter → 发送 |
| 换行 | Shift+Enter → 换行不发送 |
| 切换会话 | Cmd+上/下 → 切换 session |

## 3. 实施规范

- 所有测试基于现有 E2E 框架（Playwright + Electron）
- Mock Provider 模拟 AI 响应
- 每个 Phase 独立提交
- 测试文件命名: `e2e/tests/feature.spec.ts`

## 4. 工作量

| Phase | 测试数 | 工时 |
|-------|--------|------|
| Phase 1 MCP | 4 | 1h |
| Phase 2 Agent | 5 | 1.5h |
| Phase 3 工作区 | 4 | 1h |
| Phase 4 主题 | 3 | 1h |
| Phase 5 快捷键 | 5 | 1h |
| **总计** | **21** | **5.5h** |

## 5. 成功标准

- [ ] 每个 Phase 测试全部通过
- [ ] E2E 总数达到 70+
- [ ] 覆盖所有主要用户交互路径

## 6. 依赖

- REQ-012 E2E 框架已就绪 ✅
- Mock Provider 已增强 ✅

---

*Created: 2026-02-09 by Qiqi*
