# REQ-006: Store 循环依赖清理

> 状态: 已分析 | 创建: 2026-02-08 | 更新: 2026-02-08 | PM: Qiqi

## 1. 背景

`src/main/stores/` 和 `src/main/tools/` 之间存在跨层双向依赖。虽然 Node.js 模块解析可以处理菱形依赖（不会运行时报错），但这违反了分层架构原则：**stores（数据层）不应依赖 tools（业务逻辑层）**。

## 2. 现状问题

### 2.1 跨层依赖关系

```
stores/sessions.ts:22   ──import──→ tools/core/sandbox.ts  (expandPath)
stores/workspaces.ts:14 ──import──→ tools/core/sandbox.ts  (expandPath)
                                            │
tools/core/sandbox.ts:11 ──import──→ stores/settings.ts    (getSettings)
tools/builtin/plan.ts:15 ──import──→ stores/sessions.ts    (updateSessionPlan, getSession)
tools/builtin/bash.ts    ──import──→ stores/settings.ts    (getSettings)
tools/builtin/custom-agent.ts ──import──→ stores/custom-agents.ts
```

**核心问题**: `expandPath` 是一个纯工具函数（路径展开 `~` → 绝对路径），但被放在 `tools/core/sandbox.ts` 里。而 `sandbox.ts` 又依赖 `stores/settings.ts` 的 `getSettings()` 获取 home 目录，形成 stores ↔ tools 双向引用。

### 2.2 `store.ts` 门面模式问题

`src/main/store.ts` 作为门面重新导出 `stores/index.ts` 的所有内容：
- **14 个文件** 通过 `import * as store from '../../store.js'` 使用
- 导出 **60+ 个函数**，接口过于庞大
- 任何 `stores/` 修改都触发大范围重编译
- 消费者实际依赖不明确

### 2.3 完整的 stores 内部依赖图

```
paths.ts          ← 基础模块，无内部依赖
app-state.ts      ← 依赖 paths
settings.ts       ← 依赖 paths
models-cache.ts   ← 依赖 paths
lru-cache.ts      ← 无依赖（纯数据结构）
workspaces.ts     ← 依赖 paths, app-state, tools/core/sandbox ⚠️
sessions.ts       ← 依赖 paths, app-state, workspaces, settings, tools/core/sandbox ⚠️, lru-cache
custom-agents.ts  ← 依赖 paths
plugins.ts        ← 依赖 electron (app)
index.ts          ← 聚合导出 + 迁移逻辑
```

## 3. 重构方案

### Step 1: 提取 `expandPath` 到共享工具模块

**创建** `src/main/utils/path-utils.ts`:
```typescript
// 从 tools/core/sandbox.ts 提取
// expandPath 改为接收 homeDir 参数，不再直接 import getSettings
export function expandPath(inputPath: string, homeDir: string): string {
  // ... 原有逻辑，但 homeDir 由调用方传入
}
```

**修改调用方**:
- `stores/sessions.ts:22` → `import { expandPath } from '../utils/path-utils.js'`
- `stores/workspaces.ts:14` → `import { expandPath } from '../utils/path-utils.js'`
- `tools/core/sandbox.ts` → `import { expandPath } from '../../utils/path-utils.js'`，调用时传入 `getSettings().homeDir`

### Step 2: 拆分 `store.ts` 门面（可选，建议渐进）

将 14 个 `import * as store` 改为直接引用具体模块：

```typescript
// 之前
import * as store from '../../store.js'
store.getSession(id)

// 之后
import { getSession } from '../stores/sessions.js'
getSession(id)
```

## 4. 影响文件列表

### Step 1 必须修改

| 文件 | 修改内容 |
|------|----------|
| `src/main/utils/path-utils.ts` | **新建**，从 sandbox.ts 提取 expandPath |
| `src/main/tools/core/sandbox.ts` | 移除 expandPath 定义，改为 import |
| `src/main/stores/sessions.ts` | 行 `:22`，import 改为 `utils/path-utils` |
| `src/main/stores/workspaces.ts` | 行 `:14`，import 改为 `utils/path-utils` |

### Step 2 涉及修改（14 个文件）

所有 `import * as store from '../../store.js'` 的文件，改为直接 import 具体 store 模块。

## 5. 验收标准

1. [ ] `stores/` 目录下无任何 `import from 'tools/'` 语句
2. [ ] `expandPath` 位于 `src/main/utils/path-utils.ts`，不依赖任何 store
3. [ ] `expandPath` 接收 `homeDir` 参数而非内部调用 `getSettings()`
4. [ ] 所有现有功能正常，无运行时回归
5. [ ] TypeScript 编译无错误

## 6. 风险与缓解

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| import 路径改错导致运行时崩溃 | **低** | TypeScript 编译会捕获；改动纯机械性 |
| `expandPath` 签名变更遗漏调用方 | **低** | 全局搜索 `expandPath` 确认所有调用点 |

## 7. 预估

Step 1: ~1h | Step 2: ~2h（机械性修改，可渐进）

**优先级**: P2 — 建议在消息系统重构（REQ-005）之前完成，减少后续改动的依赖复杂度。
