# ISSUES.md - 问题与技术债清单

> 基于 2026-02-07 架构分析识别的问题

## 🔴 高优先级

### ~~1. 双消息系统并存~~ ✅ 已修复
**修复**: REQ-005 统一消息系统 + REQ-009 UI 迁移到 UIMessage
**状态**: ✅ 2026-02-08 已完成

### ~~2. Store 循环依赖~~ ✅ 已修复
**修复**: REQ-006 extractPath 提取 + facade 拆分
**状态**: ✅ 2026-02-08 已完成

### 3. Agent 双存储合并逻辑复杂
**位置**: `services/custom-agent/loader.ts`
**问题**: 文件存储 + Store 存储运行时合并，容易混淆
**建议**: 统一存储方式，或明确文档说明

## 🟡 中优先级

### 4. ~~Memory 系统未接入主流程~~ ✅ 已修复
**位置**: `src/main/ipc/chat/tool-loop.ts`
**修复**: 在 executeStreamGeneration() 中调用 textLoadMemoryForChat()
**状态**: ✅ 2026-02-07 已修复并合并

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

### ~~9. 错误处理不统一~~ ✅ 已修复
**修复**: REQ-007 统一错误处理 (classifyError + error-wrapper + ErrorMessage.vue)
**状态**: ✅ 2026-02-08 已完成

---

## 📊 统计

| 级别 | 数量 |
|------|------|
| 🔴 高 | 3 |
| 🟡 中 | 3 |
| 🟢 低 | 3 |

---

*Last updated: 2026-02-07*

---

## 🎨 Tool UI/UX 改进 (P2)

> 来源: 用户反馈 2026-02-08

### 问题

1. **拒绝 Tool 无法输入原因**
   - 当前只有 Allow / Reject 按钮
   - 用户拒绝时应该能输入拒绝原因
   - AI 可以根据原因调整策略

2. **Loading 动画不够精致**
   - 当前的转圈动画太普通
   - 考虑使用 Lottie 或更精致的 CSS 动画
   - 参考: Linear, Raycast 的 loading 效果

3. **Tool Steps 展示不够友好**
   - ToolCallItem 的容器样式需要优化
   - 步骤之间的关系不够清晰
   - 考虑用时间线或卡片式展示

### 改进方向

- 添加拒绝原因输入框（可选）
- 设计更优雅的状态动画（idle → running → done/error）
- 重新设计 Steps 容器的视觉层次
