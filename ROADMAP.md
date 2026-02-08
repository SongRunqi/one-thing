# ROADMAP.md - 0neThing 迭代路线图

> PM: Qiqi | 更新: 2026-02-08

## 🎯 目标

将 0neThing 从「可用」提升到「稳定、可维护、功能完善」

---

## 📅 迭代计划

### Sprint 1: 稳固基础 ✅
| 任务 | 状态 |
|------|------|
| Vitest 测试框架 | ✅ Done |
| TypeScript 严格模式 | ✅ Done |
| InputBox 组件拆分 | ✅ Done |
| IPC Router 层 | ✅ Done |

### Sprint 2: 功能增强 ✅
| 任务 | 状态 |
|------|------|
| Memory 系统接入主流程 | ✅ Done |
| Web 搜索工具 (Brave API) | ✅ Done |
| Tool Reject 增强 (REQ-001) | ✅ Done |
| CSP 修复 (生产环境) | ✅ Done |

### Sprint 3: 代码健康 ✅
| 任务 | 状态 |
|------|------|
| REQ-005 统一消息系统 (4 phases) | ✅ Done |
| REQ-006 Store 循环依赖 | ✅ Done |
| REQ-007 统一错误处理 (4 phases) | ✅ Done |
| REQ-009 UI 迁移到 UIMessage (3 phases) | ✅ Done |
| 测试覆盖: 134→256 tests | ✅ Done |

### Sprint 4: 优化打磨 (当前)
**目标**: 性能优化 + 用户体验 + 稳定性

| 任务 | 优先级 | 状态 |
|------|--------|------|
| E2E 测试 (Playwright) | P1 | Todo |
| Token 用量可视化 | P1 | Todo |
| Agent 双存储简化 | P2 | Todo |
| Provider 缓存失效机制 | P2 | Todo |
| 启动速度优化 | P2 | Todo |
| 大对话性能优化 | P2 | Todo |
| 设置导入/导出 | P3 | Todo |

---

## 📌 当前焦点

**Sprint 4** — 需求规划中

---

## 📝 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 02-07 | Vitest + strict TS | ESM 支持好，提前发现错误 |
| 02-07 | IPC Router 抽象 | 统一调用模式，便于测试 |
| 02-08 | prd/dev/feature 分支策略 | 清晰的发布流程 |
| 02-08 | REQ-005→006→007 执行顺序 | 依赖关系决定 |
| 02-08 | role:'error' → errorDetails | 保持类型系统一致 |
| 02-08 | UIMessage 替代 ChatMessage (UI层) | 消除双系统，减少 bug |

---

*Maintained by: Qiqi (PM)*
