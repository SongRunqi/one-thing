# ISSUES.md - 问题与技术债清单

> 基于 2026-02-07 架构分析识别的问题

## 🔴 高优先级

### 1. 双消息系统并存
**位置**: `stores/chat.ts` vs `stores/ui-messages.ts`
**问题**: 两套消息格式（ChatMessage vs UIMessage）同时存在，增加维护成本
**建议**: 完成迁移到 AI SDK 5.x UIMessage 格式，移除旧系统

### 2. Store 循环依赖
**位置**: `chat ↔ sessions`, `settings ↔ themes`
**问题**: 虽然用动态 import 解决了，但增加了代码复杂度
**建议**: 重构依赖关系，考虑事件总线或依赖注入

### 3. Agent 双存储合并逻辑复杂
**位置**: `services/custom-agent/loader.ts`
**问题**: 文件存储 + Store 存储运行时合并，容易混淆
**建议**: 统一存储方式，或明确文档说明

## 🟡 中优先级

### 4. Memory 系统未接入主流程 ⚠️ 已验证
**位置**: `src/main/ipc/chat/memory-helpers.ts`
**问题**: `textLoadMemoryForChat` 函数已实现，但未在 tool-loop.ts 中被调用
**状态**: Memory 系统代码完整，但未接入对话流程
**建议**: 在 executeStreamGeneration() 中调用 textLoadMemoryForChat()

### 5. 工具循环最大100轮
**位置**: `tool-loop.ts` MAX_TOOL_TURNS = 100
**问题**: 可能导致长时间无响应或资源消耗
**建议**: 添加用户可见的进度提示

### 6. Provider 实例缓存 5 分钟 TTL
**位置**: `providers/registry.ts`
**问题**: 可能导致 API Key 更新后仍使用旧实例
**建议**: 增加主动失效机制

## 🟢 低优先级 / 改进建议

### 7. InputBox 仍有 743 行
**位置**: `components/chat/InputBox.vue`
**问题**: 虽然从 1339 行拆分了，但仍较大
**建议**: 继续拆分 picker 和 action 逻辑

### 8. 缺少端到端测试
**问题**: 只有单元测试框架，无 E2E 测试
**建议**: 添加 Playwright 进行关键流程测试

### 9. 错误处理不统一
**位置**: 各 IPC handler
**问题**: 错误格式和处理方式不一致
**建议**: 统一错误类型和处理模式

---

## 📊 统计

| 级别 | 数量 |
|------|------|
| 🔴 高 | 3 |
| 🟡 中 | 3 |
| 🟢 低 | 3 |

---

*Last updated: 2026-02-07*
