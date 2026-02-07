# ROADMAP.md - 0neThing 迭代路线图

> PM: Qiqi | 更新: 2026-02-07

## 🎯 目标

将 0neThing 从「可用」提升到「稳定、可维护、功能完善」

---

## 📅 迭代计划

### Sprint 1: 稳固基础 (本周)
**目标**: 巩固今天的重构成果，确保稳定性

| 任务 | 优先级 | 状态 |
|------|--------|------|
| ✅ Vitest 测试框架 | P0 | Done |
| ✅ TypeScript 严格模式 | P0 | Done |
| ✅ InputBox 组件拆分 | P1 | Done |
| ✅ IPC Router 层 | P1 | Done |
| 📝 PROJECT_STATUS.md | P0 | In Progress |
| 📝 核心流程单元测试 | P1 | Todo |
| 📝 验证 Memory 系统使用情况 | P2 | Todo |

### Sprint 2: 功能增强 (下周)
**目标**: 添加用户期待的新功能 + 修复 Memory

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 🧠 Memory 系统接入主流程 | P0 | ✅ Done |
| 🔍 Web 搜索工具 | P1 | ✅ Done |
| 📊 Token 用量可视化 | P2 | Todo |
| 🔧 设置导入/导出 | P2 | Todo |

### Sprint 3: 代码健康 (后续)
**目标**: 解决 ISSUES.md 中的技术债

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 统一消息系统 (UIMessage 迁移) | P0 | Todo |
| 解决 Store 循环依赖 | P1 | Todo |
| 统一错误处理 | P1 | Todo |
| E2E 测试 (Playwright) | P2 | Todo |

### Sprint 4: 优化打磨 (未来)
**目标**: 性能和体验优化

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 启动速度优化 | P1 | Todo |
| 大对话性能优化 | P1 | Todo |
| 暗黑模式完善 | P2 | Todo |

---

## 📌 当前焦点

**Sprint 1** - 稳固基础

下一步行动:
1. 完成 PROJECT_STATUS.md
2. 为 chatStore.sendMessage 流程编写测试
3. 验证 Memory 系统是否正常工作

---

## 📝 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-07 | 采用 Vitest 而非 Jest | 更好的 ESM 支持，与 Vite 集成 |
| 2026-02-07 | TypeScript strict mode | 提前发现类型错误 |
| 2026-02-07 | IPC Router 抽象 | 统一 IPC 调用模式，便于测试 |

---

*Maintained by: Qiqi (PM)*
